import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { DB } from "@/server/db";
import { saveMaterial } from "@/server/catalog";
import { addSavedPart, listPartRevisions, savePartRevision } from "@/server/parts";
import { addItem, createQuote, decidePublicQuote, deleteQuote, getPublicQuote, getQuote, listOrders, saveCustomer, saveQuantityOptions, sendQuote, updateItem, updateQuote } from "@/server/quotes";
import { exportOrgData } from "@/server/privacy";
import { materials, quoteItems } from "@/server/schema";
import { compareUnitCosts } from "@/engine/comparison";
import { freshDb, makeOrg, member, plateDxf, bracketDxf, setPlan } from "./helpers";

let db: DB;
beforeAll(async () => { db = await freshDb(); });

async function setup() {
  const a = await makeOrg(db);
  const customer = await saveCustomer(a.ctx, { name: "Tekrar İş Müşterisi" });
  const q = await createQuote(a.ctx, { customerId: customer.id });
  const item = await addItem(a.ctx, q.id, { name: "braket.dxf", content: plateDxf() });
  await updateItem(a.ctx, item.id, { thickness: 2, qty: 10, partCode: "BR-001", revision: "A" });
  return { ...a, customer, q, item };
}

describe("customer part memory", () => {
  it("keeps an immutable customer revision and reuses it with today's catalogue after the source is deleted", async () => {
    const a = await setup();
    const old = (await getQuote(a.ctx, a.q.id)).items[0];
    const part = await savePartRevision(a.ctx, a.item.id);
    expect((await savePartRevision(a.ctx, a.item.id)).id).toBe(part.id);
    await updateItem(a.ctx, a.item.id, { qty: 20 });
    expect((await savePartRevision(a.ctx, a.item.id)).baseline).toEqual(part.baseline);
    await deleteQuote(a.ctx, a.q.id);
    const [material] = await db.select().from(materials).where(eq(materials.id, old.materialId!));
    await saveMaterial(a.ctx, { ...material, pricePerKg: material.pricePerKg * 2 });
    const next = await createQuote(a.ctx, { customerId: a.customer.id });
    await addSavedPart(a.ctx, next.id, part.id);
    const current = (await getQuote(a.ctx, next.id)).items[0];
    expect(current).toMatchObject({ partCode: "BR-001", revision: "A", qty: 10 });
    expect(current.result!.materialCost).toBeGreaterThan(old.result!.materialCost);
    expect(current.baseline!.result.unitPrice).toBe(old.result!.unitPrice);
    expect(current.fileId).not.toBe(old.fileId);
    const difference = compareUnitCosts(current.baseline!, current.result!, current.qty);
    expect(difference.delta).toBeGreaterThan(0);
    expect(difference.rows.find((r) => r.key === "materialCost")!.delta).toBeGreaterThan(0);
    expect((await exportOrgData(a.ctx)).partRevisions).toHaveLength(1);
  });

  it("requires a new revision for changed geometry and allows customer-scoped identical part codes", async () => {
    const a = await setup();
    await savePartRevision(a.ctx, a.item.id);
    const changed = await addItem(a.ctx, a.q.id, { name: "yeni.dxf", content: bracketDxf() });
    await updateItem(a.ctx, changed.id, { thickness: 2, partCode: "BR-001", revision: "A" });
    await expect(savePartRevision(a.ctx, changed.id)).rejects.toThrow(/revizyon/i);
    await updateItem(a.ctx, changed.id, { revision: "B" });
    await savePartRevision(a.ctx, changed.id);
    const other = await saveCustomer(a.ctx, { name: "Diğer Müşteri" });
    await updateQuote(a.ctx, a.q.id, { customerId: other.id });
    await savePartRevision(a.ctx, changed.id);
    expect(await listPartRevisions(a.ctx, { customerId: a.customer.id })).toHaveLength(2);
    expect(await listPartRevisions(a.ctx, { customerId: other.id })).toHaveLength(1);
  });

  it("rejects missing identity, unpriced drawings, foreign tenants and a different customer", async () => {
    const a = await setup(), b = await makeOrg(db);
    const part = await savePartRevision(a.ctx, a.item.id);
    expect(await listPartRevisions(b.ctx, {})).toEqual([]);
    await expect(savePartRevision(b.ctx, a.item.id)).rejects.toMatchObject({ code: "not_found" });
    const foreign = await createQuote(b.ctx);
    await expect(addSavedPart(b.ctx, foreign.id, part.id)).rejects.toMatchObject({ code: "not_found" });
    const other = await saveCustomer(a.ctx, { name: "Başka Müşteri" });
    const different = await createQuote(a.ctx, { customerId: other.id });
    await expect(addSavedPart(a.ctx, different.id, part.id)).rejects.toThrow(/müşteri/i);
    await updateItem(a.ctx, a.item.id, { partCode: "" });
    await expect(savePartRevision(a.ctx, a.item.id)).rejects.toThrow();
    await updateItem(a.ctx, a.item.id, { partCode: "BR-002", thickness: null });
    await expect(savePartRevision(a.ctx, a.item.id)).rejects.toThrow();
  });

  it("enforces role and active-plan boundaries on both library writes and item edits", async () => {
    const a = await setup();
    const part = await savePartRevision(a.ctx, a.item.id);
    const viewer = await member(db, a.org.id, "viewer");
    await expect(savePartRevision(viewer, a.item.id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(addSavedPart(viewer, a.q.id, part.id)).rejects.toMatchObject({ code: "forbidden" });
    await setPlan(db, a.org.id, { trialEndsAt: new Date(0) });
    await expect(savePartRevision(a.ctx, a.item.id)).rejects.toMatchObject({ code: "inactive" });
    await expect(addSavedPart(a.ctx, a.q.id, part.id)).rejects.toMatchObject({ code: "inactive" });
    await expect(updateItem(a.ctx, a.item.id, { qty: 20 })).rejects.toMatchObject({ code: "inactive" });
  });
});

describe("frozen quantity alternatives", () => {
  it("prices each complete alternative and accepts its frozen amount after rates change", async () => {
    const a = await setup();
    await saveQuantityOptions(a.ctx, a.q.id, [{ label: "50 adet", quantities: { [a.item.id]: 50 } }, { label: "100 adet", quantities: { [a.item.id]: 100 } }]);
    const draft = (await getQuote(a.ctx, a.q.id)).quote;
    expect(draft.options).toHaveLength(2);
    await sendQuote(a.ctx, a.q.id);
    const frozen = (await getQuote(a.ctx, a.q.id)).quote.options[1];
    expect(frozen.totals.ok).toBe(true);
    const pub = (await getPublicQuote(db, a.q.publicToken))!;
    expect(JSON.stringify(pub)).not.toContain("machineCost");
    expect(JSON.stringify(pub)).not.toContain("marginAmount");
    expect(pub.quote.options[1].lines[0].qty).toBe(100);
    const [material] = await db.select().from(materials).where(eq(materials.orgId, a.org.id));
    await saveMaterial(a.ctx, { ...material, pricePerKg: material.pricePerKg * 10 });
    await expect(decidePublicQuote(db, a.q.publicToken, "accepted", "forged-option")).rejects.toThrow();
    await decidePublicQuote(db, a.q.publicToken, "accepted", frozen.id);
    const accepted = await getQuote(a.ctx, a.q.id);
    expect(accepted.quote.selectedOptionId).toBe(frozen.id);
    expect(accepted.quote.totals).toEqual(frozen.totals);
    expect(accepted.items[0].qty).toBe(100);
    expect(accepted.items[0].result).toEqual(frozen.lines[0]);
    expect(await listOrders(a.ctx)).toHaveLength(1);
    await expect(updateItem(a.ctx, a.item.id, { qty: 999 })).rejects.toThrow();
  });

  it("validates every quantity and item, limits the alternatives and refuses frozen edits", async () => {
    const a = await setup();
    await expect(saveQuantityOptions(a.ctx, a.q.id, [{ label: "Eksik", quantities: {} }])).rejects.toThrow();
    await expect(saveQuantityOptions(a.ctx, a.q.id, [{ label: "Yabancı", quantities: { foreign: 2 } }])).rejects.toThrow();
    await expect(saveQuantityOptions(a.ctx, a.q.id, [{ label: "Sıfır", quantities: { [a.item.id]: 0 } }])).rejects.toThrow();
    await expect(saveQuantityOptions(a.ctx, a.q.id, Array.from({ length: 4 }, (_, i) => ({ label: String(i), quantities: { [a.item.id]: 2 } })))).rejects.toThrow();
    await sendQuote(a.ctx, a.q.id);
    await expect(saveQuantityOptions(a.ctx, a.q.id, [])).rejects.toThrow();
  });

  it("recomputes alternatives while drafting and discards incomplete options when items change", async () => {
    const a = await setup();
    await saveQuantityOptions(a.ctx, a.q.id, [{ label: "20 adet", quantities: { [a.item.id]: 20 } }]);
    const before = (await getQuote(a.ctx, a.q.id)).quote.options[0];
    await updateItem(a.ctx, a.item.id, { extraPerUnit: 100 });
    const after = (await getQuote(a.ctx, a.q.id)).quote.options[0];
    expect(after.lines[0].unitPrice).toBeGreaterThan(before.lines[0].unitPrice);
    await addItem(a.ctx, a.q.id, { name: "ikinci.dxf", content: plateDxf() });
    expect((await getQuote(a.ctx, a.q.id)).quote.options).toEqual([]);
  });

  it("allows only one consistent selection when two acceptance requests race", async () => {
    const a = await setup();
    await saveQuantityOptions(a.ctx, a.q.id, [{ label: "20 adet", quantities: { [a.item.id]: 20 } }, { label: "30 adet", quantities: { [a.item.id]: 30 } }]);
    await sendQuote(a.ctx, a.q.id);
    const options = (await getQuote(a.ctx, a.q.id)).quote.options;
    await Promise.allSettled(options.map((o) => decidePublicQuote(db, a.q.publicToken, "accepted", o.id)));
    const accepted = await getQuote(a.ctx, a.q.id);
    const selected = options.find((o) => o.id === accepted.quote.selectedOptionId)!;
    expect(selected).toBeTruthy();
    expect(accepted.items[0].qty).toBe(selected.quantities[a.item.id]);
    expect(accepted.quote.totals).toEqual(selected.totals);
    expect(await listOrders(a.ctx)).toHaveLength(1);
    expect((await db.select().from(quoteItems).where(eq(quoteItems.quoteId, a.q.id)))[0].result).toEqual(selected.lines[0]);
  });
});
