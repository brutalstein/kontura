import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { AppError, type Ctx, audit, entitlements, loadOrg, need } from "./core";
import { OP_UNITS, type OrgRules, cutParams, machines, materials, operations, orgs } from "./schema";

const pos = (msg: string, max = 1e7) => z.coerce.number({ message: msg }).positive(msg).max(max, msg);
const nonneg = (msg: string, max = 1e7) => z.coerce.number({ message: msg }).min(0, msg).max(max, msg);
const name = z.string().trim().min(1, "Ad girin.").max(80);

/** Illustrative starting values only — every shop must replace them with its own machine's cutting chart. Rows: [thickness mm, feed mm/min, pierce s]. */
export const LASER_PRESETS = {
  "3kw": {
    label: "Fiber lazer 3 kW",
    tables: {
      dkp: [[1, 22000, 0.2], [2, 7500, 0.4], [3, 4200, 0.6], [4, 3300, 0.8], [5, 2800, 1], [6, 2400, 1.2], [8, 1700, 1.8], [10, 1250, 2.5], [12, 1000, 3], [15, 750, 4], [20, 500, 6]],
      paslanmaz: [[1, 22000, 0.2], [2, 8500, 0.4], [3, 4300, 0.6], [4, 2700, 0.9], [5, 1700, 1.2], [6, 1200, 1.6], [8, 600, 2.5], [10, 350, 4]],
      aluminyum: [[1, 20000, 0.2], [2, 7500, 0.4], [3, 4200, 0.6], [4, 2400, 0.9], [5, 1500, 1.3], [6, 950, 1.8], [8, 480, 3]],
      galvaniz: [[1, 20000, 0.2], [2, 7000, 0.4], [3, 3800, 0.6]],
    },
  },
  "6kw": {
    label: "Fiber lazer 6 kW",
    tables: {
      dkp: [[1, 35000, 0.1], [2, 15000, 0.2], [3, 8000, 0.3], [4, 5500, 0.5], [5, 4200, 0.6], [6, 3500, 0.8], [8, 2600, 1], [10, 2000, 1.5], [12, 1600, 2], [15, 1200, 2.5], [20, 800, 4], [25, 550, 6]],
      paslanmaz: [[1, 35000, 0.1], [2, 16000, 0.2], [3, 8500, 0.3], [4, 5500, 0.5], [5, 4000, 0.7], [6, 3000, 0.9], [8, 1800, 1.4], [10, 1100, 2], [12, 750, 3], [15, 400, 4.5]],
      aluminyum: [[1, 32000, 0.1], [2, 15000, 0.2], [3, 8000, 0.3], [4, 5500, 0.5], [5, 4000, 0.7], [6, 3000, 0.9], [8, 1700, 1.4], [10, 1000, 2], [12, 650, 3]],
      galvaniz: [[1, 32000, 0.1], [2, 14000, 0.2], [3, 7500, 0.3], [4, 5000, 0.5]],
    },
  },
} as const;
export type PresetKey = keyof typeof LASER_PRESETS;
export const MATERIAL_PRESETS = [
  { key: "dkp", name: "DKP / siyah sac (S235)", densityGcm3: 7.85 },
  { key: "paslanmaz", name: "Paslanmaz 304", densityGcm3: 7.93 },
  { key: "aluminyum", name: "Alüminyum 5754", densityGcm3: 2.67 },
  { key: "galvaniz", name: "Galvaniz sac", densityGcm3: 7.85 },
] as const;
type MaterialKey = (typeof MATERIAL_PRESETS)[number]["key"];

export async function listCatalog(ctx: Ctx) {
  need(ctx, "read");
  const [m, mat, cp, ops] = await Promise.all([
    ctx.db.select().from(machines).where(eq(machines.orgId, ctx.orgId)).orderBy(machines.createdAt),
    ctx.db.select().from(materials).where(eq(materials.orgId, ctx.orgId)).orderBy(materials.createdAt),
    ctx.db.select().from(cutParams).where(eq(cutParams.orgId, ctx.orgId)).orderBy(cutParams.thickness),
    ctx.db.select().from(operations).where(eq(operations.orgId, ctx.orgId)).orderBy(operations.createdAt),
  ]);
  return { machines: m, materials: mat, cutParams: cp, operations: ops };
}

