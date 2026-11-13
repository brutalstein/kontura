import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { deleteMachine, deleteMaterial, listCatalog, saveCompany, saveCutTable, saveMachine, saveMaterial, savePortal, saveRules } from "@/server/catalog";
import { AppError, type Ctx, entitlements, resetRateLimits } from "@/server/core";
import type { DB } from "@/server/db";
import { devOutbox } from "@/server/mail";
import {
  addItem, createQuote, dashboard, decidePublicQuote, decideQuote, deleteCustomer, deleteQuote, getFile, getPortal, getPublicQuote, getQuote, listCustomers,
  listOrders, listQuotes, portalEstimate, portalSubmit, quoteNesting, removeItem, reopenQuote, saveCustomer, sendQuote, sendSupport, updateItem, updateOrder, updateQuote,
} from "@/server/quotes";
import { orgs, quotes } from "@/server/schema";
import { DEFAULT_RULES } from "@/server/auth";
import { bracketDxf, freshDb, makeOrg, member, plateDxf, setPlan } from "./helpers";

let db: DB;
beforeAll(async () => { db = await freshDb(); });
beforeEach(() => { resetRateLimits(); devOutbox.length = 0; });

async function pricedQuote(ctx: Ctx, qty = 10) {
  const q = await createQuote(ctx);
  const item = await addItem(ctx, q.id, { name: "plaka.dxf", content: plateDxf() });
  await updateItem(ctx, item.id, { thickness: 2, qty });
  return { q, item };
}

