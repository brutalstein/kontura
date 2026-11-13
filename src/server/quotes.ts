import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { type Analysis, CostError, DxfError, type LineInput, NestError, analyzeDxf, priceQuote } from "@/engine";
import type { DB } from "./db";
import { AppError, type Ctx, audit, entitlements, loadOrg, need, needActive, quotesThisMonth, randomToken, rateLimit } from "./core";
import { appUrl, sendMail } from "./mail";
import {
  type Contact, type ItemOp, OP_UNITS, type OrderStatus, type QuantityOption, type QuoteTotals, customers, cutParams, files, machines, materials, memberships, operations, orders, orgs, quoteItems, quotes,
  supportMessages, users,
} from "./schema";

export const MAX_DXF_BYTES = 8 * 1024 * 1024;
const MAX_ITEMS = 50;

function analyze(fileName: string, content: string): Analysis {
  if (content.length > MAX_DXF_BYTES) throw new AppError("Dosya çok büyük (en fazla 8 MB).");
  if (!/\.dxf$/i.test(fileName)) throw new AppError("Yalnızca .dxf dosyaları desteklenir. DWG dosyanızı DXF olarak kaydedin.");
  try {
    return analyzeDxf(content);
  } catch (e) {
    if (e instanceof DxfError) throw new AppError(`${fileName}: ${e.message}`);
    throw e;
  }
}

type Catalog = { machines: (typeof machines.$inferSelect)[]; materials: (typeof materials.$inferSelect)[]; cutParams: (typeof cutParams.$inferSelect)[]; operations: (typeof operations.$inferSelect)[] };
async function catalogOf(db: DB, orgId: string): Promise<Catalog> {
  const [m, mat, cp, ops] = await Promise.all([
    db.select().from(machines).where(eq(machines.orgId, orgId)).orderBy(machines.createdAt),
    db.select().from(materials).where(eq(materials.orgId, orgId)).orderBy(materials.createdAt),
    db.select().from(cutParams).where(eq(cutParams.orgId, orgId)),
    db.select().from(operations).where(eq(operations.orgId, orgId)),
  ]);
  return { machines: m, materials: mat, cutParams: cp, operations: ops };
}

type PriceItem = Pick<typeof quoteItems.$inferSelect, "id" | "name" | "analysis" | "materialId" | "machineId" | "thickness" | "qty" | "bends" | "extraPerUnit" | "ops" | "customerMaterial">;

/** Pure pricing of a set of items against an org's catalogue and rules. Shared by the panel and the public portal. */
export function price(items: PriceItem[], cat: Catalog, org: Pick<typeof orgs.$inferSelect, "rules">) {
  const { validityDays: _v, fx, ...rules } = org.rules;
  if (!items.length) return { totals: { ok: false, error: "Teklife en az bir DXF ekleyin." } as QuoteTotals, lines: null };
  const labels = new Map<string, string>();
  try {
    const lines: LineInput[] = items.map((it) => {
      const material = cat.materials.find((m) => m.id === it.materialId);
      const machine = cat.machines.find((m) => m.id === it.machineId);
      if (!material || !machine || !it.thickness) throw new CostError(`"${it.name}" için malzeme, kalınlık ve makine seçin.`);
      const rate = material.currency === "TRY" ? 1 : fx[material.currency];
      if (!(rate > 0)) throw new CostError(`${material.name} ${material.currency} ile fiyatlı; Fiyatlandırma ayarlarından ${material.currency} kurunu girin.`);
      // customer-supplied sheet is a separate stock: it must not share (and get billed with) the shop's own sheets
      const stockKey = `${material.id}|${it.thickness}${it.customerMaterial ? "|cm" : ""}`;
      labels.set(stockKey, `${material.name} · ${it.thickness} mm${it.customerMaterial ? " · müşteri malzemesi" : ""}`);
      let opsPerUnit = 0, opsSetup = 0;
      for (const o of it.ops) {
        const op = cat.operations.find((x) => x.id === o.opId);
        if (!op) throw new CostError(`"${it.name}" kalemindeki "${o.name}" işlemi katalogdan silinmiş. İşlemi kalemden kaldırın.`);
        opsPerUnit += op.price * o.qty;
        opsSetup += op.setupFee;
      }
      return {
        id: it.id, qty: it.qty, cutLength: it.analysis.cutLength, pierceCount: it.analysis.pierceCount, netArea: it.analysis.netArea,
        rects: it.analysis.parts.map((p) => ({ w: p.w, h: p.h })), bends: it.bends, extraPerUnit: it.extraPerUnit + opsPerUnit, extraSetup: opsSetup, customerMaterial: it.customerMaterial, thickness: it.thickness, stockKey,
        material: { densityGcm3: material.densityGcm3, pricePerKg: material.pricePerKg * rate, sheetW: material.sheetW, sheetH: material.sheetH },
        machine: {
          ratePerMin: machine.ratePerMin,
          params: cat.cutParams.filter((p) => p.machineId === machine.id && p.materialId === material.id),
        },
      };
    });
    const r = priceQuote(lines, rules);
    const totals: QuoteTotals = {
      ok: true, subtotal: r.subtotal, minOrderAdjustment: r.minOrderAdjustment, net: r.net, vat: r.vat, gross: r.gross,
      stocks: r.stocks.map((s) => ({ stockKey: s.stockKey, label: labels.get(s.stockKey)!, sheetCount: s.sheetCount, billableWeightKg: s.billableWeightKg, utilization: s.utilization, estimated: s.estimated })),
    };
    return { totals, lines: r.lines, stocks: r.stocks };
  } catch (e) {
    if (e instanceof CostError || e instanceof NestError) return { totals: { ok: false, error: e.message } as QuoteTotals, lines: null };
    throw e;
  }
}