const money = (msg: string) => z.coerce.number({ message: msg }).min(0, msg).max(1e7, msg);
const operationInput = z.object({
  id: z.string().optional(), name, unit: z.enum(OP_UNITS),
  price: money("Birim fiyat sıfır veya daha büyük olmalı."), setupFee: money("Parti ücreti sıfır veya daha büyük olmalı."),
});
export async function saveOperation(ctx: Ctx, input: z.input<typeof operationInput>) {
  need(ctx, "settings");
  const { id, ...data } = operationInput.parse(input);
  if (id) {
    const [row] = await ctx.db.update(operations).set(data).where(and(eq(operations.id, id), eq(operations.orgId, ctx.orgId))).returning();
    if (!row) throw new AppError("İşlem bulunamadı.", "not_found");
    return row;
  }
  const [row] = await ctx.db.insert(operations).values({ ...data, orgId: ctx.orgId }).returning();
  return row;
}
/** Draft quotes that still use the operation stop pricing until it is removed from the line; sent quotes keep their frozen price. */
export async function deleteOperation(ctx: Ctx, id: string) {
  need(ctx, "settings");
  await ctx.db.delete(operations).where(and(eq(operations.id, id), eq(operations.orgId, ctx.orgId)));
}

const machineInput = z.object({ id: z.string().optional(), name, kind: z.enum(["laser", "plasma", "waterjet", "oxyfuel"]), ratePerMin: pos("Dakika ücreti sıfırdan büyük olmalı.") });
export async function saveMachine(ctx: Ctx, input: z.input<typeof machineInput>) {
  need(ctx, "settings");
  const { id, ...data } = machineInput.parse(input);
  if (id) {
    const [row] = await ctx.db.update(machines).set(data).where(and(eq(machines.id, id), eq(machines.orgId, ctx.orgId))).returning();
    if (!row) throw new AppError("Makine bulunamadı.", "not_found");
    return row;
  }
  const [row] = await ctx.db.insert(machines).values({ ...data, orgId: ctx.orgId }).returning();
  return row;
}
export async function deleteMachine(ctx: Ctx, id: string) {
  need(ctx, "settings");
  await ctx.db.delete(machines).where(and(eq(machines.id, id), eq(machines.orgId, ctx.orgId)));
}

const materialInput = z.object({
  id: z.string().optional(), name,
  densityGcm3: pos("Yoğunluk sıfırdan büyük olmalı.", 25), pricePerKg: pos("Kg fiyatı sıfırdan büyük olmalı."),
  currency: z.enum(["TRY", "USD", "EUR"]),
  sheetW: pos("Plaka boyu sıfırdan büyük olmalı.", 20000), sheetH: pos("Plaka eni sıfırdan büyük olmalı.", 20000),
});
export async function saveMaterial(ctx: Ctx, input: z.input<typeof materialInput>) {
  need(ctx, "settings");
  const { id, ...data } = materialInput.parse(input);
  if (id) {
    const [row] = await ctx.db.update(materials).set(data).where(and(eq(materials.id, id), eq(materials.orgId, ctx.orgId))).returning();
    if (!row) throw new AppError("Malzeme bulunamadı.", "not_found");
    return row;
  }
  const [row] = await ctx.db.insert(materials).values({ ...data, orgId: ctx.orgId }).returning();
  return row;
}
export async function deleteMaterial(ctx: Ctx, id: string) {
  need(ctx, "settings");
  await ctx.db.delete(materials).where(and(eq(materials.id, id), eq(materials.orgId, ctx.orgId)));
}

const tableInput = z.array(z.object({
  thickness: pos("Kalınlık sıfırdan büyük olmalı.", 300), feedMmMin: pos("Kesim hızı sıfırdan büyük olmalı."), pierceSec: nonneg("Delme süresi negatif olamaz.", 600),
})).max(60);
/** Replaces the whole cutting table for one machine + material pair. */
export async function saveCutTable(ctx: Ctx, machineId: string, materialId: string, rows: z.input<typeof tableInput>) {
  need(ctx, "settings");
  const data = tableInput.parse(rows);
  if (new Set(data.map((r) => r.thickness)).size !== data.length) throw new AppError("Aynı kalınlık iki kez girilmiş.");
  // both ids come from the client: confirm they belong to this org before writing rows that reference them
  const [m] = await ctx.db.select({ id: machines.id }).from(machines).where(and(eq(machines.id, machineId), eq(machines.orgId, ctx.orgId)));
  const [mat] = await ctx.db.select({ id: materials.id }).from(materials).where(and(eq(materials.id, materialId), eq(materials.orgId, ctx.orgId)));
  if (!m || !mat) throw new AppError("Makine veya malzeme bulunamadı.", "not_found");
  await ctx.db.transaction(async (tx) => {
    await tx.delete(cutParams).where(and(eq(cutParams.orgId, ctx.orgId), eq(cutParams.machineId, machineId), eq(cutParams.materialId, materialId)));
    if (data.length) await tx.insert(cutParams).values(data.map((r) => ({ ...r, orgId: ctx.orgId, machineId, materialId })));
  });
}

