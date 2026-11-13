import { type NestResult, nest } from "./nesting";

/** One row of a machine's cutting table for a given material. */
export type CutParam = { thickness: number; feedMmMin: number; pierceSec: number };

export type LineInput = {
  id: string;
  qty: number;
  /** Per-unit metrics from the DXF analysis (one unit = one copy of the drawing). */
  cutLength: number;
  pierceCount: number;
  netArea: number;
  rects: { w: number; h: number }[];
  bends: number;
  /** Extra cost per unit in currency (welding, coating, etc.). */
  extraPerUnit: number;
  /** One-off cost for the whole line (operation set-up or batch fee), on top of extraPerUnit. */
  extraSetup?: number;
  /** The customer supplies the sheet: it is still nested (sheet count), but not charged. */
  customerMaterial?: boolean;
  thickness: number;
  /** Lines sharing a stockKey are nested together on the same sheets. */
  stockKey: string;
  material: { densityGcm3: number; pricePerKg: number; sheetW: number; sheetH: number };
  machine: { ratePerMin: number; params: CutParam[] };
};

export type Rules = {
  marginPct: number;
  setupFee: number;
  minOrder: number;
  vatPct: number;
  bendRate: number;
  bendSetup: number;
  rapidSecPerPierce: number;
  sheetMargin: number;
  partGap: number;
  /** "used-length": charge the last sheet by the strip actually consumed; "full-sheet": charge whole sheets. */
  remnantPolicy: "used-length" | "full-sheet";
  qtyBreaks: { minQty: number; discountPct: number }[];
};

export type LineResult = {
  id: string;
  minutesPerUnit: number;
  netWeightKgPerUnit: number;
  machineCost: number;
  materialCost: number;
  bendCost: number;
  extraCost: number;
  setupCost: number;
  marginAmount: number;
  discountPct: number;
  discountAmount: number;
  unitPrice: number;
  lineTotal: number;
};

export type StockResult = {
  stockKey: string;
  sheetCount: number;
  billableSheets: number;
  billableWeightKg: number;
  utilization: number;
  estimated: boolean;
  nest: NestResult;
};

export type QuoteResult = {
  lines: LineResult[];
  stocks: StockResult[];
  subtotal: number;
  minOrderAdjustment: number;
  net: number;
  vat: number;
  gross: number;
};

export class CostError extends Error {}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Linear interpolation inside the cutting table; never extrapolates beyond what the shop has entered. */
export function cutParamFor(params: CutParam[], thickness: number): CutParam {
  const rows = params.filter((p) => p.feedMmMin > 0).sort((a, b) => a.thickness - b.thickness);
  if (!rows.length) throw new CostError("Bu makine/malzeme için kesim parametresi tanımlı değil.");
  const exact = rows.find((r) => Math.abs(r.thickness - thickness) < 1e-9);
  if (exact) return exact;
  const hi = rows.findIndex((r) => r.thickness > thickness);
  if (hi <= 0) throw new CostError(`${thickness} mm kalınlık, tanımlı kesim tablosunun (${rows[0].thickness}–${rows[rows.length - 1].thickness} mm) dışında.`);
  const a = rows[hi - 1], b = rows[hi], t = (thickness - a.thickness) / (b.thickness - a.thickness);
  return { thickness, feedMmMin: a.feedMmMin + t * (b.feedMmMin - a.feedMmMin), pierceSec: a.pierceSec + t * (b.pierceSec - a.pierceSec) };
}

export function priceQuote(lines: LineInput[], rules: Rules): QuoteResult {
  if (!lines.length) throw new CostError("Teklifte kalem yok.");
  for (const l of lines) {
    if (!Number.isInteger(l.qty) || l.qty < 1) throw new CostError("Adet en az 1 olmalı.");
    if (!(l.thickness > 0)) throw new CostError("Kalınlık sıfırdan büyük olmalı.");
    if (!l.rects.length) throw new CostError("Çizimde kapalı parça konturu yok; fiyat hesaplanamaz.");
  }

  // Material: nest every stock group, then split the billable weight by bounding-box area share.
  const groups = new Map<string, LineInput[]>();
  for (const l of lines) (groups.get(l.stockKey) ?? groups.set(l.stockKey, []).get(l.stockKey)!).push(l);
  const stocks: StockResult[] = [];
  const materialByLine = new Map<string, number>();
  for (const [stockKey, group] of groups) {
    const { material, thickness } = group[0];
    const items = group.flatMap((l) => l.rects.map((r, i) => ({ id: `${l.id}#${i}`, w: r.w, h: r.h, qty: l.qty })));
    const n = nest(items, { sheetW: material.sheetW, sheetH: material.sheetH, margin: rules.sheetMargin, gap: rules.partGap });
    const billableSheets = rules.remnantPolicy === "full-sheet" ? n.sheetCount : n.billableSheets;
    const sheetKg = (material.sheetW * material.sheetH * thickness * material.densityGcm3) / 1e6;
    const billableWeightKg = billableSheets * sheetKg;
    const areaOf = (l: LineInput) => l.qty * l.rects.reduce((s, r) => s + r.w * r.h, 0);
    const totalArea = group.reduce((s, l) => s + areaOf(l), 0);
    for (const l of group) materialByLine.set(l.id, (billableWeightKg * material.pricePerKg * areaOf(l)) / totalArea);
    stocks.push({
      stockKey, sheetCount: n.sheetCount, billableSheets, billableWeightKg,
      utilization: totalArea / (n.billableSheets * material.sheetW * material.sheetH), estimated: n.estimated, nest: n,
    });
  }

  const breaks = [...rules.qtyBreaks].sort((a, b) => b.minQty - a.minQty);
  const out: LineResult[] = lines.map((l) => {
    const p = cutParamFor(l.machine.params, l.thickness);
    const minutesPerUnit = l.cutLength / p.feedMmMin + (l.pierceCount * (p.pierceSec + rules.rapidSecPerPierce)) / 60;
    const machineCost = minutesPerUnit * l.machine.ratePerMin * l.qty;
    const materialCost = l.customerMaterial ? 0 : materialByLine.get(l.id)!;
    const bendCost = l.bends > 0 ? l.bends * rules.bendRate * l.qty + rules.bendSetup : 0;
    const extraCost = l.extraPerUnit * l.qty + (l.extraSetup ?? 0);
    const cost = machineCost + materialCost + bendCost + extraCost;
    const marginAmount = (cost * rules.marginPct) / 100;
    const discountPct = breaks.find((b) => l.qty >= b.minQty)?.discountPct ?? 0;
    const discountAmount = ((cost + marginAmount) * discountPct) / 100;
    const lineTotal = round2(cost + marginAmount - discountAmount + rules.setupFee);
    return {
      id: l.id,
      minutesPerUnit,
      netWeightKgPerUnit: (l.netArea * l.thickness * l.material.densityGcm3) / 1e6,
      machineCost: round2(machineCost), materialCost: round2(materialCost), bendCost: round2(bendCost),
      extraCost: round2(extraCost), setupCost: round2(rules.setupFee), marginAmount: round2(marginAmount),
      discountPct, discountAmount: round2(discountAmount),
      unitPrice: round2(lineTotal / l.qty), lineTotal,
    };
  });

  const subtotal = round2(out.reduce((s, l) => s + l.lineTotal, 0));
  const minOrderAdjustment = round2(Math.max(0, rules.minOrder - subtotal));
  const net = round2(subtotal + minOrderAdjustment);
  const vat = round2((net * rules.vatPct) / 100);
  return { lines: out, stocks, subtotal, minOrderAdjustment, net, vat, gross: round2(net + vat) };
}