async function recalc(db: DB, orgId: string, quoteId: string) {
  const [org, cat, items, [quote]] = await Promise.all([
    loadOrg(db, orgId), catalogOf(db, orgId),
    db.select().from(quoteItems).where(and(eq(quoteItems.quoteId, quoteId), eq(quoteItems.orgId, orgId))).orderBy(quoteItems.position),
    db.select().from(quotes).where(and(eq(quotes.id, quoteId), eq(quotes.orgId, orgId))),
  ]);
  const { totals, lines } = price(items, cat, org);
  const options = quote.options.every((o) => sameItemSet(items, o.quantities))
    ? quote.options.map((o) => priceOption(o.id, o.label, o.quantities, items, cat, org)) : [];
  await db.transaction(async (tx) => {
    for (const it of items) {
      await tx.update(quoteItems).set({ result: lines?.find((l) => l.id === it.id) ?? null }).where(eq(quoteItems.id, it.id));
    }
    await tx.update(quotes).set({ totals, options }).where(and(eq(quotes.id, quoteId), eq(quotes.orgId, orgId)));
  });
  return totals;
}

async function ownQuote(ctx: Ctx, id: string) {
  const [q] = await ctx.db.select().from(quotes).where(and(eq(quotes.id, id), eq(quotes.orgId, ctx.orgId)));
  if (!q) throw new AppError("Teklif bulunamadı.", "not_found");
  return q;
}
async function draftQuote(ctx: Ctx, id: string) {
  await needActive(ctx);
  const q = await ownQuote(ctx, id);
  if (q.status !== "draft") throw new AppError("Gönderilmiş teklif değiştirilemez. Önce taslağa geri alın.");
  return q;
}

async function insertQuote(db: DB, values: Omit<typeof quotes.$inferInsert, "number" | "publicToken">) {
  // the (org, number) unique index guards the race between two concurrent creators; retry with the next number
  for (let attempt = 0; ; attempt++) {
    const [{ next }] = await db.select({ next: sql<number>`coalesce(max(${quotes.number}), 0) + 1` }).from(quotes).where(eq(quotes.orgId, values.orgId));
    try {
      const [q] = await db.insert(quotes).values({ ...values, number: next, publicToken: randomToken() }).returning();
      return q;
    } catch (e) {
      if (attempt >= 4) throw e;
    }
  }
}

export async function createQuote(ctx: Ctx, input: { customerId?: string | null } = {}) {
  need(ctx, "write");
  const { ent } = await needActive(ctx);
  if ((await quotesThisMonth(ctx.db, ctx.orgId)) >= ent.quotesPerMonth) {
    throw new AppError(`Bu ay ${ent.quotesPerMonth} teklif sınırına ulaştınız. Sınırsız teklif için planınızı yükseltin.`, "limit");
  }
  const customerId = input.customerId ? (await ownCustomer(ctx, input.customerId)).id : null;
  return insertQuote(ctx.db, { orgId: ctx.orgId, customerId, createdBy: ctx.userId });
}

async function defaultsFor(db: DB, orgId: string, quoteId: string) {
  const [last] = await db.select().from(quoteItems).where(and(eq(quoteItems.quoteId, quoteId), eq(quoteItems.orgId, orgId))).orderBy(desc(quoteItems.position)).limit(1);
  if (last) return { materialId: last.materialId, machineId: last.machineId, thickness: last.thickness, position: last.position + 1 };
  const cat = await catalogOf(db, orgId);
  return { materialId: cat.materials[0]?.id ?? null, machineId: cat.machines[0]?.id ?? null, thickness: null, position: 0 };
}

export async function addItem(ctx: Ctx, quoteId: string, file: { name: string; content: string }) {
  need(ctx, "write");
  await needActive(ctx);
  await draftQuote(ctx, quoteId);
  const analysis = analyze(file.name, file.content);
  const d = await defaultsFor(ctx.db, ctx.orgId, quoteId);
  if (d.position >= MAX_ITEMS) throw new AppError(`Bir teklifte en fazla ${MAX_ITEMS} kalem olabilir.`, "limit");
  const [f] = await ctx.db.insert(files).values({ orgId: ctx.orgId, name: file.name.slice(0, 200), size: file.content.length, content: file.content }).returning({ id: files.id });
  const [item] = await ctx.db.insert(quoteItems).values({
    quoteId, orgId: ctx.orgId, name: file.name.replace(/\.dxf$/i, "").slice(0, 120), fileId: f.id, analysis, bends: analysis.bendCount, ...d,
  }).returning();
  await recalc(ctx.db, ctx.orgId, quoteId);
  return item;
}