const rulesInput = z.object({
  marginPct: nonneg("Kâr oranı negatif olamaz.", 1000), setupFee: nonneg("Hazırlık ücreti negatif olamaz."), minOrder: nonneg("Minimum sipariş negatif olamaz."),
  vatPct: nonneg("KDV oranı negatif olamaz.", 100), bendRate: nonneg("Büküm ücreti negatif olamaz."), bendSetup: nonneg("Büküm hazırlık ücreti negatif olamaz."),
  rapidSecPerPierce: nonneg("Geçiş süresi negatif olamaz.", 60), sheetMargin: nonneg("Kenar payı negatif olamaz.", 200), partGap: nonneg("Parça aralığı negatif olamaz.", 200),
  remnantPolicy: z.enum(["used-length", "full-sheet"]),
  qtyBreaks: z.array(z.object({ minQty: z.coerce.number().int().min(2).max(1e6), discountPct: nonneg("İndirim negatif olamaz.", 90) })).max(8),
  validityDays: z.coerce.number().int().min(1).max(365),
  fx: z.object({ USD: nonneg("Kur negatif olamaz."), EUR: nonneg("Kur negatif olamaz.") }),
});
export async function saveRules(ctx: Ctx, input: z.input<typeof rulesInput>) {
  need(ctx, "settings");
  const rules: OrgRules = rulesInput.parse(input);
  await ctx.db.update(orgs).set({ rules }).where(eq(orgs.id, ctx.orgId));
  await audit(ctx, "settings.rules");
  return rules;
}

const companyInput = z.object({
  name: z.string().trim().min(2, "Firma adını girin.").max(120),
  taxOffice: z.string().trim().max(80).optional(), taxNo: z.string().trim().max(20).optional(),
  address: z.string().trim().max(300).optional(), phone: z.string().trim().max(30).optional(),
  email: z.union([z.literal(""), z.string().trim().email("Geçerli bir e-posta girin.")]).optional(),
});
export async function saveCompany(ctx: Ctx, input: z.input<typeof companyInput>) {
  need(ctx, "settings");
  const { name: orgName, ...company } = companyInput.parse(input);
  await ctx.db.update(orgs).set({ name: orgName, company }).where(eq(orgs.id, ctx.orgId));
}

export async function savePortal(ctx: Ctx, input: { enabled: boolean; showPrice: boolean }) {
  need(ctx, "settings");
  const org = await loadOrg(ctx.db, ctx.orgId);
  if (input.enabled && !entitlements(org).portal) throw new AppError("Müşteri portalı Atölye ve Pro planlarında kullanılabilir.", "limit");
  await ctx.db.update(orgs).set({ portalEnabled: Boolean(input.enabled), portalShowPrice: Boolean(input.showPrice) }).where(eq(orgs.id, ctx.orgId));
  await audit(ctx, "settings.portal", input.enabled ? "on" : "off");
}

const onboardInput = z.object({
  preset: z.enum(["3kw", "6kw"]),
  machineName: name,
  ratePerMin: pos("Dakika ücreti sıfırdan büyük olmalı."),
  materials: z.array(z.object({ key: z.enum(["dkp", "paslanmaz", "aluminyum", "galvaniz"]), pricePerKg: pos("Kg fiyatı sıfırdan büyük olmalı.") })).min(1, "En az bir malzeme seçin."),
});
/** First-run setup: one machine, the chosen materials and a starting cutting table, so the first quote can be priced immediately. */
export async function onboard(ctx: Ctx, input: z.input<typeof onboardInput>) {
  need(ctx, "settings");
  const data = onboardInput.parse(input);
  const preset = LASER_PRESETS[data.preset];
  await ctx.db.transaction(async (tx) => {
    const [machine] = await tx.insert(machines).values({ orgId: ctx.orgId, name: data.machineName, kind: "laser", ratePerMin: data.ratePerMin }).returning();
    for (const m of data.materials) {
      const def = MATERIAL_PRESETS.find((p) => p.key === m.key)!;
      const [mat] = await tx.insert(materials).values({ orgId: ctx.orgId, name: def.name, densityGcm3: def.densityGcm3, pricePerKg: m.pricePerKg, currency: "TRY", sheetW: 3000, sheetH: 1500 }).returning();
      await tx.insert(cutParams).values(preset.tables[m.key as MaterialKey].map(([thickness, feedMmMin, pierceSec]) => ({ orgId: ctx.orgId, machineId: machine.id, materialId: mat.id, thickness, feedMmMin, pierceSec })));
    }
    await tx.update(orgs).set({ onboardedAt: new Date() }).where(eq(orgs.id, ctx.orgId));
  });
  await audit(ctx, "onboarding.done", data.preset);
}
