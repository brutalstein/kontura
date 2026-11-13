import { type BBox, type Pt, bboxContains, bboxOf, dist, pointInPolygon, signedArea, simplify } from "./geom";
import { type Path, parseDxf } from "./dxf";

export type Contour = { pts: Pt[]; closed: boolean; length: number; area: number; bbox: BBox };
export type PartSummary = { w: number; h: number; netArea: number; holes: number };
export type Warning = { code: "open_contour" | "duplicates" | "small_hole" | "ignored" | "no_geometry" | "many_parts"; message: string };

export type Analysis = {
  /** Total cut path length in mm (closed and open contours, bend lines excluded). */
  cutLength: number;
  /** One pierce per contour. */
  pierceCount: number;
  /** Material area of all parts minus holes, mm². */
  netArea: number;
  /** Overall drawing extents in mm. */
  width: number;
  height: number;
  parts: PartSummary[];
  openContours: number;
  duplicates: number;
  bendCount: number;
  bendLength: number;
  /** Smallest hole dimension in mm, or null when the drawing has no holes. */
  minHole: number | null;
  warnings: Warning[];
  /** Simplified polylines for on-screen preview: flat [x0,y0,x1,y1,...] arrays, Y up. */
  preview: { cut: number[][]; bend: number[][] };
};

const JOIN_TOL = 0.05; // mm: endpoints closer than this are treated as connected
const BEND_LAYER = /b[uü]k[uü]m|bend|fold|abkant|katlama/i;

const key = (p: Pt) => `${Math.round(p.x / JOIN_TOL)}:${Math.round(p.y / JOIN_TOL)}`;

/** Drop exact duplicate entities (same ends, length and midpoint) — a common CAD export defect that doubles cut time. */
function dedupe(paths: Path[]): { kept: Path[]; removed: number } {
  const seen = new Set<string>();
  const kept: Path[] = [];
  for (const p of paths) {
    const a = key(p.pts[0]), b = key(p.pts[p.pts.length - 1]);
    const ends = a < b ? a + "|" + b : b + "|" + a;
    const mid = p.pts[p.pts.length >> 1];
    const anti = p.pts[(p.pts.length - 1) - (p.pts.length >> 1)];
    const mids = [key(mid), key(anti)].sort().join("|");
    const k = `${ends}|${mids}|${Math.round(p.length / JOIN_TOL)}|${p.closed}`;
    if (seen.has(k)) continue;
    seen.add(k);
    kept.push(p);
  }
  return { kept, removed: paths.length - kept.length };
}

/** Join open paths that share endpoints into longer chains; chains whose ends meet become closed contours. */
function chain(paths: Path[]): { pts: Pt[]; closed: boolean; length: number }[] {
  const out: { pts: Pt[]; closed: boolean; length: number }[] = [];
  const open: Path[] = [];
  for (const p of paths) {
    if (p.closed) out.push(p);
    else if (p.pts.length > 2 && dist(p.pts[0], p.pts[p.pts.length - 1]) <= JOIN_TOL) {
      out.push({ pts: p.pts.slice(0, -1), closed: true, length: p.length });
    } else open.push(p);
  }

  const cells = new Map<string, { i: number; end: 0 | 1 }[]>();
  const cellOf = (p: Pt) => [Math.floor(p.x / JOIN_TOL), Math.floor(p.y / JOIN_TOL)] as const;
  open.forEach((p, i) => {
    ([0, 1] as const).forEach((end) => {
      const [cx, cy] = cellOf(end === 0 ? p.pts[0] : p.pts[p.pts.length - 1]);
      const k = `${cx}:${cy}`;
      (cells.get(k) ?? cells.set(k, []).get(k)!).push({ i, end });
    });
  });
  const used = new Uint8Array(open.length);
  const findNext = (at: Pt): { i: number; end: 0 | 1 } | null => {
    const [cx, cy] = cellOf(at);
    let best: { i: number; end: 0 | 1 } | null = null, bestD = JOIN_TOL;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const c of cells.get(`${cx + dx}:${cy + dy}`) ?? []) {
        if (used[c.i]) continue;
        const q = c.end === 0 ? open[c.i].pts[0] : open[c.i].pts[open[c.i].pts.length - 1];
        const d = dist(at, q);
        if (d <= bestD) { bestD = d; best = c; }
      }
    }
    return best;
  };

  for (let s = 0; s < open.length; s++) {
    if (used[s]) continue;
    used[s] = 1;
    const pts = open[s].pts.slice();
    let length = open[s].length;
    let closed = false;
    for (let pass = 0; pass < 2 && !closed; pass++) {
      // pass 0 extends the tail; pass 1 flips the chain and extends what was the head
      for (;;) {
        const tail = pts[pts.length - 1];
        if (pts.length > 2 && dist(tail, pts[0]) <= JOIN_TOL) { closed = true; pts.pop(); break; }
        const nx = findNext(tail);
        if (!nx) break;
        used[nx.i] = 1;
        const seg = nx.end === 0 ? open[nx.i].pts : open[nx.i].pts.slice().reverse();
        pts.push(...seg.slice(1));
        length += open[nx.i].length;
      }
      if (!closed) pts.reverse();
    }
    out.push({ pts, closed, length });
  }
  return out;
}

