import { type Pt, dist, polylineLength } from "./geom";

/** A flattened DXF entity: polyline points in millimetres plus its exact curve length. */
export type Path = { pts: Pt[]; closed: boolean; length: number; layer: string };
export type DxfDoc = { paths: Path[]; ignored: Record<string, number>; unitScale: number };

export class DxfError extends Error {}

type Group = [code: number, value: string];
type Ent = { type: string; g: Group[] };

const MM_PER_UNIT: Record<number, number> = { 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000 };
const MAX_ENTITIES = 200_000;
const MAX_POINTS = 2_000_000;
const MAX_BLOCK_DEPTH = 8;

function tokenize(text: string): Group[] {
  if (text.startsWith("AutoCAD Binary DXF")) throw new DxfError("İkili (binary) DXF desteklenmiyor. ASCII DXF olarak kaydedin.");
  const lines = text.split(/\r\n|\r|\n/);
  const out: Group[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const raw = lines[i].trim();
    if (raw === "" && i + 2 >= lines.length) break;
    const code = Number(raw);
    if (raw === "" || !Number.isInteger(code)) throw new DxfError(`Geçersiz DXF: satır ${i + 1} bir grup kodu değil.`);
    out.push([code, lines[i + 1].trim()]);
  }
  return out;
}

function sections(groups: Group[]): Map<string, Group[]> {
  const map = new Map<string, Group[]>();
  for (let i = 0; i < groups.length; i++) {
    if (groups[i][0] === 0 && groups[i][1] === "SECTION" && groups[i + 1]?.[0] === 2) {
      const name = groups[i + 1][1];
      const body: Group[] = [];
      i += 2;
      while (i < groups.length && !(groups[i][0] === 0 && groups[i][1] === "ENDSEC")) body.push(groups[i++]);
      map.set(name, body);
    }
  }
  return map;
}

function entities(body: Group[]): Ent[] {
  const out: Ent[] = [];
  for (const grp of body) {
    if (grp[0] === 0) {
      if (out.length >= MAX_ENTITIES) throw new DxfError("DXF çok fazla nesne içeriyor (sınır: 200.000).");
      out.push({ type: grp[1], g: [] });
    } else if (out.length) out[out.length - 1].g.push(grp);
  }
  return out;
}

const num = (e: Ent, code: number, def = 0): number => {
  const f = e.g.find((x) => x[0] === code);
  const v = f ? Number(f[1]) : def;
  return Number.isFinite(v) ? v : def;
};
const str = (e: Ent, code: number, def = ""): string => e.g.find((x) => x[0] === code)?.[1] ?? def;
const all = (e: Ent, code: number): number[] => e.g.filter((x) => x[0] === code).map((x) => Number(x[1]));

/** Points along a circular arc (start inclusive, end inclusive), chord error bounded by `tol`. */
function arcPts(cx: number, cy: number, r: number, a0: number, sweep: number, tol: number): Pt[] {
  const step = r > tol ? 2 * Math.acos(1 - tol / r) : Math.PI / 2;
  const n = Math.min(2000, Math.max(2, Math.ceil(Math.abs(sweep) / step)));
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (sweep * i) / n;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

type Flat = { pts: Pt[]; closed: boolean; length: number };

/** Polyline with DXF bulges: bulge = tan(theta/4), positive = counter-clockwise arc to the next vertex. */
function bulgePolyline(verts: { x: number; y: number; b: number }[], closed: boolean, tol: number): Flat {
  const pts: Pt[] = [];
  let length = 0;
  const n = verts.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p1 = verts[i], p2 = verts[(i + 1) % n];
    const chord = dist(p1, p2);
    if (p1.b === 0 || chord === 0) {
      pts.push({ x: p1.x, y: p1.y });
      length += chord;
      continue;
    }
    const theta = 4 * Math.atan(p1.b);
    const r = chord / (2 * Math.sin(Math.abs(theta) / 2));
    const h = chord / 2 / Math.tan(theta / 2); // signed distance from chord midpoint to centre, along the left normal
    const cx = (p1.x + p2.x) / 2 - ((p2.y - p1.y) / chord) * h;
    const cy = (p1.y + p2.y) / 2 + ((p2.x - p1.x) / chord) * h;
    const arc = arcPts(cx, cy, r, Math.atan2(p1.y - cy, p1.x - cx), theta, tol);
    arc.pop();
    pts.push(...arc);
    length += Math.abs(theta) * r;
  }
  if (!closed && n) pts.push({ x: verts[n - 1].x, y: verts[n - 1].y });
  return { pts, closed, length };
}