describe("quote workflow", () => {
  it("prices an uploaded DXF exactly as the hand calculation predicts", async () => {
    const { ctx } = await makeOrg(db);
    const { q } = await pricedQuote(ctx, 10);
    const { quote, items } = await getQuote(ctx, q.id);
    const a = items[0].analysis;
    expect(a.cutLength).toBeCloseTo(600 + 2 * Math.PI * 10, 6);
    expect(a.pierceCount).toBe(2);
    // 3 kW preset, DKP 2 mm: 7500 mm/min, 0.4 s pierce; rules: rapid 0.5 s, 60 TL/min, margin 25 %, VAT 20 %
    const minutes = a.cutLength / 7500 + (2 * (0.4 + 0.5)) / 60;
    expect(items[0].result!.minutesPerUnit).toBeCloseTo(minutes, 9);
    expect(items[0].result!.machineCost).toBeCloseTo(minutes * 60 * 10, 2);
    // nesting: 3000×1500 sheet, margin 10, gap 5 -> 14 rows of 100 mm fit in one 200 mm column -> strip 10+200+10 = 220 mm
    const kg = (220 / 3000) * ((3000 * 1500 * 2 * 7.85) / 1e6);
    expect(items[0].result!.materialCost).toBeCloseTo(kg * 40, 2);
    expect(quote.totals).toMatchObject({ ok: true });
    if (!quote.totals?.ok) throw new Error("unreachable");
    const cost = minutes * 600 + kg * 40;
    expect(quote.totals.net).toBeCloseTo(cost * 1.25, 1);
    expect(quote.totals.gross).toBeCloseTo(quote.totals.net * 1.2, 1);
    const layout = await quoteNesting(ctx, q.id);
    expect(layout[0].sheetCount).toBe(1);
    expect(layout[0].first.placements).toHaveLength(10);
  });

  it("explains what is missing instead of producing a price", async () => {
    const { ctx } = await makeOrg(db);
    const q = await createQuote(ctx);
    expect((await sendQuote(ctx, q.id).catch((e) => e)) as AppError).toBeInstanceOf(AppError);
    const item = await addItem(ctx, q.id, { name: "plaka.dxf", content: plateDxf() });
    expect((await getQuote(ctx, q.id)).quote.totals).toMatchObject({ ok: false });
    await updateItem(ctx, item.id, { thickness: 40 }); // outside the cutting table
    const t = (await getQuote(ctx, q.id)).quote.totals;
    expect(t?.ok).toBe(false);
    if (t && !t.ok) expect(t.error).toMatch(/40 mm/);
    await expect(sendQuote(ctx, q.id)).rejects.toThrow(/40 mm/);
  });

  it("rejects bad uploads", async () => {
    const { ctx } = await makeOrg(db);
    const q = await createQuote(ctx);
    await expect(addItem(ctx, q.id, { name: "virus.exe", content: plateDxf() })).rejects.toThrow(AppError);
    await expect(addItem(ctx, q.id, { name: "bozuk.dxf", content: "not a dxf" })).rejects.toThrow(AppError);
    await expect(addItem(ctx, q.id, { name: "dev.dxf", content: "0\n".repeat(5 * 1024 * 1024) })).rejects.toThrow(AppError);
    await expect(updateItem(ctx, (await addItem(ctx, q.id, { name: "a.dxf", content: plateDxf() })).id, { qty: 0 })).rejects.toThrow();
  });

  it("reads bend lines from the drawing and prices foreign-currency material only when a rate is set", async () => {
    const { ctx } = await makeOrg(db);
    const q = await createQuote(ctx);
    const item = await addItem(ctx, q.id, { name: "braket.dxf", content: bracketDxf() });
    expect(item.bends).toBe(1);
    const usd = await saveMaterial(ctx, { name: "İthal paslanmaz", densityGcm3: 7.93, pricePerKg: 4, currency: "USD", sheetW: 3000, sheetH: 1500 });
    const { machines } = await listCatalog(ctx);
    await saveCutTable(ctx, machines[0].id, usd.id, [{ thickness: 2, feedMmMin: 8000, pierceSec: 0.4 }]);
    let t = await updateItem(ctx, item.id, { materialId: usd.id, thickness: 2 });
    expect(t).toMatchObject({ ok: false });
    await saveRules(ctx, { ...DEFAULT_RULES, fx: { USD: 45, EUR: 50 } });
    t = await updateItem(ctx, item.id, { qty: 1 });
    expect(t.ok).toBe(true);
    const r = (await getQuote(ctx, q.id)).items[0].result!;
    expect(r.bendCost).toBe(15 + 250);
    // material: one 120×80 part, rotated so the strip is 10+80+10 mm of a 3000 mm sheet, 2 mm, 7.93 g/cm³, 4 USD × 45
    expect(r.materialCost).toBeCloseTo((100 / 3000) * ((3000 * 1500 * 2 * 7.93) / 1e6) * 180, 2);
  });

  it("send -> public link -> customer accepts -> order; the public view never exposes cost or margin", async () => {
    const { ctx, org } = await makeOrg(db);
    const customer = await saveCustomer(ctx, { name: "Makina A.Ş.", email: "satin.alma@example.com" });
    const { q, item } = await pricedQuote(ctx);
    await updateQuote(ctx, q.id, { customerId: customer.id, notes: "Teslim 3 iş günü" });
    expect(await getPublicQuote(db, q.publicToken)).toBeNull(); // drafts are not public
    const sent = await sendQuote(ctx, q.id);
    expect(sent.emailed).toBe("satin.alma@example.com");
    expect(devOutbox.at(-1)?.text).toContain(sent.url);
    await expect(updateItem(ctx, item.id, { qty: 99 })).rejects.toThrow(AppError); // frozen once sent
    await expect(removeItem(ctx, item.id)).rejects.toThrow(AppError);

    const pub = (await getPublicQuote(db, q.publicToken))!;
    expect(pub.org.name).toBe(org.name);
    expect(pub.items[0].unitPrice).toBeGreaterThan(0);
    const leaked = JSON.stringify(pub.items);
    for (const secret of ["marginAmount", "machineCost", "materialCost", "minutesPerUnit"]) expect(leaked).not.toContain(secret);

    await decidePublicQuote(db, q.publicToken, "accepted");
    await expect(decidePublicQuote(db, q.publicToken, "rejected")).rejects.toThrow(AppError); // already decided
    const orders = await listOrders(ctx);
    expect(orders).toHaveLength(1);
    expect(orders[0].customerName).toBe("Makina A.Ş.");
    await updateOrder(ctx, orders[0].id, { status: "cutting", dueDate: "2026-12-01" });
    expect((await listOrders(ctx))[0].status).toBe("cutting");
    await expect(updateOrder(ctx, orders[0].id, { status: "exploded" })).rejects.toThrow();
    await expect(deleteQuote(ctx, q.id)).rejects.toThrow(AppError);
    await expect(reopenQuote(ctx, q.id)).rejects.toThrow(AppError);
    const d = await dashboard(ctx);
    expect(d.winRate).toBe(1);
    expect(d.acceptedNet).toBeGreaterThan(0);
  });

  it("expired quotes cannot be accepted; staff can reopen and record phone decisions", async () => {
    const { ctx } = await makeOrg(db);
    const { q } = await pricedQuote(ctx);
    await sendQuote(ctx, q.id);
    await db.update(quotes).set({ validUntil: new Date(Date.now() - 1000) }).where(eq(quotes.id, q.id));
    expect((await getPublicQuote(db, q.publicToken))!.expired).toBe(true);
    await expect(decidePublicQuote(db, q.publicToken, "accepted")).rejects.toThrow(/süresi/);
    await reopenQuote(ctx, q.id);
    await sendQuote(ctx, q.id);
    await decideQuote(ctx, q.id, "rejected");
    expect((await listQuotes(ctx, { status: "rejected" })).map((r) => r.id)).toContain(q.id);
    expect(await listOrders(ctx)).toHaveLength(0);
  });

  it("search treats user text as data", async () => {
    const { ctx } = await makeOrg(db);
    const c = await saveCustomer(ctx, { name: "100% Çelik_Ltd" });
    const q = await createQuote(ctx, { customerId: c.id });
    expect((await listQuotes(ctx, { q: "100%" })).map((r) => r.id)).toEqual([q.id]);
    expect(await listQuotes(ctx, { q: "'; drop table quotes; --" })).toEqual([]);
    expect(await listQuotes(ctx, { q: "1__%" })).toEqual([]); // would match as a LIKE pattern; must be literal
    expect(await listQuotes(ctx, { q: "Çelik_" })).toHaveLength(1);
    expect((await listQuotes(ctx, { q: `#${q.number}` })).map((r) => r.id)).toEqual([q.id]);
    expect(await listQuotes(ctx)).toHaveLength(1);
  });
});

