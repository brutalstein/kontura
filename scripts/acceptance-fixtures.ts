/**
 * Writes the workshop acceptance drawings to docs/acceptance/dxf and prints the hand-calculated
 * cut length, net area and pierce count of each, so a live quote can be checked against them.
 * Run: npx tsx scripts/acceptance-fixtures.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { circle, dxf, line, lwpoly, rectLines } from "../src/engine/dxf-writer";

const PI = Math.PI;
const Q = Math.tan(PI / 8); // bulge of a quarter arc
const ring = (d: number) => PI * d;
const disc = (d: number) => (PI * d * d) / 4;

const roundedRect = (w: number, h: number, r: number) =>
  lwpoly([[r, 0], [w - r, 0, Q], [w, r], [w, h - r, Q], [w - r, h], [r, h, Q], [0, h - r], [0, r, Q]]);
/** Obround slot, `len` x `wid` overall, lower-left corner of its bounding box at (x, y). */
const slot = (x: number, y: number, len: number, wid: number) => {
  const r = wid / 2;
  return lwpoly([[x + r, y], [x + len - r, y, 1], [x + len - r, y + wid], [x + r, y + wid, 1]]);
};

type Part = { file: string; note: string; entities: string[]; cut: number; area: number; pierces: number };

const parts: Part[] = [
  {
    // EN 1092-1 Type 01, DN50 PN16: D=165, K=125, 4 x d18, bore 61.5
    file: "flans-dn50-pn16.dxf",
    note: "Düz flanş EN 1092-1 Tip 01 DN50 PN16",
    entities: [circle(0, 0, 82.5), circle(0, 0, 30.75), ...[45, 135, 225, 315].map((a) => circle(62.5 * Math.cos((a * PI) / 180), 62.5 * Math.sin((a * PI) / 180), 9))],
    cut: ring(165) + ring(61.5) + 4 * ring(18),
    area: disc(165) - disc(61.5) - 4 * disc(18),
    pierces: 6,
  },
  {
    file: "kose-braketi-160x60.dxf",
    note: "Köşe braketi açınımı 160x60, 4 x d9, 1 büküm",
    entities: [...rectLines(0, 0, 160, 60), circle(20, 15, 4.5), circle(20, 45, 4.5), circle(140, 15, 4.5), circle(140, 45, 4.5)],
    cut: 2 * (160 + 60) + 4 * ring(9),
    area: 160 * 60 - 4 * disc(9),
    pierces: 5,
  },
  {
    file: "pano-kapagi-400x300.dxf",
    note: "Pano kapağı 400x300 R10, 4 x d6, 120x80 pencere, 6 havalandırma kanalı 40x6",
    entities: [
      roundedRect(400, 300, 10),
      circle(15, 15, 3), circle(385, 15, 3), circle(385, 285, 3), circle(15, 285, 3),
      ...rectLines(140, 170, 120, 80),
      ...[0, 1, 2].flatMap((i) => [slot(120, 60 + i * 20, 40, 6), slot(240, 60 + i * 20, 40, 6)]),
    ],
    cut: 2 * (380 + 280) + ring(20) + 4 * ring(6) + 2 * (120 + 80) + 6 * (2 * 34 + ring(6)),
    area: 400 * 300 - (4 - PI) * 100 - 4 * disc(6) - 120 * 80 - 6 * (34 * 6 + disc(6)),
    pierces: 12,
  },
  {
    file: "taban-plakasi-250x250.dxf",
    note: "Kolon taban plakası 250x250, 4 x d22, orta delik d100",
    entities: [...rectLines(0, 0, 250, 250), circle(125, 125, 50), circle(35, 35, 11), circle(215, 35, 11), circle(215, 215, 11), circle(35, 215, 11)],
    cut: 1000 + ring(100) + 4 * ring(22),
    area: 62500 - disc(100) - 4 * disc(22),
    pierces: 6,
  },
  {
    file: "berkitme-ucgen-150.dxf",
    note: "Üçgen berkitme 150x150",
    entities: [line(0, 0, 150, 0), line(150, 0, 0, 150), line(0, 150, 0, 0)],
    cut: 300 + Math.hypot(150, 150),
    area: 11250,
    pierces: 1,
  },
];

const dir = "docs/acceptance/dxf";
mkdirSync(dir, { recursive: true });
for (const p of parts) {
  writeFileSync(`${dir}/${p.file}`, dxf(p.entities, { insunits: 4 }));
  console.log(`${p.file}\t${p.note}\tkesim ${p.cut.toFixed(2)} mm\talan ${p.area.toFixed(2)} mm2\tdelme ${p.pierces}`);
}
// Deliberately defective: the outline is left open by 5 mm, so the app must refuse to price it silently.
writeFileSync(`${dir}/hatali-acik-kontur.dxf`, dxf([line(0, 0, 100, 0), line(100, 0, 100, 50), line(100, 50, 0, 50), line(0, 50, 0, 5)], { insunits: 4 }));
console.log("hatali-acik-kontur.dxf\taçık kontur (5 mm boşluk)");