function bspline(deg: number, knots: number[], ctrl: Pt[], weights: number[]): Pt[] {
  const samples = Math.min(4000, ctrl.length * 16);
  const t0 = knots[deg], t1 = knots[knots.length - 1 - deg];
  const pts: Pt[] = [];
  for (let s = 0; s <= samples; s++) {
    const t = s === samples ? t1 - 1e-9 * (t1 - t0) : t0 + ((t1 - t0) * s) / samples;
    let k = deg;
    while (k < ctrl.length - 1 && knots[k + 1] <= t) k++;
    const d: number[][] = [];
    for (let j = 0; j <= deg; j++) {
      const c = ctrl[j + k - deg], w = weights[j + k - deg] ?? 1;
      d.push([c.x * w, c.y * w, w]);
    }
    for (let r = 1; r <= deg; r++) {
      for (let j = deg; j >= r; j--) {
        const i = j + k - deg;
        const den = knots[i + deg - r + 1] - knots[i];
        const a = den === 0 ? 0 : (t - knots[i]) / den;
        for (let c = 0; c < 3; c++) d[j][c] = (1 - a) * d[j - 1][c] + a * d[j][c];
      }
    }
    pts.push({ x: d[deg][0] / d[deg][2], y: d[deg][1] / d[deg][2] });
  }
  return pts;
}

function flatten(e: Ent, tol: number): Flat | null {
  switch (e.type) {
    case "LINE": {
      const pts = [{ x: num(e, 10), y: num(e, 20) }, { x: num(e, 11), y: num(e, 21) }];
      return { pts, closed: false, length: dist(pts[0], pts[1]) };
    }
    case "CIRCLE": {
      const r = num(e, 40);
      if (r <= 0) return null;
      const pts = arcPts(num(e, 10), num(e, 20), r, 0, 2 * Math.PI, tol);
      pts.pop();
      return { pts, closed: true, length: 2 * Math.PI * r };
    }
    case "ARC": {
      const r = num(e, 40);
      if (r <= 0) return null;
      const a0 = (num(e, 50) * Math.PI) / 180;
      let sweep = (((num(e, 51) - num(e, 50)) % 360) + 360) % 360;
      if (sweep === 0) sweep = 360;
      const rad = (sweep * Math.PI) / 180;
      return { pts: arcPts(num(e, 10), num(e, 20), r, a0, rad, tol), closed: false, length: rad * r };
    }
    case "LWPOLYLINE": {
      const verts: { x: number; y: number; b: number }[] = [];
      for (const [code, v] of e.g) {
        if (code === 10) verts.push({ x: Number(v), y: 0, b: 0 });
        else if (code === 20 && verts.length) verts[verts.length - 1].y = Number(v);
        else if (code === 42 && verts.length) verts[verts.length - 1].b = Number(v);
      }
      if (verts.length < 2) return null;
      return bulgePolyline(verts, (num(e, 70) & 1) === 1, tol);
    }
    case "ELLIPSE": {
      const cx = num(e, 10), cy = num(e, 20), mx = num(e, 11), my = num(e, 21);
      const a = Math.hypot(mx, my), b = a * num(e, 40, 1), rot = Math.atan2(my, mx);
      if (a <= 0 || b <= 0) return null;
      const p0 = num(e, 41, 0), p1raw = num(e, 42, 2 * Math.PI);
      const sweep = p1raw > p0 ? p1raw - p0 : p1raw - p0 + 2 * Math.PI;
      const full = Math.abs(sweep - 2 * Math.PI) < 1e-6;
      const n = Math.min(2000, Math.max(16, Math.ceil(arcPts(0, 0, a, 0, sweep, tol).length)));
      const pts: Pt[] = [];
      for (let i = 0; i <= n; i++) {
        const t = p0 + (sweep * i) / n;
        const x = a * Math.cos(t), y = b * Math.sin(t);
        pts.push({ x: cx + x * Math.cos(rot) - y * Math.sin(rot), y: cy + x * Math.sin(rot) + y * Math.cos(rot) });
      }
      const length = polylineLength(pts);
      if (full) pts.pop();
      return { pts, closed: full, length };
    }
    case "SPLINE": {
      const deg = num(e, 71, 3), knots = all(e, 40), weights = all(e, 41);
      const xs = all(e, 10), ys = all(e, 20);
      const ctrl = xs.map((x, i) => ({ x, y: ys[i] ?? 0 }));
      let pts: Pt[];
      if (ctrl.length > deg && knots.length === ctrl.length + deg + 1) pts = bspline(deg, knots, ctrl, weights);
      else {
        const fx = all(e, 11), fy = all(e, 21);
        pts = fx.length >= 2 ? fx.map((x, i) => ({ x, y: fy[i] ?? 0 })) : ctrl;
      }
      if (pts.length < 2) return null;
      const closed = dist(pts[0], pts[pts.length - 1]) < tol;
      const length = polylineLength(pts);
      if (closed) pts.pop();
      return { pts, closed, length };
    }
    default:
      return null;
  }
}