const itemInput = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  partCode: z.string().trim().max(80).optional(), revision: z.string().trim().max(40).optional(),
  materialId: z.string().nullable().optional(), machineId: z.string().nullable().optional(),
  thickness: z.coerce.number().positive("Kalınlık sıfırdan büyük olmalı.").max(300).nullable().optional(),
  qty: z.coerce.number().int("Adet tam sayı olmalı.").min(1, "Adet en az 1 olmalı.").max(1_000_000).optional(),
  bends: z.coerce.number().int().min(0).max(1000).optional(),
  extraPerUnit: z.coerce.number().min(0).max(1e7).optional(),
  customerMaterial: z.boolean().optional(),
  // name and unit are only supplied when a saved part recipe is re-applied
  ops: z.array(z.object({ opId: z.string(), qty: z.coerce.number().positive("İşlem miktarı sıfırdan büyük olmalı.").max(1e6), name: z.string().max(80).optional(), unit: z.enum(OP_UNITS).optional() })).max(20).optional(),
});
export async function updateItem(ctx: Ctx, itemId: string, input: z.input<typeof itemInput>) {
  need(ctx, "write");
  const { ops: opsIn, ...data } = itemInput.parse(input);
  const [item] = await ctx.db.select().from(quoteItems).where(and(eq(quoteItems.id, itemId), eq(quoteItems.orgId, ctx.orgId)));
  if (!item) throw new AppError("Kalem bulunamadı.", "not_found");
  await draftQuote(ctx, item.quoteId);
  await ownCatalogRows(ctx, data);
  let ops: ItemOp[] | undefined;
  if (opsIn) {
    const rows = opsIn.length ? await ctx.db.select().from(operations).where(and(eq(operations.orgId, ctx.orgId), inArray(operations.id, opsIn.map((o) => o.opId)))) : [];
    ops = opsIn.map((o) => {
      const row = rows.find((r) => r.id === o.opId);
      // a saved recipe may name an operation deleted since: keep its text so pricing reports it instead of silently dropping scope
      if (!row && !(o.name && o.unit)) throw new AppError("İşlem bulunamadı.", "not_found");
      return { opId: o.opId, name: row?.name ?? o.name!, unit: row?.unit ?? o.unit!, qty: o.qty };
    });
  }
  await ctx.db.update(quoteItems).set({ ...data, ...(ops ? { ops } : {}) }).where(eq(quoteItems.id, itemId));
  return recalc(ctx.db, ctx.orgId, item.quoteId);
}

/** Ids arrive from the client: only accept catalogue rows of this org. */
async function ownCatalogRows(ctx: Ctx, ids: { materialId?: string | null; machineId?: string | null }) {
  if (ids.materialId && !(await ctx.db.select({ id: materials.id }).from(materials).where(and(eq(materials.id, ids.materialId), eq(materials.orgId, ctx.orgId)))).length) throw new AppError("Malzeme bulunamadı.", "not_found");
  if (ids.machineId && !(await ctx.db.select({ id: machines.id }).from(machines).where(and(eq(machines.id, ids.machineId), eq(machines.orgId, ctx.orgId)))).length) throw new AppError("Makine bulunamadı.", "not_found");
}

const bulkInput = z.object({ materialId: z.string().min(1).optional(), machineId: z.string().min(1).optional(), thickness: z.coerce.number().positive("Kalınlık sıfırdan büyük olmalı.").max(300).optional() });
/** Applies the given fields to every line of a draft quote; omitted fields stay as they are. */
export async function updateAllItems(ctx: Ctx, quoteId: string, input: z.input<typeof bulkInput>) {
  need(ctx, "write");
  const data = bulkInput.parse(input);
  if (!Object.keys(data).length) throw new AppError("En az bir alan seçin.");
  await draftQuote(ctx, quoteId);
  await ownCatalogRows(ctx, data);
  await ctx.db.update(quoteItems).set(data).where(and(eq(quoteItems.quoteId, quoteId), eq(quoteItems.orgId, ctx.orgId)));
  return recalc(ctx.db, ctx.orgId, quoteId);
}

const listKey = (v: string) => v.trim().replace(/\.dxf$/i, "").toLocaleLowerCase("tr");
/**
 * Matches a pasted parts list to the lines of a draft quote by line name or part code and sets quantity, and optionally thickness and material.
 * Row format: name; quantity; thickness; material. Columns are separated by tab or semicolon (never comma, so "1,5" stays a number).
 * Any unreadable row rejects the whole list, so a quote is never half-updated.
 */