const flat = (pts: Pt[], closed: boolean, tol: number): number[] => {
  const s = simplify(closed ? [...pts, pts[0]] : pts, tol);
  const arr: number[] = [];
  for (const p of s) arr.push(Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100);
  return arr;
};

/** Turn parsed DXF paths into manufacturing metrics. Pure and deterministic. */
export function analyzePaths(paths: Path[], ignored: Record<string, number> = {}): Analysis {
  const warnings: Warning[] = [];
  const bendPaths = paths.filter((p) => BEND_LAYER.test(p.layer));
  const { kept, removed } = dedupe(paths.filter((p) => !BEND_LAYER.test(p.layer)));
  const chains = chain(kept);

  const contours: Contour[] = chains.map((c) => ({
    ...c,
    area: c.closed ? Math.abs(signedArea(c.pts)) : 0,
    bbox: bboxOf(c.pts),
  }));
  const closed = contours.filter((c) => c.closed && c.area > 1e-6).sort((a, b) => b.area - a.area);
  const openCount = contours.length - closed.length;

  // Containment depth: even = part outline, odd = hole.
  const parent: number[] = new Array(closed.length).fill(-1);
  const depth: number[] = new Array(closed.length).fill(0);
  for (let i = 1; i < closed.length; i++) {
    for (let j = i - 1; j >= 0; j--) {
      // candidates are sorted by area descending, so the first enclosing one found walking backwards is the tightest
      if (bboxContains(closed[j].bbox, closed[i].bbox) && pointInPolygon(closed[i].pts[0], closed[j].pts)) {
        parent[i] = j;
        depth[i] = depth[j] + 1;
        break;
      }
    }
  }

  const parts: PartSummary[] = [];
  let netArea = 0;
  let minHole: number | null = null;
  closed.forEach((c, i) => {
    if (depth[i] % 2 === 1) {
      const d = Math.min(c.bbox.maxX - c.bbox.minX, c.bbox.maxY - c.bbox.minY);
      if (minHole === null || d < minHole) minHole = d;
      return;
    }
    let area = c.area, holes = 0;
    closed.forEach((h, k) => { if (parent[k] === i) { area -= h.area; holes++; } });
    netArea += area;
    parts.push({ w: c.bbox.maxX - c.bbox.minX, h: c.bbox.maxY - c.bbox.minY, netArea: area, holes });
  });

  const everything = contours.flatMap((c) => c.pts);
  const ext = everything.length ? bboxOf(everything) : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const width = ext.maxX - ext.minX, height = ext.maxY - ext.minY;

  if (!parts.length) warnings.push({ code: "no_geometry", message: "Kapalı bir dış kontur bulunamadı; parça alanı hesaplanamadı." });
  if (openCount) warnings.push({ code: "open_contour", message: `${openCount} açık kontur var. Kesim uzunluğuna eklendi, ancak çizimi kontrol edin.` });
  if (removed) warnings.push({ code: "duplicates", message: `${removed} çift (üst üste) çizgi temizlendi.` });
  if (parts.length > 1) warnings.push({ code: "many_parts", message: `Dosyada ${parts.length} ayrı parça var; adet tüm dosya için uygulanır.` });
  const ignoredTotal = Object.values(ignored).reduce((a, b) => a + b, 0);
  if (ignoredTotal) warnings.push({ code: "ignored", message: `${ignoredTotal} nesne (${Object.keys(ignored).join(", ")}) kesim yolu olmadığı için yok sayıldı.` });

  const tol = Math.max(0.05, Math.max(width, height) / 1500);
  return {
    cutLength: contours.reduce((s, c) => s + c.length, 0),
    pierceCount: contours.length,
    netArea,
    width,
    height,
    parts,
    openContours: openCount,
    duplicates: removed,
    bendCount: bendPaths.length,
    bendLength: bendPaths.reduce((s, p) => s + p.length, 0),
    minHole,
    warnings,
    preview: {
      cut: contours.map((c) => flat(c.pts, c.closed, tol)),
      bend: bendPaths.map((p) => flat(p.pts, false, tol)),
    },
  };
}

export function analyzeDxf(text: string): Analysis {
  const doc = parseDxf(text);
  return analyzePaths(doc.paths, doc.ignored);
}
