import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { CostError, type LineInput, NestError, type NestItem, type NestOptions, type NestResult, type Rules, cutParamFor, nest, priceQuote } from "@/engine";

/** Independent checker: does not share code with the nester. */
function validate(res: NestResult, items: NestItem[], o: NestOptions) {
  const counts = new Map<string, number>();
  for (const sheet of res.sheets) {
    const ps = sheet.placements;
    for (const p of ps) {
      counts.set(p.id, (counts.get(p.id) ?? 0) + 1);
      const it = items.find((i) => i.id === p.id)!;
      const [w, h] = p.rotated ? [it.h, it.w] : [it.w, it.h];
      expect(Math.abs(p.w - w)).toBeLessThan(1e-6);
      expect(Math.abs(p.h - h)).toBeLessThan(1e-6);
      expect(p.x).toBeGreaterThanOrEqual(o.margin - 1e-6);
      expect(p.y).toBeGreaterThanOrEqual(o.margin - 1e-6);
      expect(p.x + p.w).toBeLessThanOrEqual(o.sheetW - o.margin + 1e-6);
      expect(p.y + p.h).toBeLessThanOrEqual(o.sheetH - o.margin + 1e-6);
    }
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i], b = ps[j];
      const apart = a.x + a.w + o.gap <= b.x + 1e-6 || b.x + b.w + o.gap <= a.x + 1e-6 || a.y + a.h + o.gap <= b.y + 1e-6 || b.y + b.h + o.gap <= a.y + 1e-6;
      expect(apart, `overlap between ${JSON.stringify(a)} and ${JSON.stringify(b)}`).toBe(true);
    }
  }
  return counts;
}

const sheet: NestOptions = { sheetW: 3000, sheetH: 1500, margin: 10, gap: 5 };

describe("nesting", () => {
  it("places every part, inside the sheet, without overlap (property)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ w: fc.integer({ min: 5, max: 1400 }), h: fc.integer({ min: 5, max: 1400 }), qty: fc.integer({ min: 1, max: 40 }) }), { minLength: 1, maxLength: 6 }),
        fc.integer({ min: 0, max: 20 }), fc.integer({ min: 0, max: 15 }),
        (raw, margin, gap) => {
          const items = raw.map((r, i) => ({ id: `p${i}`, ...r }));
          const o = { ...sheet, margin, gap };
          const res = nest(items, o);
          const counts = validate(res, items, o);
          for (const it of items) expect(counts.get(it.id)).toBe(it.qty);
          // physical lower bound: cannot beat the pure area bound
          const area = items.reduce((s, i) => s + i.w * i.h * i.qty, 0);
          expect(res.sheetCount).toBeGreaterThanOrEqual(Math.ceil(area / (o.sheetW * o.sheetH) - 1e-9));
          expect(res.billableSheets).toBeLessThanOrEqual(res.sheetCount + 1e-9);
        },
      ),
      { numRuns: 150 },
    );
  });

  it("single part type is at least as dense as a plain grid", () => {
    fc.assert(
      fc.property(fc.integer({ min: 20, max: 700 }), fc.integer({ min: 20, max: 700 }), fc.integer({ min: 1, max: 600 }), (w, h, qty) => {
        const res = nest([{ id: "a", w, h, qty }], sheet);
        const per = (pw: number, ph: number) => Math.floor((2980 + 5) / (pw + 5)) * Math.floor((1480 + 5) / (ph + 5));
        const gridCap = Math.max(per(w, h), per(h, w));
        expect(res.sheetCount).toBeLessThanOrEqual(Math.ceil(qty / gridCap));
        validate(res, [{ id: "a", w, h, qty }], sheet);
      }),
      { numRuns: 100 },
    );
  });

  it("known layout: 100×100 parts on a 1000×500 sheet with no margin or gap", () => {
    const res = nest([{ id: "a", w: 100, h: 100, qty: 50 }], { sheetW: 1000, sheetH: 500, margin: 0, gap: 0 });
    expect(res.sheetCount).toBe(1);
    expect(res.sheets[0].utilization).toBeCloseTo(1, 9);
    const more = nest([{ id: "a", w: 100, h: 100, qty: 55 }], { sheetW: 1000, sheetH: 500, margin: 0, gap: 0 });
    expect(more.sheetCount).toBe(2);
    expect(more.billableSheets).toBeCloseTo(1.1, 9); // one full sheet + one 100 mm strip
  });

  it("part-filled sheet: 40 × 240×140 uses four columns of one orientation (995 mm), not the mixed full-sheet pattern", () => {
    const res = nest([{ id: "a", w: 240, h: 140, qty: 40 }], sheet);
    expect(res.sheetCount).toBe(1);
    expect(res.sheets[0].usedLength).toBeCloseTo(995, 6); // 10 + 4 × 245 − 5 + 10
    validate(res, [{ id: "a", w: 240, h: 140, qty: 40 }], sheet);
  });

  it("rejects parts that cannot fit and invalid input", () => {
    expect(() => nest([{ id: "a", w: 3100, h: 100, qty: 1 }], sheet)).toThrow(NestError);
    expect(() => nest([{ id: "a", w: 0, h: 100, qty: 1 }], sheet)).toThrow(NestError);
    expect(() => nest([], sheet)).toThrow(NestError);
    expect(nest([{ id: "a", w: 100, h: 2900, qty: 1 }], sheet).sheets[0].placements[0].rotated).toBe(true);
  });

  it("handles very large jobs quickly", () => {
    const t = performance.now();
    const one = nest([{ id: "a", w: 40, h: 25, qty: 200_000 }], sheet);
    expect(one.sheetCount).toBeGreaterThan(40);
    const mixed = nest([{ id: "a", w: 40, h: 25, qty: 30_000 }, { id: "b", w: 120, h: 80, qty: 9_000 }], sheet);
    expect(mixed.estimated).toBe(true);
    expect(mixed.sheetCount).toBeGreaterThanOrEqual(Math.ceil((30_000 * 1000 + 9_000 * 9600) / 4.5e6));
    expect(performance.now() - t).toBeLessThan(15_000);
  });
});