export async function applyPartsList(ctx: Ctx, quoteId: string, text: string) {
  need(ctx, "write");
  await draftQuote(ctx, quoteId);
  const rows = text.slice(0, 200_000).split(/\r?\n/).map((l) => l.split(/[\t;]/).map((c) => c.trim())).filter((c) => c.some(Boolean));
  if (!rows.length) throw new AppError("Liste boş.");
  if (rows.length > 500) throw new AppError("Liste en fazla 500 satır olabilir.");
  const cat = await catalogOf(ctx.db, ctx.orgId);
  const items = await ctx.db.select({ id: quoteItems.id, name: quoteItems.name, partCode: quoteItems.partCode }).from(quoteItems).where(and(eq(quoteItems.quoteId, quoteId), eq(quoteItems.orgId, ctx.orgId))).orderBy(quoteItems.position);
  const hit = new Set<string>(), unmatched: string[] = [], updates: { ids: string[]; set: { qty: number; thickness?: number; materialId?: string } }[] = [];
  rows.forEach(([name = "", qtyCell = "", thickCell = "", matCell = ""], i) => {
    const qty = Number(qtyCell);
    if (!Number.isInteger(qty) || qty < 1 || qty > 1_000_000) {
      if (i === 0) return; // header row
      throw new AppError(`${i + 1}. satır: adet okunamadı ("${qtyCell}").`);
    }
    const set: (typeof updates)[number]["set"] = { qty };
    if (thickCell) {
      const t = Number(thickCell.replace(",", "."));
      if (!(t > 0 && t <= 300)) throw new AppError(`${i + 1}. satır: kalınlık okunamadı ("${thickCell}").`);
      set.thickness = t;
    }
    if (matCell) {
      const m = cat.materials.find((x) => listKey(x.name) === listKey(matCell));
      if (!m) throw new AppError(`${i + 1}. satır: "${matCell}" malzemesi kataloğunuzda yok. Malzeme adını Ayarlar'daki gibi yazın veya sütunu boş bırakın.`);
      set.materialId = m.id;
    }
    const ids = items.filter((it) => listKey(it.name) === listKey(name) || (it.partCode && listKey(it.partCode) === listKey(name))).map((it) => it.id);
    if (!ids.length) { unmatched.push(name); return; }
    ids.forEach((id) => hit.add(id));
    updates.push({ ids, set });
  });
  await ctx.db.transaction(async (tx) => {
    for (const u of updates) await tx.update(quoteItems).set(u.set).where(and(inArray(quoteItems.id, u.ids), eq(quoteItems.orgId, ctx.orgId)));
  });
  await recalc(ctx.db, ctx.orgId, quoteId);
  return { matched: hit.size, unmatched, missing: items.filter((it) => !hit.has(it.id)).map((it) => it.name) };
}

export async function removeItem(ctx: Ctx, itemId: string) {
  need(ctx, "write");
  const [item] = await ctx.db.select().from(quoteItems).where(and(eq(quoteItems.id, itemId), eq(quoteItems.orgId, ctx.orgId)));
  if (!item) return;
  await draftQuote(ctx, item.quoteId);
  await ctx.db.delete(quoteItems).where(eq(quoteItems.id, itemId));
  if (item.fileId) await ctx.db.delete(files).where(and(eq(files.id, item.fileId), eq(files.orgId, ctx.orgId)));
  await recalc(ctx.db, ctx.orgId, item.quoteId);
}

export async function updateQuote(ctx: Ctx, id: string, input: { customerId?: string | null; notes?: string }) {
  need(ctx, "write");
  await draftQuote(ctx, id);
  const set: Partial<typeof quotes.$inferInsert> = {};
  if (input.customerId !== undefined) set.customerId = input.customerId ? (await ownCustomer(ctx, input.customerId)).id : null;
  if (input.notes !== undefined) set.notes = String(input.notes).slice(0, 2000);
  if (Object.keys(set).length) await ctx.db.update(quotes).set(set).where(and(eq(quotes.id, id), eq(quotes.orgId, ctx.orgId)));
}

export async function deleteQuote(ctx: Ctx, id: string) {
  need(ctx, "write");
  const q = await ownQuote(ctx, id);
  if (q.status === "accepted") throw new AppError("Onaylanmış teklif silinemez.");
  const fileIds = (await ctx.db.select({ f: quoteItems.fileId }).from(quoteItems).where(eq(quoteItems.quoteId, id))).map((r) => r.f).filter((f): f is string => !!f);
  await ctx.db.delete(quotes).where(and(eq(quotes.id, id), eq(quotes.orgId, ctx.orgId)));
  if (fileIds.length) await ctx.db.delete(files).where(and(inArray(files.id, fileIds), eq(files.orgId, ctx.orgId)));
  await audit(ctx, "quote.delete", `#${q.number}`);
}

export const publicQuoteUrl = (token: string) => `${appUrl()}/t/${token}`;

export async function sendQuote(ctx: Ctx, id: string) {
  need(ctx, "write");
  const { org } = await needActive(ctx);
  const q = await draftQuote(ctx, id);
  const totals = await recalc(ctx.db, ctx.orgId, id); // price with today's rates, then freeze
  if (!totals.ok) throw new AppError(totals.error);
  const updated = await ownQuote(ctx, id);
  const invalid = updated.options.find((o) => !o.totals.ok);
  if (invalid) throw new AppError(`"${invalid.label}" alternatifi hesaplanamadı. Adet seçeneklerini düzenleyin.`);
  const validUntil = new Date(Date.now() + org.rules.validityDays * 86_400_000);
  await ctx.db.update(quotes).set({ status: "sent", sentAt: new Date(), validUntil }).where(eq(quotes.id, id));
  const url = publicQuoteUrl(q.publicToken);
  const to = q.contact?.email ?? (q.customerId ? (await ownCustomer(ctx, q.customerId)).email : null);
  if (to) {
    await sendMail({ to, subject: `${org.name} — Teklif #${q.number}`, text: `Merhaba,\n\n${org.name} size bir fiyat teklifi gönderdi.\n\nTeklifi görüntülemek ve onaylamak için:\n${url}\n\nGeçerlilik: ${validUntil.toLocaleDateString("tr-TR")}` });
  }
  await audit(ctx, "quote.send", `#${q.number}`);
  return { url, emailed: to };
}

export async function reopenQuote(ctx: Ctx, id: string) {
  need(ctx, "write");
  const q = await ownQuote(ctx, id);
  if (q.status === "accepted") throw new AppError("Onaylanmış teklif taslağa alınamaz.");
  await ctx.db.update(quotes).set({ status: "draft", sentAt: null, decidedAt: null, validUntil: null, selectedOptionId: null }).where(eq(quotes.id, id));
}

