import { beforeAll, describe, expect, it } from "vitest";
import type { DB } from "@/server/db";
import { listCatalog } from "@/server/catalog";
import { addItem, applyPartsList, createQuote, getQuote, sendQuote, updateAllItems, updateItem } from "@/server/quotes";
import { bracketDxf, freshDb, makeOrg, member, plateDxf } from "./helpers";

let db: DB;
beforeAll(async () => { db = await freshDb(); });

async function setup() {
  const a = await makeOrg(db);
  const cat = await listCatalog(a.ctx);
  const q = await createQuote(a.ctx);
  const plate = await addItem(a.ctx, q.id, { name: "Plaka-01.dxf", content: plateDxf() });
  const bracket = await addItem(a.ctx, q.id, { name: "braket.dxf", content: bracketDxf() });
  const lines = async () => (await getQuote(a.ctx, q.id)).items;
  return { ...a, cat, q, plate, bracket, lines };
}

describe("bulk assignment", () => {
  it("sets material, machine and thickness on every line and leaves omitted fields alone", async () => {
    const a = await setup();
    const steel = a.cat.materials[1];
    await updateItem(a.ctx, a.plate.id, { qty: 7 });
    await updateAllItems(a.ctx, a.q.id, { materialId: steel.id, thickness: 2 });
    const lines = await a.lines();
    expect(lines.map((l) => l.materialId)).toEqual([steel.id, steel.id]);
    expect(lines.map((l) => l.thickness)).toEqual([2, 2]);
    expect(lines.map((l) => l.machineId)).toEqual([a.cat.machines[0].id, a.cat.machines[0].id]);
    expect(lines.find((l) => l.id === a.plate.id)!.qty).toBe(7);
    expect((await getQuote(a.ctx, a.q.id)).quote.totals).toMatchObject({ ok: true });
  });

  it("rejects foreign catalogue rows, empty input, read-only members and sent quotes", async () => {
    const a = await setup();
    const b = await makeOrg(db);
    const foreign = (await listCatalog(b.ctx)).materials[0];
    await expect(updateAllItems(a.ctx, a.q.id, { materialId: foreign.id })).rejects.toThrow("Malzeme bulunamadı");
    await expect(updateAllItems(a.ctx, a.q.id, {})).rejects.toThrow("En az bir alan");
    await expect(updateAllItems(await member(db, a.ctx.orgId, "viewer"), a.q.id, { thickness: 3 })).rejects.toThrow();
    await expect(updateAllItems(b.ctx, a.q.id, { thickness: 3 })).rejects.toThrow("Teklif bulunamadı");
    await updateAllItems(a.ctx, a.q.id, { thickness: 2 });
    await sendQuote(a.ctx, a.q.id);
    await expect(updateAllItems(a.ctx, a.q.id, { thickness: 3 })).rejects.toThrow("Gönderilmiş teklif");
  });
});

describe("parts list", () => {
  it("matches pasted rows to lines by name or part code and reports what did not match", async () => {
    const a = await setup();
    const steel = a.cat.materials[1];
    await updateItem(a.ctx, a.bracket.id, { partCode: "BR-7" });
    const list = ["Parça\tAdet\tKalınlık\tMalzeme", "PLAKA-01.DXF\t40\t1,5\t" + steel.name.toLocaleUpperCase("tr"), "br-7;12", "flans;3;2"].join("\r\n");
    const r = await applyPartsList(a.ctx, a.q.id, list);
    expect(r).toEqual({ matched: 2, unmatched: ["flans"], missing: [] });
    const lines = await a.lines();
    expect(lines.find((l) => l.id === a.plate.id)).toMatchObject({ qty: 40, thickness: 1.5, materialId: steel.id });
    expect(lines.find((l) => l.id === a.bracket.id)).toMatchObject({ qty: 12, materialId: a.cat.materials[0].id });

    const second = await applyPartsList(a.ctx, a.q.id, "plaka-01;5");
    expect(second).toEqual({ matched: 1, unmatched: [], missing: ["braket"] });
  });

  it("applies nothing when a row cannot be read", async () => {
    const a = await setup();
    await expect(applyPartsList(a.ctx, a.q.id, "plaka-01;10\nbraket;iki")).rejects.toThrow("2. satır");
    await expect(applyPartsList(a.ctx, a.q.id, "plaka-01;10;2;Titanyum")).rejects.toThrow("Titanyum");
    await expect(applyPartsList(a.ctx, a.q.id, "   \n")).rejects.toThrow("Liste boş");
    expect((await a.lines()).map((l) => l.qty)).toEqual([1, 1]);
    await expect(applyPartsList(await member(db, a.ctx.orgId, "viewer"), a.q.id, "plaka-01;10")).rejects.toThrow();
  });
});
