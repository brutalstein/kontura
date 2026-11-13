import type { LineResult } from "./costing";

const COMPONENTS = [
  ["machineCost", "Makine"], ["materialCost", "Malzeme"], ["bendCost", "Büküm"], ["extraCost", "Ek işlem"],
  ["setupCost", "Hazırlık"], ["marginAmount", "Kâr"], ["discountAmount", "Adet indirimi"],
] as const;
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Unit contributions, not a claim about why rates changed. Quantities may differ. */
export function compareUnitCosts(baseline: { qty: number; result: LineResult }, current: LineResult, qty: number) {
  const rows = COMPONENTS.map(([key, label]) => {
    const sign = key === "discountAmount" ? -1 : 1;
    const before = sign * baseline.result[key] / baseline.qty, after = sign * current[key] / qty;
    return { key, label, before: round(before), after: round(after), delta: round(after - before) };
  });
  return { before: baseline.result.unitPrice, after: current.unitPrice, delta: round(current.unitPrice - baseline.result.unitPrice), rows };
}