describe("tenant isolation", () => {
  it("one organisation can neither see nor touch another's data, even with valid ids", async () => {
    const a = await makeOrg(db), b = await makeOrg(db);
    const custB = await saveCustomer(b.ctx, { name: "B müşterisi" });
    const { q: qB, item: itemB } = await pricedQuote(b.ctx);
    const catB = await listCatalog(b.ctx);
    await sendQuote(b.ctx, qB.id);
    await decideQuote(b.ctx, qB.id, "accepted");
    const orderB = (await listOrders(b.ctx))[0];
    const fileB = (await getQuote(b.ctx, qB.id)).items[0].fileId!;

    // reads
    expect(await listQuotes(a.ctx)).toEqual([]);
    expect(await listCustomers(a.ctx)).toEqual([]);
    expect(await listOrders(a.ctx)).toEqual([]);
    expect((await listCatalog(a.ctx)).machines.map((m) => m.id)).not.toContain(catB.machines[0].id);
    await expect(getQuote(a.ctx, qB.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(getFile(a.ctx, fileB)).rejects.toMatchObject({ code: "not_found" });
    expect(await quoteNesting(a.ctx, qB.id)).toEqual([]);

    // writes against B's rows
    await expect(updateItem(a.ctx, itemB.id, { qty: 5 })).rejects.toMatchObject({ code: "not_found" });
    await expect(addItem(a.ctx, qB.id, { name: "x.dxf", content: plateDxf() })).rejects.toMatchObject({ code: "not_found" });
    await expect(sendQuote(a.ctx, qB.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(deleteQuote(a.ctx, qB.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(updateOrder(a.ctx, orderB.id, { status: "delivered" })).rejects.toMatchObject({ code: "not_found" });
    await expect(saveCustomer(a.ctx, { id: custB.id, name: "ele geçirildi" })).rejects.toMatchObject({ code: "not_found" });
    await expect(saveMachine(a.ctx, { id: catB.machines[0].id, name: "x", kind: "laser", ratePerMin: 1 })).rejects.toMatchObject({ code: "not_found" });
    await expect(saveMaterial(a.ctx, { id: catB.materials[0].id, name: "x", densityGcm3: 1, pricePerKg: 1, currency: "TRY", sheetW: 1, sheetH: 1 })).rejects.toMatchObject({ code: "not_found" });
    await removeItem(a.ctx, itemB.id);
    await deleteCustomer(a.ctx, custB.id);
    await deleteMachine(a.ctx, catB.machines[0].id);
    await deleteMaterial(a.ctx, catB.materials[0].id);

    // cross-references: A's own rows must not be able to point at B's rows
    const qA = await createQuote(a.ctx);
    const itemA = await addItem(a.ctx, qA.id, { name: "a.dxf", content: plateDxf() });
    await expect(updateItem(a.ctx, itemA.id, { materialId: catB.materials[0].id })).rejects.toMatchObject({ code: "not_found" });
    await expect(updateItem(a.ctx, itemA.id, { machineId: catB.machines[0].id })).rejects.toMatchObject({ code: "not_found" });
    await expect(updateQuote(a.ctx, qA.id, { customerId: custB.id })).rejects.toMatchObject({ code: "not_found" });
    await expect(createQuote(a.ctx, { customerId: custB.id })).rejects.toMatchObject({ code: "not_found" });
    const catA = await listCatalog(a.ctx);
    await expect(saveCutTable(a.ctx, catB.machines[0].id, catA.materials[0].id, [{ thickness: 1, feedMmMin: 1, pierceSec: 0 }])).rejects.toMatchObject({ code: "not_found" });
    await expect(saveCutTable(a.ctx, catA.machines[0].id, catB.materials[0].id, [{ thickness: 1, feedMmMin: 1, pierceSec: 0 }])).rejects.toMatchObject({ code: "not_found" });

    // B is exactly as it was
    const after = await getQuote(b.ctx, qB.id);
    expect(after.quote.status).toBe("accepted");
    expect(after.items).toHaveLength(1);
    expect(after.items[0].qty).toBe(10);
    expect((await listCustomers(b.ctx)).map((c) => c.name)).toEqual(["B müşterisi"]);
    expect((await listCatalog(b.ctx)).machines).toHaveLength(1);
    expect((await listCatalog(b.ctx)).materials).toHaveLength(2);
    expect((await listOrders(b.ctx))[0].status).toBe("new");
    expect((await getFile(b.ctx, fileB)).name).toBe("plaka.dxf");
  });

  it("quote numbers are per organisation", async () => {
    const a = await makeOrg(db), b = await makeOrg(db);
    expect((await createQuote(a.ctx)).number).toBe(1);
    expect((await createQuote(a.ctx)).number).toBe(2);
    expect((await createQuote(b.ctx)).number).toBe(1);
  });
});

describe("permissions", () => {
  it("viewers read, estimators quote, admins configure, owners own", async () => {
    const { ctx, org } = await makeOrg(db);
    const viewer = await member(db, org.id, "viewer"), estimator = await member(db, org.id, "estimator"), admin = await member(db, org.id, "admin");
    const { q } = await pricedQuote(estimator);
    expect((await listQuotes(viewer)).map((r) => r.id)).toContain(q.id);
    await getQuote(viewer, q.id);
    for (const p of [createQuote(viewer), addItem(viewer, q.id, { name: "a.dxf", content: plateDxf() }), sendQuote(viewer, q.id), deleteQuote(viewer, q.id), saveCustomer(viewer, { name: "X Ltd" })]) {
      await expect(p).rejects.toMatchObject({ code: "forbidden" });
    }
    for (const who of [viewer, estimator]) {
      for (const p of [saveMachine(who, { name: "m", kind: "laser", ratePerMin: 1 }), saveRules(who, DEFAULT_RULES), saveCompany(who, { name: "Yeni Ad" }), savePortal(who, { enabled: true, showPrice: true })]) {
        await expect(p).rejects.toMatchObject({ code: "forbidden" });
      }
    }
    await saveMachine(admin, { name: "Plazma", kind: "plasma", ratePerMin: 30 });
    await saveCompany(admin, { name: "Yeni Ad", taxNo: "1234567890" });
    await sendSupport(viewer, { subject: "Soru", body: "Fiyatları nasıl görebilirim?" });
    expect((await dashboard(ctx)).org.name).toBe("Yeni Ad");
  });
});

describe("subscription entitlements", () => {
  it("computes trial, paid, past-due and cancelled states", () => {
    const now = new Date("2026-11-12T00:00:00Z");
    const t = (plan: "trial" | "starter", subStatus: "none" | "active" | "past_due" | "canceled", daysLeft = 5) =>
      entitlements({ plan, subStatus, trialEndsAt: new Date(now.getTime() + daysLeft * 86_400_000), subRenewsAt: new Date(now.getTime() + daysLeft * 86_400_000) }, now);
    expect(t("trial", "none")).toMatchObject({ active: true, trialDaysLeft: 5, portal: true });
    expect(t("trial", "none", -1)).toMatchObject({ active: false, portal: false });
    expect(t("starter", "active")).toMatchObject({ active: true, quotesPerMonth: 40, seats: 1, portal: false });
    expect(t("starter", "past_due").active).toBe(true);
    expect(t("starter", "canceled").active).toBe(true);
    expect(t("starter", "canceled", -1).active).toBe(false);
  });

  it("an expired trial blocks new work but keeps existing data readable", async () => {
    const { ctx, org } = await makeOrg(db);
    const { q } = await pricedQuote(ctx);
    await setPlan(db, org.id, { trialEndsAt: new Date(Date.now() - 1000) });
    // one call at a time: promises started together reject before their handler is attached (unhandled rejection on PostgreSQL)
    for (const run of [() => createQuote(ctx), () => addItem(ctx, q.id, { name: "a.dxf", content: plateDxf() }), () => sendQuote(ctx, q.id), () => saveCustomer(ctx, { name: "Yeni müşteri" })]) {
      await expect(run()).rejects.toMatchObject({ code: "inactive" });
    }
    expect(await listQuotes(ctx)).toHaveLength(1);
    expect((await getQuote(ctx, q.id)).items).toHaveLength(1);
    await setPlan(db, org.id, { plan: "workshop", subStatus: "active", subRenewsAt: new Date(Date.now() + 86_400_000) });
    await createQuote(ctx);
  });

  it("the starter plan stops at 40 quotes a month and has no portal", async () => {
    const { ctx, org } = await makeOrg(db);
    await setPlan(db, org.id, { plan: "starter", subStatus: "active", subRenewsAt: new Date(Date.now() + 86_400_000) });
    for (let i = 0; i < 40; i++) await createQuote(ctx);
    await expect(createQuote(ctx)).rejects.toMatchObject({ code: "limit" });
    await expect(savePortal(ctx, { enabled: true, showPrice: true })).rejects.toMatchObject({ code: "limit" });
    await setPlan(db, org.id, { plan: "workshop" });
    await createQuote(ctx);
    await savePortal(ctx, { enabled: true, showPrice: true });
  });
});

describe("customer portal", () => {
  const item = (materialId: string, over = {}) => ({ fileName: "plaka.dxf", content: plateDxf(), materialId, thickness: 2, qty: 10, ...over });

  it("is invisible until enabled, then prices drawings and files requests as draft quotes", async () => {
    const { ctx, org } = await makeOrg(db);
    expect(await getPortal(db, org.slug)).toBeNull();
    await expect(portalEstimate(db, org.slug, [], "1.1.1.1")).rejects.toMatchObject({ code: "not_found" });
    await savePortal(ctx, { enabled: true, showPrice: true });
    const portal = (await getPortal(db, org.slug))!;
    expect(portal.materials.map((m) => m.name)).toEqual(["DKP / siyah sac (S235)", "Paslanmaz 304"]);
    expect(portal.materials[0].thicknesses).toContain(2);

    const est = await portalEstimate(db, org.slug, [item(portal.materials[0].id)], "1.1.1.1");
    const { q } = await pricedQuote(ctx, 10);
    const panelTotals = (await getQuote(ctx, q.id)).quote.totals;
    expect(est.totals?.net).toBe(panelTotals?.ok ? panelTotals.net : -1); // portal and panel agree to the kuruş

    const res = await portalSubmit(db, org.slug, { contact: { name: "Ali Veli", email: "ALI@Example.com", company: "Veli Makina" }, items: [item(portal.materials[0].id)], note: "Acil" }, "1.1.1.1");
    const list = await listQuotes(ctx, { q: "ali" });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ number: res.number, source: "portal", status: "draft" });
    expect(list[0].contact?.email).toBe("ali@example.com");
    expect(devOutbox.at(-1)?.subject).toContain("Portaldan");
    const sent = await sendQuote(ctx, list[0].id);
    expect(sent.emailed).toBe("ali@example.com");
  });

  it("hides prices when the shop says so and never accepts another shop's material", async () => {
    const a = await makeOrg(db), b = await makeOrg(db);
    await savePortal(a.ctx, { enabled: true, showPrice: false });
    const matA = (await listCatalog(a.ctx)).materials[0].id, matB = (await listCatalog(b.ctx)).materials[0].id;
    const hidden = await portalEstimate(db, a.org.slug, [item(matA)], "2.2.2.2");
    expect(hidden.totals).toBeNull();
    expect(hidden.items[0].unitPrice).toBeNull();
    expect(hidden.items[0].cutLength).toBeGreaterThan(0);
    await savePortal(a.ctx, { enabled: true, showPrice: true });
    const foreign = await portalEstimate(db, a.org.slug, [item(matB)], "2.2.2.2");
    expect(foreign.totals).toBeNull();
    expect(foreign.error).toBeTruthy();
  });

  it("validates and rate-limits anonymous input, and closes when the plan lapses", async () => {
    const { ctx, org } = await makeOrg(db);
    await savePortal(ctx, { enabled: true, showPrice: true });
    const mat = (await listCatalog(ctx)).materials[0].id;
    await expect(portalEstimate(db, org.slug, [item(mat, { qty: -1 })], "3.3.3.3")).rejects.toThrow();
    await expect(portalEstimate(db, org.slug, [item(mat, { content: "junk" })], "3.3.3.3")).rejects.toThrow(AppError);
    await expect(portalSubmit(db, org.slug, { contact: { name: "A", email: "nope" }, items: [item(mat)] }, "3.3.3.3")).rejects.toThrow();
    for (let i = 0; i < 10; i++) await portalSubmit(db, org.slug, { contact: { name: "Ali Veli", email: "a@example.com" }, items: [item(mat)] }, "4.4.4.4");
    await expect(portalSubmit(db, org.slug, { contact: { name: "Ali Veli", email: "a@example.com" }, items: [item(mat)] }, "4.4.4.4")).rejects.toMatchObject({ code: "rate" });
    await db.update(orgs).set({ trialEndsAt: new Date(Date.now() - 1000) }).where(eq(orgs.id, org.id));
    expect(await getPortal(db, org.slug)).toBeNull();
  });
});
