/**
 * Rectangular nesting of part bounding boxes onto stock sheets.
 * Two strategies are run and the better result is kept:
 *  - MaxRects with a bottom-left rule that packs along the sheet length (keeps a reusable remnant),
 *  - an analytic grid fill when the job has a single part type.
 */
export type NestItem = { id: string; w: number; h: number; qty: number };
export type NestOptions = { sheetW: number; sheetH: number; margin: number; gap: number };
export type Placement = { id: string; x: number; y: number; w: number; h: number; rotated: boolean };
export type NestSheet = { placements: Placement[]; usedLength: number; utilization: number };
export type NestResult = {
  sheets: NestSheet[];
  /** Number of sheets after extrapolation; equals sheets.length unless `estimated`. */
  sheetCount: number;
  /** Sheet-equivalents to charge when the last sheet is billed by used length. */
  billableSheets: number;
  estimated: boolean;
  strategy: "maxrects" | "grid";
};

export class NestError extends Error {}

const MAX_PLACEMENTS = 5000;
type Rect = { x: number; y: number; w: number; h: number };

const contains = (a: Rect, b: Rect) => b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h;
const EPS = 1e-7;

function finish(sheets: Placement[][], o: NestOptions, strategy: NestResult["strategy"]): NestResult {
  const out: NestSheet[] = sheets.map((placements) => {
    const right = Math.max(...placements.map((p) => p.x + p.w));
    const area = placements.reduce((s, p) => s + p.w * p.h, 0);
    return { placements, usedLength: Math.min(o.sheetW, right + o.margin), utilization: area / (o.sheetW * o.sheetH) };
  });
  const last = out[out.length - 1];
  return {
    sheets: out,
    sheetCount: out.length,
    billableSheets: out.length - 1 + last.usedLength / o.sheetW,
    estimated: false,
    strategy,
  };
}

function maxRects(items: NestItem[], o: NestOptions): Placement[][] {
  const UW = o.sheetW - 2 * o.margin + o.gap, UH = o.sheetH - 2 * o.margin + o.gap;
  const queue: NestItem[] = items
    .map((i) => ({ ...i }))
    .sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h);
  const sheets: Placement[][] = [];
  while (queue.some((i) => i.qty > 0)) {
    let free: Rect[] = [{ x: 0, y: 0, w: UW, h: UH }];
    const placements: Placement[] = [];
    for (const item of queue) {
      while (item.qty > 0) {
        let best: (Rect & { rotated: boolean }) | null = null;
        for (const f of free) {
          for (const rotated of [false, true]) {
            const w = (rotated ? item.h : item.w) + o.gap, h = (rotated ? item.w : item.h) + o.gap;
            if (w > f.w + EPS || h > f.h + EPS) continue;
            if (!best || f.x + w < best.x + best.w - EPS || (Math.abs(f.x + w - best.x - best.w) <= EPS && f.y < best.y)) {
              best = { x: f.x, y: f.y, w, h, rotated };
            }
          }
        }
        if (!best) break; // this part type no longer fits on the current sheet
        const used: Rect = best;
        placements.push({ id: item.id, x: used.x + o.margin, y: used.y + o.margin, w: used.w - o.gap, h: used.h - o.gap, rotated: best.rotated });
        item.qty--;
        const next: Rect[] = [], fresh: Rect[] = [];
        for (const f of free) {
          if (used.x >= f.x + f.w - EPS || used.x + used.w <= f.x + EPS || used.y >= f.y + f.h - EPS || used.y + used.h <= f.y + EPS) { next.push(f); continue; }
          if (used.x > f.x + EPS) fresh.push({ x: f.x, y: f.y, w: used.x - f.x, h: f.h });
          if (used.x + used.w < f.x + f.w - EPS) fresh.push({ x: used.x + used.w, y: f.y, w: f.x + f.w - used.x - used.w, h: f.h });
          if (used.y > f.y + EPS) fresh.push({ x: f.x, y: f.y, w: f.w, h: used.y - f.y });
          if (used.y + used.h < f.y + f.h - EPS) fresh.push({ x: f.x, y: used.y + used.h, w: f.w, h: f.y + f.h - used.y - used.h });
        }
        // only the new rectangles can be redundant; untouched ones were already mutually non-contained
        const keep = fresh.filter((r, i) => !next.some((n) => contains(n, r)) && !fresh.some((q, k) => k !== i && contains(q, r) && (k < i || !contains(r, q))));
        free = next.concat(keep);
      }
    }
    if (!placements.length) throw new NestError("Parça plakaya sığmıyor.");
    sheets.push(placements);
  }
  return sheets;
}