/** Staff can record a decision received by phone; customers decide through the public link. */
export async function decideQuote(ctx: Ctx, id: string, decision: "accepted" | "rejected") {
  need(ctx, "write");
  const q = await ownQuote(ctx, id);
  if (q.status !== "sent") throw new AppError("Yalnızca gönderilmiş teklifler onaylanabilir veya reddedilebilir.");
  await applyDecision(ctx.db, q, decision);
  await audit(ctx, `quote.${decision}`, `#${q.number}`);
}

async function applyDecision(db: DB, q: typeof quotes.$inferSelect, decision: "accepted" | "rejected", optionId?: string) {
  const option = optionId ? q.options.find((o) => o.id === optionId) : undefined;
  if (optionId && (decision !== "accepted" || !option?.totals.ok)) throw new AppError("Adet seçeneği geçerli değil. Sayfayı yenileyin.");
  await db.transaction(async (tx) => {
    const done = await tx.update(quotes).set({ status: decision, decidedAt: new Date(), ...(option ? { totals: option.totals, selectedOptionId: option.id } : {}) })
      .where(and(eq(quotes.id, q.id), eq(quotes.orgId, q.orgId), eq(quotes.status, "sent"))).returning({ id: quotes.id });
    if (done.length && decision === "accepted") {
      if (option) for (const result of option.lines) {
        await tx.update(quoteItems).set({ qty: option.quantities[result.id], result })
          .where(and(eq(quoteItems.id, result.id), eq(quoteItems.quoteId, q.id), eq(quoteItems.orgId, q.orgId)));
      }
      await tx.insert(orders).values({ orgId: q.orgId, quoteId: q.id }).onConflictDoNothing();
    }
  });
}

function sameItemSet(items: PriceItem[], quantities: Record<string, number>) {
  return items.length === Object.keys(quantities).length && items.every((it) => Object.hasOwn(quantities, it.id));
}
function priceOption(id: string, label: string, quantities: Record<string, number>, items: PriceItem[], cat: Catalog, org: Pick<typeof orgs.$inferSelect, "rules">): QuantityOption {
  const r = price(items.map((it) => ({ ...it, qty: quantities[it.id] })), cat, org);
  return { id, label, quantities, totals: r.totals, lines: r.lines ?? [] };
}

/** Every option is a complete quote: stock sharing, setup, discounts, minimum and VAT are recalculated together. */
export async function saveQuantityOptions(ctx: Ctx, quoteId: string, input: { label: string; quantities: Record<string, number> }[]) {
  need(ctx, "write");
  await draftQuote(ctx, quoteId);
  const data = z.array(z.object({ label: z.string().trim().min(1).max(60), quantities: z.record(z.string(), z.number().int().min(1).max(100_000)) })).max(3).parse(input);
  const { items } = await getQuote(ctx, quoteId);
  if (!items.length && data.length) throw new AppError("Önce teklife parça ekleyin.");
  const [org, cat] = await Promise.all([loadOrg(ctx.db, ctx.orgId), catalogOf(ctx.db, ctx.orgId)]);
  const options = data.map((o) => {
    if (!sameItemSet(items, o.quantities)) throw new AppError("Her alternatifte teklifin tüm parçaları için adet girin.");
    const option = priceOption(crypto.randomUUID(), o.label, o.quantities, items, cat, org);
    if (!option.totals.ok) throw new AppError(option.totals.error);
    return option;
  });
  await ctx.db.update(quotes).set({ options }).where(and(eq(quotes.id, quoteId), eq(quotes.orgId, ctx.orgId)));
  return options;
}