const rules: Rules = {
  marginPct: 25, setupFee: 0, minOrder: 0, vatPct: 20, bendRate: 10, bendSetup: 100,
  rapidSecPerPierce: 0, sheetMargin: 0, partGap: 0, remnantPolicy: "used-length", qtyBreaks: [],
};
const base = (over: Partial<LineInput> = {}): LineInput => ({
  id: "l1", qty: 10, cutLength: 400, pierceCount: 1, netArea: 10_000, rects: [{ w: 100, h: 100 }], bends: 0, extraPerUnit: 0,
  thickness: 2, stockKey: "dkp-2",
  material: { densityGcm3: 7.85, pricePerKg: 40, sheetW: 1000, sheetH: 500 },
  machine: { ratePerMin: 60, params: [{ thickness: 1, feedMmMin: 8000, pierceSec: 0.2 }, { thickness: 2, feedMmMin: 4000, pierceSec: 0.6 }, { thickness: 4, feedMmMin: 2000, pierceSec: 1 }] },
  ...over,
});

describe("costing", () => {
  it("matches a hand calculation", () => {
    // time/unit = 400/4000 + 0.6/60 = 0.11 min -> machine 0.11*60*10 = 66
    // nesting: 10 parts in a 5-row column pair -> 200 mm of a 1000 mm sheet -> 0.2 sheet
    // sheet weight = 1000*500*2*7.85/1e6 = 7.85 kg -> 1.57 kg -> 62.80
    // cost 128.80, margin 25% = 32.20, net 161.00, VAT 32.20, gross 193.20
    const q = priceQuote([base()], rules);
    expect(q.lines[0].minutesPerUnit).toBeCloseTo(0.11, 9);
    expect(q.lines[0].machineCost).toBe(66);
    expect(q.stocks[0].billableWeightKg).toBeCloseTo(1.57, 9);
    expect(q.lines[0].materialCost).toBe(62.8);
    expect(q.lines[0].marginAmount).toBe(32.2);
    expect(q.lines[0].lineTotal).toBe(161);
    expect(q.lines[0].unitPrice).toBe(16.1);
    expect(q.lines[0].netWeightKgPerUnit).toBeCloseTo(0.157, 9);
    expect([q.net, q.vat, q.gross]).toEqual([161, 32.2, 193.2]);
  });

  it("full-sheet policy charges the whole sheet", () => {
    const q = priceQuote([base()], { ...rules, remnantPolicy: "full-sheet" });
    expect(q.lines[0].materialCost).toBe(314); // 7.85 kg * 40
  });

  it("applies bends, extras, setup, quantity breaks and the minimum order", () => {
    const q = priceQuote([base({ bends: 2, extraPerUnit: 5 })], { ...rules, setupFee: 50, qtyBreaks: [{ minQty: 5, discountPct: 10 }, { minQty: 100, discountPct: 20 }], minOrder: 1000 });
    const l = q.lines[0];
    expect(l.bendCost).toBe(300); // 2*10*10 + 100
    expect(l.extraCost).toBe(50);
    expect(l.discountPct).toBe(10);
    const cost = 66 + 62.8 + 300 + 50;
    expect(l.lineTotal).toBeCloseTo(cost * 1.25 * 0.9 + 50, 2);
    expect(q.minOrderAdjustment).toBeCloseTo(1000 - l.lineTotal, 2);
    expect(q.net).toBe(1000);
  });

  it("interpolates the cutting table and refuses to extrapolate", () => {
    expect(cutParamFor(base().machine.params, 3)).toEqual({ thickness: 3, feedMmMin: 3000, pierceSec: 0.8 });
    expect(() => cutParamFor(base().machine.params, 6)).toThrow(CostError);
    expect(() => cutParamFor(base().machine.params, 0.5)).toThrow(CostError);
    expect(() => cutParamFor([], 2)).toThrow(CostError);
  });

  it("lines on the same stock share sheets; totals stay consistent (property)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({
          qty: fc.integer({ min: 1, max: 200 }), w: fc.integer({ min: 10, max: 400 }), h: fc.integer({ min: 10, max: 400 }),
          cut: fc.integer({ min: 40, max: 20_000 }), pierces: fc.integer({ min: 1, max: 60 }), bends: fc.integer({ min: 0, max: 6 }),
          stock: fc.constantFrom("a", "b"),
        }), { minLength: 1, maxLength: 5 }),
        fc.integer({ min: 0, max: 80 }), fc.integer({ min: 0, max: 5000 }), fc.constantFrom<Rules["remnantPolicy"]>("used-length", "full-sheet"),
        (ls, marginPct, minOrder, remnantPolicy) => {
          const lines = ls.map((l, i) => base({
            id: `l${i}`, qty: l.qty, rects: [{ w: l.w, h: l.h }], netArea: l.w * l.h * 0.8, cutLength: l.cut, pierceCount: l.pierces,
            bends: l.bends, stockKey: l.stock, thickness: l.stock === "a" ? 2 : 3,
          }));
          const q = priceQuote(lines, { ...rules, marginPct, minOrder, remnantPolicy, sheetMargin: 10, partGap: 5 });
          const sum = q.lines.reduce((s, l) => s + l.lineTotal, 0);
          expect(q.subtotal).toBeCloseTo(sum, 2);
          expect(q.net).toBeGreaterThanOrEqual(minOrder - 0.005);
          expect(q.net).toBeCloseTo(q.subtotal + q.minOrderAdjustment, 2);
          expect(q.gross).toBeCloseTo(q.net + q.vat, 2);
          expect(q.vat).toBeCloseTo(q.net * 0.2, 1);
          // the shop never pays for more steel than it bills: billed weight covers the parts' net weight
          for (const st of q.stocks) {
            const net = lines.filter((l) => l.stockKey === st.stockKey).reduce((s, l) => s + (l.netArea * l.thickness * 7.85 * l.qty) / 1e6, 0);
            expect(st.billableWeightKg).toBeGreaterThanOrEqual(net - 1e-9);
            expect(st.utilization).toBeLessThanOrEqual(1 + 1e-9);
          }
          for (const l of q.lines) { expect(l.lineTotal).toBeGreaterThan(0); expect(Number.isFinite(l.unitPrice)).toBe(true); }
        },
      ),
      { numRuns: 120 },
    );
  });

  it("rejects unusable input", () => {
    expect(() => priceQuote([], rules)).toThrow(CostError);
    expect(() => priceQuote([base({ qty: 0 })], rules)).toThrow(CostError);
    expect(() => priceQuote([base({ rects: [] })], rules)).toThrow(CostError);
    expect(() => priceQuote([base({ rects: [{ w: 5000, h: 5000 }] })], rules)).toThrow(NestError);
  });
});
