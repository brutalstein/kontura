/** Minimal ASCII DXF writer: builds the sample drawing offered at first run, and test fixtures. */
type Opt = { layer?: string };
const ent = (type: string, pairs: (string | number)[], o: Opt = {}) =>
  ["0", type, "8", o.layer ?? "0", ...pairs.map(String)].join("\n");

export const line = (x1: number, y1: number, x2: number, y2: number, o?: Opt) =>
  ent("LINE", [10, x1, 20, y1, 11, x2, 21, y2], o);
export const circle = (x: number, y: number, r: number, o?: Opt) => ent("CIRCLE", [10, x, 20, y, 40, r], o);
export const arc = (x: number, y: number, r: number, a0: number, a1: number, o?: Opt) =>
  ent("ARC", [10, x, 20, y, 40, r, 50, a0, 51, a1], o);
export const lwpoly = (verts: [number, number, number?][], closed = true, o?: Opt) =>
  ent("LWPOLYLINE", [90, verts.length, 70, closed ? 1 : 0, ...verts.flatMap(([x, y, b]) => (b ? [10, x, 20, y, 42, b] : [10, x, 20, y]))], o);
export const insert = (name: string, x: number, y: number, rotDeg = 0, scale = 1) =>
  ent("INSERT", [2, name, 10, x, 20, y, 41, scale, 42, scale, 50, rotDeg]);

export const rectLines = (x: number, y: number, w: number, h: number) => [
  line(x, y, x + w, y), line(x + w, y, x + w, y + h), line(x + w, y + h, x, y + h), line(x, y + h, x, y),
];

export function dxf(entities: string[], opts: { insunits?: number; blocks?: Record<string, string[]> } = {}): string {
  const out: string[] = [];
  if (opts.insunits !== undefined) out.push("0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", String(opts.insunits), "0", "ENDSEC");
  if (opts.blocks) {
    out.push("0", "SECTION", "2", "BLOCKS");
    for (const [name, ents] of Object.entries(opts.blocks)) {
      out.push("0", "BLOCK", "8", "0", "2", name, "10", "0", "20", "0", ...ents, "0", "ENDBLK");
    }
    out.push("0", "ENDSEC");
  }
  out.push("0", "SECTION", "2", "ENTITIES", ...entities, "0", "ENDSEC", "0", "EOF");
  return out.join("\n");
}