export async function listQuotes(ctx: Ctx, filter: { status?: string; q?: string } = {}) {
  need(ctx, "read");
  const conds = [eq(quotes.orgId, ctx.orgId)];
  if (filter.status && ["draft", "sent", "accepted", "rejected"].includes(filter.status)) conds.push(eq(quotes.status, filter.status as "draft"));
  const term = filter.q?.trim();
  if (term) {
    const like = `%${term.replace(/[%_\\]/g, "\\$&")}%`;
    const n = Number(term.replace(/^#/, ""));
    conds.push(or(ilike(customers.name, like), sql`${quotes.contact}->>'name' ilike ${like}`, Number.isInteger(n) ? eq(quotes.number, n) : undefined)!);
  }
  return ctx.db.select({
    id: quotes.id, number: quotes.number, status: quotes.status, source: quotes.source, totals: quotes.totals, createdAt: quotes.createdAt,
    validUntil: quotes.validUntil, customerName: customers.name, contact: quotes.contact,
    itemCount: sql<number>`(select count(*)::int from ${quoteItems} where ${quoteItems.quoteId} = ${quotes.id})`,
  }).from(quotes).leftJoin(customers, eq(customers.id, quotes.customerId)).where(and(...conds)).orderBy(desc(quotes.createdAt)).limit(200);
}

export async function getQuote(ctx: Ctx, id: string) {
  need(ctx, "read");
  const quote = await ownQuote(ctx, id);
  const [items, [customer], [order]] = await Promise.all([
    ctx.db.select().from(quoteItems).where(and(eq(quoteItems.quoteId, id), eq(quoteItems.orgId, ctx.orgId))).orderBy(quoteItems.position),
    quote.customerId ? ctx.db.select().from(customers).where(and(eq(customers.id, quote.customerId), eq(customers.orgId, ctx.orgId))) : Promise.resolve([]),
    ctx.db.select().from(orders).where(and(eq(orders.quoteId, id), eq(orders.orgId, ctx.orgId))),
  ]);
  return { quote, items, customer: customer ?? null, order: order ?? null };
}

/** Nesting layout for the quote detail screen, recomputed on demand rather than stored. */
export async function quoteNesting(ctx: Ctx, id: string) {
  need(ctx, "read");
  const [org, cat, items] = await Promise.all([
    loadOrg(ctx.db, ctx.orgId), catalogOf(ctx.db, ctx.orgId),
    ctx.db.select().from(quoteItems).where(and(eq(quoteItems.quoteId, id), eq(quoteItems.orgId, ctx.orgId))).orderBy(quoteItems.position),
  ]);
  const r = price(items, cat, org);
  if (!r.totals.ok || !r.stocks) return [];
  return r.stocks.map((s, i) => {
    const mat = cat.materials.find((m) => m.id === s.stockKey.split("|")[0])!;
    return { label: r.totals.ok ? r.totals.stocks[i].label : "", sheetW: mat.sheetW, sheetH: mat.sheetH, sheetCount: s.sheetCount, estimated: s.estimated, first: s.nest.sheets[0], last: s.nest.sheets[s.nest.sheets.length - 1] };
  });
}

export async function getFile(ctx: Ctx, fileId: string) {
  need(ctx, "read");
  const [f] = await ctx.db.select().from(files).where(and(eq(files.id, fileId), eq(files.orgId, ctx.orgId)));
  if (!f) throw new AppError("Dosya bulunamadı.", "not_found");
  return f;
}

export async function dashboard(ctx: Ctx) {
  need(ctx, "read");
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [rows, org, used] = await Promise.all([
    ctx.db.select({ status: quotes.status, totals: quotes.totals, createdAt: quotes.createdAt, source: quotes.source }).from(quotes)
      .where(and(eq(quotes.orgId, ctx.orgId), sql`${quotes.createdAt} >= ${since}`)),
    loadOrg(ctx.db, ctx.orgId), quotesThisMonth(ctx.db, ctx.orgId),
  ]);
  const net = (r: (typeof rows)[number]) => (r.totals?.ok ? r.totals.net : 0);
  const decided = rows.filter((r) => r.status === "accepted" || r.status === "rejected");
  return {
    count: rows.length,
    quotedNet: rows.filter((r) => r.status !== "draft").reduce((s, r) => s + net(r), 0),
    acceptedNet: rows.filter((r) => r.status === "accepted").reduce((s, r) => s + net(r), 0),
    winRate: decided.length ? rows.filter((r) => r.status === "accepted").length / decided.length : null,
    waiting: rows.filter((r) => r.status === "sent").length,
    fromPortal: rows.filter((r) => r.source === "portal").length,
    usedThisMonth: used,
    ent: entitlements(org),
    org,
  };
}

// ---- Customers --------------------------------------------------------------

async function ownCustomer(ctx: Ctx, id: string) {
  const [c] = await ctx.db.select().from(customers).where(and(eq(customers.id, id), eq(customers.orgId, ctx.orgId)));
  if (!c) throw new AppError("Müşteri bulunamadı.", "not_found");
  return c;
}
const customerInput = z.object({
  id: z.string().optional(), name: z.string().trim().min(2, "Müşteri adını girin.").max(160),
  email: z.union([z.literal(""), z.string().trim().toLowerCase().email("Geçerli bir e-posta girin.")]).optional(),
  phone: z.string().trim().max(30).optional(), taxNo: z.string().trim().max(20).optional(), note: z.string().trim().max(1000).optional(),
});
export async function saveCustomer(ctx: Ctx, input: z.input<typeof customerInput>) {
  need(ctx, "write");
  const { id, ...d } = customerInput.parse(input);
  const data = { ...d, email: d.email || null };
  if (id) {
    const [row] = await ctx.db.update(customers).set(data).where(and(eq(customers.id, id), eq(customers.orgId, ctx.orgId))).returning();
    if (!row) throw new AppError("Müşteri bulunamadı.", "not_found");
    return row;
  }
  await needActive(ctx);
  const [row] = await ctx.db.insert(customers).values({ ...data, orgId: ctx.orgId }).returning();
  return row;
}
export async function deleteCustomer(ctx: Ctx, id: string) {
  need(ctx, "write");
  await ctx.db.delete(customers).where(and(eq(customers.id, id), eq(customers.orgId, ctx.orgId)));
}
export async function listCustomers(ctx: Ctx) {
  need(ctx, "read");
  return ctx.db.select({
    id: customers.id, name: customers.name, email: customers.email, phone: customers.phone, taxNo: customers.taxNo, note: customers.note,
    quoteCount: sql<number>`(select count(*)::int from ${quotes} where ${quotes.customerId} = ${customers.id})`,
  }).from(customers).where(eq(customers.orgId, ctx.orgId)).orderBy(customers.name);
}

// ---- Orders -----------------------------------------------------------------

export const ORDER_STATUSES: OrderStatus[] = ["new", "cutting", "finishing", "ready", "delivered"];
export async function listOrders(ctx: Ctx) {
  need(ctx, "read");
  return ctx.db.select({
    id: orders.id, status: orders.status, dueDate: orders.dueDate, note: orders.note, createdAt: orders.createdAt,
    quoteId: quotes.id, number: quotes.number, totals: quotes.totals, customerName: customers.name, contact: quotes.contact,
  }).from(orders).innerJoin(quotes, eq(quotes.id, orders.quoteId)).leftJoin(customers, eq(customers.id, quotes.customerId))
    .where(eq(orders.orgId, ctx.orgId)).orderBy(desc(orders.createdAt)).limit(300);
}
export async function updateOrder(ctx: Ctx, id: string, input: { status?: string; dueDate?: string | null; note?: string }) {
  need(ctx, "write");
  const set: Partial<typeof orders.$inferInsert> = {};
  if (input.status !== undefined) set.status = z.enum(["new", "cutting", "finishing", "ready", "delivered"]).parse(input.status);
  if (input.dueDate !== undefined) set.dueDate = input.dueDate ? z.coerce.date().parse(input.dueDate) : null;
  if (input.note !== undefined) set.note = String(input.note).slice(0, 1000);
  const rows = await ctx.db.update(orders).set(set).where(and(eq(orders.id, id), eq(orders.orgId, ctx.orgId))).returning({ id: orders.id });
  if (!rows.length) throw new AppError("Sipariş bulunamadı.", "not_found");
}

// ---- Support ----------------------------------------------------------------

export async function sendSupport(ctx: Ctx, input: { subject: string; body: string }) {
  need(ctx, "read");
  const data = z.object({ subject: z.string().trim().min(3, "Konu girin.").max(160), body: z.string().trim().min(10, "Mesajınızı biraz daha açın.").max(5000) }).parse(input);
  await ctx.db.insert(supportMessages).values({ ...data, orgId: ctx.orgId, userId: ctx.userId });
  if (process.env.SUPPORT_EMAIL) await sendMail({ to: process.env.SUPPORT_EMAIL, subject: `[Destek] ${data.subject}`, text: `Firma: ${ctx.orgId}\nKullanıcı: ${ctx.userId}\n\n${data.body}` });
}

// ---- Public: customer-facing quote link ---------------------------------------

export async function getPublicQuote(db: DB, token: string) {
  const [row] = await db.select({ quote: quotes, org: orgs, customerName: customers.name }).from(quotes)
    .innerJoin(orgs, eq(orgs.id, quotes.orgId)).leftJoin(customers, eq(customers.id, quotes.customerId)).where(eq(quotes.publicToken, token));
  if (!row || row.quote.status === "draft") return null;
  const items = await db.select({
    id: quoteItems.id, name: quoteItems.name, partCode: quoteItems.partCode, revision: quoteItems.revision, qty: quoteItems.qty, thickness: quoteItems.thickness, analysis: quoteItems.analysis, result: quoteItems.result, materialName: materials.name, ops: quoteItems.ops, customerMaterial: quoteItems.customerMaterial,
  }).from(quoteItems).leftJoin(materials, eq(materials.id, quoteItems.materialId)).where(eq(quoteItems.quoteId, row.quote.id)).orderBy(quoteItems.position);
  const expired = row.quote.status === "sent" && !!row.quote.validUntil && row.quote.validUntil < new Date();
  return {
    quote: { ...row.quote, options: row.quote.options.map((o) => ({ id: o.id, label: o.label, totals: o.totals,
      lines: o.lines.map((l) => ({ id: l.id, qty: o.quantities[l.id], unitPrice: l.unitPrice, lineTotal: l.lineTotal })) })) },
    expired, customerName: row.customerName ?? row.quote.contact?.company ?? row.quote.contact?.name ?? null,
    org: { name: row.org.name, company: row.org.company },
    // customers see prices, never the shop's cost breakdown or margin
    items: items.map((i) => ({ id: i.id, name: i.name, partCode: i.partCode, revision: i.revision, qty: i.qty, thickness: i.thickness, materialName: i.materialName, ops: i.ops.map((o) => o.name), customerMaterial: i.customerMaterial, width: i.analysis.width, height: i.analysis.height, preview: i.analysis.preview, unitPrice: i.result?.unitPrice ?? null, lineTotal: i.result?.lineTotal ?? null })),
  };
}

export async function decidePublicQuote(db: DB, token: string, decision: "accepted" | "rejected", optionId?: string) {
  rateLimit(`decide:${token}`, 10, 60 * 60_000);
  const [q] = await db.select().from(quotes).where(eq(quotes.publicToken, token));
  if (!q || q.status !== "sent") throw new AppError("Bu teklif artık yanıtlanamaz.");
  if (q.validUntil && q.validUntil < new Date()) throw new AppError("Teklifin geçerlilik süresi dolmuş. Lütfen firmadan güncel teklif isteyin.");
  await applyDecision(db, q, decision, optionId);
  await audit({ db, orgId: q.orgId }, `quote.${decision}`, `#${q.number} (müşteri bağlantısı)`);
  const owners = await db.select({ email: users.email }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(and(eq(memberships.orgId, q.orgId), eq(memberships.role, "owner")));
  for (const o of owners) {
    await sendMail({ to: o.email, subject: `Teklif #${q.number} ${decision === "accepted" ? "onaylandı" : "reddedildi"}`, text: `Müşteriniz #${q.number} numaralı teklifi ${decision === "accepted" ? "onayladı. Sipariş oluşturuldu." : "reddetti."}\n${appUrl()}/panel/teklifler/${q.id}` });
  }
}

// ---- Public: instant-quote portal ---------------------------------------------

async function portalOrg(db: DB, slug: string) {
  const [org] = await db.select().from(orgs).where(eq(orgs.slug, slug));
  if (!org || !org.portalEnabled || !entitlements(org).portal) return null;
  return org;
}

export async function getPortal(db: DB, slug: string) {
  const org = await portalOrg(db, slug);
  if (!org) return null;
  const cat = await catalogOf(db, org.id);
  const options = cat.materials.map((m) => ({
    id: m.id, name: m.name,
    thicknesses: [...new Set(cat.cutParams.filter((p) => p.materialId === m.id).map((p) => p.thickness))].sort((a, b) => a - b),
  })).filter((m) => m.thicknesses.length);
  return { name: org.name, slug: org.slug, showPrice: org.portalShowPrice, company: org.company, materials: options };
}

const portalItem = z.object({
  fileName: z.string().min(1).max(200), content: z.string().min(1).max(MAX_DXF_BYTES),
  materialId: z.string(), thickness: z.coerce.number().positive().max(300), qty: z.coerce.number().int().min(1).max(100_000),
});
type PortalItem = z.infer<typeof portalItem>;

function portalLines(items: PortalItem[], cat: Catalog): PriceItem[] {
  return items.map((it, i) => {
    // the visitor picks material and thickness; the shop's first machine that can cut it does the job
    const machine = cat.machines.find((m) => cat.cutParams.some((p) => p.machineId === m.id && p.materialId === it.materialId));
    const analysis = analyze(it.fileName, it.content);
    return { id: `p${i}`, name: it.fileName.replace(/\.dxf$/i, ""), analysis, materialId: it.materialId, machineId: machine?.id ?? null, thickness: it.thickness, qty: it.qty, bends: analysis.bendCount, extraPerUnit: 0, ops: [], customerMaterial: false };
  });
}

/** Stateless estimate for the public portal: analyses the drawing and, if the shop allows it, prices it. Stores nothing. */
export async function portalEstimate(db: DB, slug: string, input: unknown, ip: string) {
  rateLimit(`portal:${ip}`, 60, 10 * 60_000);
  const org = await portalOrg(db, slug);
  if (!org) throw new AppError("Bu portal etkin değil.", "not_found");
  const items = z.array(portalItem).min(1).max(10).parse(input);
  const cat = await catalogOf(db, org.id);
  const lines = portalLines(items, cat);
  const r = price(lines, cat, org);
  return {
    items: lines.map((l) => {
      const res = r.lines?.find((x) => x.id === l.id);
      const a = l.analysis;
      return { name: l.name, width: a.width, height: a.height, cutLength: a.cutLength, pierceCount: a.pierceCount, warnings: a.warnings, preview: a.preview, unitPrice: org.portalShowPrice ? res?.unitPrice ?? null : null, lineTotal: org.portalShowPrice ? res?.lineTotal ?? null : null };
    }),
    totals: org.portalShowPrice && r.totals.ok ? { net: r.totals.net, vat: r.totals.vat, gross: r.totals.gross } : null,
    error: r.totals.ok ? null : "Bu seçim için otomatik fiyat verilemiyor; talebinizi gönderin, firma size dönüş yapsın.",
  };
}

const contactInput = z.object({
  name: z.string().trim().min(2, "Adınızı girin.").max(100), email: z.string().trim().toLowerCase().email("Geçerli bir e-posta girin."),
  phone: z.string().trim().max(30).optional(), company: z.string().trim().max(120).optional(),
});
/** Turns a portal request into a draft quote in the shop's panel. The shop reviews and sends it; nothing is promised automatically. */
export async function portalSubmit(db: DB, slug: string, input: { contact: unknown; items: unknown; note?: string }, ip: string) {
  rateLimit(`portal-submit:${ip}`, 10, 60 * 60_000);
  const org = await portalOrg(db, slug);
  if (!org) throw new AppError("Bu portal etkin değil.", "not_found");
  const contact: Contact = contactInput.parse(input.contact);
  const items = z.array(portalItem).min(1, "En az bir DXF ekleyin.").max(10).parse(input.items);
  const lines = portalLines(items, await catalogOf(db, org.id));
  const quote = await insertQuote(db, { orgId: org.id, contact, source: "portal", notes: input.note ? String(input.note).slice(0, 2000) : null });
  for (const [i, l] of lines.entries()) {
    const [f] = await db.insert(files).values({ orgId: org.id, name: items[i].fileName, size: items[i].content.length, content: items[i].content }).returning({ id: files.id });
    await db.insert(quoteItems).values({ quoteId: quote.id, orgId: org.id, name: l.name, fileId: f.id, analysis: l.analysis, materialId: l.materialId, machineId: l.machineId, thickness: l.thickness, qty: l.qty, bends: l.bends, position: i });
  }
  await recalc(db, org.id, quote.id);
  await audit({ db, orgId: org.id }, "portal.request", `#${quote.number} ${contact.email}`);
  const staff = await db.select({ email: users.email }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(and(eq(memberships.orgId, org.id), inArray(memberships.role, ["owner", "admin"])));
  for (const s of staff) {
    await sendMail({ to: s.email, subject: `Portaldan yeni teklif talebi #${quote.number}`, text: `${contact.name}${contact.company ? ` (${contact.company})` : ""} portal üzerinden ${lines.length} parça için teklif istedi.\n${appUrl()}/panel/teklifler/${quote.id}` });
  }
  return { number: quote.number };
}
