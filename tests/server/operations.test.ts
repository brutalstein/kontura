import { beforeAll, describe, expect, it } from "vitest";
import type { DB } from "@/server/db";
import { deleteOperation, listCatalog, saveOperation } from "@/server/catalog";
import { loadOrg } from "@/server/core";
import { addSavedPart, savePartRevision } from "@/server/parts";
import { exportOrgData } from "@/server/privacy";
import { addItem, createQuote, getPublicQuote, getQuote, saveCustomer, sendQuote, updateItem } from "@/server/quotes";
import { freshDb, makeOrg, member, plateDxf } from "./helpers";

let db: DB;
beforeAll(async () => { db = await freshDb(); });

async function setup() {
  const a = await makeOrg(db);
  const customer = await saveCustomer(a.ctx, { name: "Kapsam Müşterisi" });
  const q = await createQuote(a.ctx, { customerId: customer.id });
  const item = await addItem(a.ctx, q.id, { name: "plaka.dxf", content: plateDxf() });
  await updateItem(a.ctx, item.id, { thickness: 2, qty: 10 });
  const line = async () => (await getQuote(a.ctx, q.id)).items.find((i) => i.id === item.id)!;
  return { ...a, customer, q, item, line };
}

describe("operation catalogue", () => {
  it("charges a named operation per part plus its batch fee once, inside margin and discount", async () => {
    const a = await setup();
    const before = (await a.line()).result!;
    const op = await saveOperation(a.ctx, { name: "Havşa", unit: "adet", price: 5, setupFee: 100 });
    await updateItem(a.ctx, a.item.id, { ops: [{ opId: op.id, qty: 2 }] });
    const after = await a.line();
    // 5 TL x 2 per part x 10 parts + 100 TL once
    expect(after.result!.extraCost).toBeCloseTo(before.extraCost + 200, 2);
    const { rules } = await loadOrg(db, a.ctx.orgId);
    const expected = 200 * (1 + rules.marginPct / 100) * (1 - after.result!.discountPct / 100);
    expect(after.result!.lineTotal - before.lineTotal).toBeCloseTo(expected, 1);
    expect(after.ops).toEqual([{ opId: op.id, name: "Havşa", unit: "adet", qty: 2 }]);
    expect((await listCatalog(a.ctx)).operations.map((o) => o.name)).toEqual(["Havşa"]);
  });

  it("does not charge sheet the customer supplies, and never nests it with the shop's own stock", async () => {
    const a = await setup();
    const own = (await a.line()).result!;
    expect(own.materialCost).toBeGreaterThan(0);
    await updateItem(a.ctx, a.item.id, { customerMaterial: true });
    const labour = await a.line();
    expect(labour.result!.materialCost).toBe(0);
    expect(labour.result!.machineCost).toBe(own.machineCost);
    expect(labour.result!.lineTotal).toBeLessThan(own.lineTotal);

    const second = await addItem(a.ctx, a.q.id, { name: "plaka2.dxf", content: plateDxf() });
    await updateItem(a.ctx, second.id, { thickness: 2, qty: 10, customerMaterial: false });
    const { quote } = await getQuote(a.ctx, a.q.id);
    if (!quote.totals?.ok) throw new Error("quote should price");
    expect(quote.totals.stocks).toHaveLength(2);
    expect(quote.totals.stocks.filter((s) => s.label.includes("müşteri malzemesi"))).toHaveLength(1);
  });

  it("rejects another organisation's operation and read-only members", async () => {
    const a = await setup();
    const b = await makeOrg(db);
    const foreign = await saveOperation(b.ctx, { name: "Boya", unit: "m2", price: 300, setupFee: 0 });
    await expect(updateItem(a.ctx, a.item.id, { ops: [{ opId: foreign.id, qty: 1 }] })).rejects.toThrow("İşlem bulunamadı");
    const viewer = await member(db, a.ctx.orgId, "viewer");
    await expect(saveOperation(viewer, { name: "Diş", unit: "adet", price: 3, setupFee: 0 })).rejects.toThrow();
    await expect(deleteOperation(a.ctx, foreign.id)).resolves.toBeUndefined();
    expect((await listCatalog(b.ctx)).operations).toHaveLength(1); // a's delete did not touch b's row
  });

  it("refuses to price or send a line whose operation was removed from the catalogue", async () => {
    const a = await setup();
    const op = await saveOperation(a.ctx, { name: "Toz boya", unit: "m2", price: 250, setupFee: 400 });
    await updateItem(a.ctx, a.item.id, { ops: [{ opId: op.id, qty: 0.04 }] });
    await deleteOperation(a.ctx, op.id);
    await updateItem(a.ctx, a.item.id, { qty: 11 }); // any edit reprices with today's catalogue
    const { quote } = await getQuote(a.ctx, a.q.id);
    expect(quote.totals).toMatchObject({ ok: false });
    if (quote.totals?.ok === false) expect(quote.totals.error).toContain("Toz boya");
    await expect(sendQuote(a.ctx, a.q.id)).rejects.toThrow("Toz boya");
  });

  it("shows the customer the scope of work but none of the rates behind it", async () => {
    const a = await setup();
    const op = await saveOperation(a.ctx, { name: "Çapak alma", unit: "adet", price: 7.77, setupFee: 33.33 });
    await updateItem(a.ctx, a.item.id, { ops: [{ opId: op.id, qty: 1 }], customerMaterial: true });
    await sendQuote(a.ctx, a.q.id);
    const pub = (await getPublicQuote(db, a.q.publicToken))!;
    expect(pub.items[0]).toMatchObject({ ops: ["Çapak alma"], customerMaterial: true });
    const text = JSON.stringify(pub.items);
    for (const secret of ["7.77", "33.33", "extraCost", "marginAmount", "setupFee"]) expect(text).not.toContain(secret);
  });

  it("keeps the scope in the customer's part memory and in the data export", async () => {
    const a = await setup();
    const op = await saveOperation(a.ctx, { name: "Büküm sonrası kaynak", unit: "dk", price: 20, setupFee: 0 });
    await updateItem(a.ctx, a.item.id, { partCode: "KP-7", revision: "B", ops: [{ opId: op.id, qty: 1.5 }], customerMaterial: true });
    const part = await savePartRevision(a.ctx, a.item.id);
    const next = await createQuote(a.ctx, { customerId: a.customer.id });
    await addSavedPart(a.ctx, next.id, part.id);
    const reused = (await getQuote(a.ctx, next.id)).items[0];
    expect(reused).toMatchObject({ customerMaterial: true, ops: [{ opId: op.id, name: "Büküm sonrası kaynak", unit: "dk", qty: 1.5 }] });
    expect(reused.result!.extraCost).toBeCloseTo(20 * 1.5 * 10, 2);
    expect((await exportOrgData(a.ctx)).operations).toHaveLength(1);
  });
});