const DRAWABLE = new Set(["LINE", "CIRCLE", "ARC", "LWPOLYLINE", "POLYLINE", "ELLIPSE", "SPLINE", "INSERT"]);

/** Parse ASCII DXF text into flattened paths in millimetres. Throws DxfError on invalid input. */
export function parseDxf(text: string): DxfDoc {
  const secs = sections(tokenize(text));
  const entBody = secs.get("ENTITIES");
  if (!entBody) throw new DxfError("Geçerli bir DXF değil: ENTITIES bölümü bulunamadı.");

  let unitScale = 1;
  const header = secs.get("HEADER") ?? [];
  const iu = header.findIndex((g) => g[0] === 9 && g[1] === "$INSUNITS");
  if (iu >= 0 && header[iu + 1]) unitScale = MM_PER_UNIT[Number(header[iu + 1][1])] ?? 1;
  const tol = 0.002 / unitScale; // chord error; keeps polygon area of a 10 mm hole within 0.03% of the true circle

  const blocks = new Map<string, { base: Pt; ents: Ent[] }>();
  let cur: { name: string; base: Pt; ents: Ent[] } | null = null;
  for (const e of entities(secs.get("BLOCKS") ?? [])) {
    if (e.type === "BLOCK") cur = { name: str(e, 2), base: { x: num(e, 10), y: num(e, 20) }, ents: [] };
    else if (e.type === "ENDBLK") { if (cur) blocks.set(cur.name, cur); cur = null; }
    else cur?.ents.push(e);
  }

  const ignored: Record<string, number> = {};
  let pointBudget = MAX_POINTS;

  const convert = (ents: Ent[], depth: number): Path[] => {
    const out: Path[] = [];
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (!DRAWABLE.has(e.type)) {
        if (!["VERTEX", "SEQEND", "ATTRIB"].includes(e.type)) ignored[e.type] = (ignored[e.type] ?? 0) + 1;
        continue;
      }
      const layer = str(e, 8, "0");
      const mirrored = num(e, 230, 1) < 0; // OCS with flipped Z: X axis is mirrored
      let made: Path[] = [];
      if (e.type === "INSERT") {
        const blk = blocks.get(str(e, 2));
        if (!blk || depth >= MAX_BLOCK_DEPTH) { ignored.INSERT = (ignored.INSERT ?? 0) + 1; continue; }
        const sx = num(e, 41, 1), sy = num(e, 42, 1), rot = (num(e, 50) * Math.PI) / 180;
        const ix = num(e, 10), iy = num(e, 20), c = Math.cos(rot), s = Math.sin(rot);
        made = convert(blk.ents, depth + 1).map((p) => {
          const pts = p.pts.map((q) => {
            const x = (q.x - blk.base.x) * sx, y = (q.y - blk.base.y) * sy;
            return { x: ix + x * c - y * s, y: iy + x * s + y * c };
          });
          const uniform = Math.abs(Math.abs(sx) - Math.abs(sy)) < 1e-9;
          return { ...p, pts, length: uniform ? p.length * Math.abs(sx) : polylineLength(pts, p.closed) };
        });
      } else if (e.type === "POLYLINE") {
        const flags = num(e, 70);
        const verts: { x: number; y: number; b: number }[] = [];
        while (ents[i + 1]?.type === "VERTEX") {
          const v = ents[++i];
          verts.push({ x: num(v, 10), y: num(v, 20), b: num(v, 42) });
        }
        if ((flags & (16 | 64)) || verts.length < 2) { ignored.POLYLINE = (ignored.POLYLINE ?? 0) + 1; continue; }
        made = [{ ...bulgePolyline(verts, (flags & 1) === 1, tol), layer }];
      } else {
        const f = flatten(e, tol);
        if (!f) { ignored[e.type] = (ignored[e.type] ?? 0) + 1; continue; }
        made = [{ ...f, layer }];
      }
      for (const p of made) {
        if (mirrored) p.pts = p.pts.map((q) => ({ x: -q.x, y: q.y }));
        pointBudget -= p.pts.length;
        if (pointBudget < 0) throw new DxfError("DXF çok karmaşık (nokta sınırı aşıldı).");
        out.push(p);
      }
    }
    return out;
  };

  const paths = convert(entities(entBody), 0)
    .filter((p) => p.pts.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y)) && p.length > 0)
    .map((p) => ({
      ...p,
      pts: unitScale === 1 ? p.pts : p.pts.map((q) => ({ x: q.x * unitScale, y: q.y * unitScale })),
      length: p.length * unitScale,
    }));
  return { paths, ignored, unitScale };
}