/** Best single-type layout per sheet: columns of one orientation followed by columns of the other. */
function grid(item: NestItem, o: NestOptions): Placement[][] {
  const UW = o.sheetW - 2 * o.margin + o.gap, UH = o.sheetH - 2 * o.margin + o.gap;
  const layout = (w: number, h: number) => {
    const cw = w + o.gap, ch = h + o.gap, rw = h + o.gap, rh = w + o.gap;
    const rowsA = Math.floor((UH + EPS) / ch), rowsB = Math.floor((UH + EPS) / rh);
    let best = { a: 0, b: 0, count: 0 };
    for (let a = 0; a <= Math.floor((UW + EPS) / cw); a++) {
      const b = Math.floor((UW - a * cw + EPS) / rw);
      const count = a * rowsA + b * rowsB;
      if (count > best.count) best = { a, b, count };
    }
    return { ...best, cw, ch, rw, rh, rowsA, rowsB };
  };
  const L1 = layout(item.w, item.h), L2 = layout(item.h, item.w);
  const [L, flip] = L1.count >= L2.count ? [L1, false] : [L2, true];
  if (L.count === 0) throw new NestError("Parça plakaya sığmıyor.");
  // column-major cell list so a partial sheet fills from the left edge
  const columns = (count: number, x0: number, cw: number, ch: number, rows: number, rotated: boolean): Placement[] =>
    Array.from({ length: count }, (_, i) => ({ id: item.id, x: o.margin + x0 + Math.floor(i / rows) * cw, y: o.margin + (i % rows) * ch, w: cw - o.gap, h: ch - o.gap, rotated }));
  const cells = [...columns(L.a * L.rowsA, 0, L.cw, L.ch, L.rowsA, flip), ...columns(L.b * L.rowsB, L.a * L.cw, L.rw, L.rh, L.rowsB, !flip)];
  // A part-filled sheet is charged by its used length, so one orientation alone can beat the full-sheet pattern there.
  const right = (ps: Placement[]) => Math.max(...ps.map((p) => p.x + p.w));
  const partial = (n: number) => [
    cells.slice(0, n),
    ...(L.rowsA && Math.ceil(n / L.rowsA) * L.cw <= UW + EPS ? [columns(n, 0, L.cw, L.ch, L.rowsA, flip)] : []),
    ...(L.rowsB && Math.ceil(n / L.rowsB) * L.rw <= UW + EPS ? [columns(n, 0, L.rw, L.rh, L.rowsB, !flip)] : []),
  ].reduce((a, b) => (right(b) < right(a) - EPS ? b : a));
  const sheets: Placement[][] = [];
  for (let left = item.qty; left > 0; left -= cells.length) sheets.push(left >= cells.length ? cells.slice() : partial(left));
  return sheets;
}

export function nest(items: NestItem[], o: NestOptions): NestResult {
  const list = items.filter((i) => i.qty > 0);
  if (!list.length) throw new NestError("Yerleştirilecek parça yok.");
  if (!(o.sheetW > 0 && o.sheetH > 0) || o.margin < 0 || o.gap < 0) throw new NestError("Geçersiz plaka ölçüsü.");
  const UW = o.sheetW - 2 * o.margin, UH = o.sheetH - 2 * o.margin;
  for (const i of list) {
    if (!(i.w > 0 && i.h > 0) || !Number.isInteger(i.qty)) throw new NestError("Geçersiz parça ölçüsü veya adedi.");
    const fits = (i.w <= UW + EPS && i.h <= UH + EPS) || (i.h <= UW + EPS && i.w <= UH + EPS);
    if (!fits) throw new NestError(`Parça (${i.w.toFixed(0)}×${i.h.toFixed(0)} mm) plakaya sığmıyor.`);
  }

  const total = list.reduce((s, i) => s + i.qty, 0);
  if (list.length === 1) {
    const g = finish(grid(list[0], o), o, "grid");
    if (total > MAX_PLACEMENTS) return g;
    const m = finish(maxRects(list, o), o, "maxrects");
    return m.billableSheets < g.billableSheets - 1e-9 ? m : g;
  }
  if (total <= MAX_PLACEMENTS) return finish(maxRects(list, o), o, "maxrects");

  // Very large mixed jobs: nest a proportional sample and extrapolate the sheet count.
  const k = MAX_PLACEMENTS / total;
  const sample = finish(maxRects(list.map((i) => ({ ...i, qty: Math.max(1, Math.round(i.qty * k)) })), o), o, "maxrects");
  const sampled = sample.sheets.reduce((s, sh) => s + sh.placements.length, 0);
  const billable = (sample.billableSheets * total) / sampled;
  return { ...sample, sheetCount: Math.ceil(billable), billableSheets: billable, estimated: true };
}
