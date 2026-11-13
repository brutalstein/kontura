import { analyzeDxf, priceQuote } from "@/engine";
import { LASER_PRESETS } from "@/server/catalog";
import { circle, dxf, line, lwpoly } from "@/engine/dxf-writer";

const B = Math.tan(Math.PI / 8); // bulge of a 90° fillet

/** Sample drawing: a 240 × 140 mm bracket with filleted corners, five holes, one slot and a bend line. Offered at first run and shown on the site. */
export const SAMPLE_DXF = dxf([
  lwpoly([[12, 0], [228, 0, B], [240, 12], [240, 128, B], [228, 140], [12, 140, B], [0, 128], [0, 12, B]]),
  circle(20, 20, 4.5), circle(220, 20, 4.5), circle(220, 120, 4.5), circle(20, 120, 4.5),
  circle(78, 70, 28),
  lwpoly([[132, 63], [172, 63, 1], [172, 77], [132, 77, 1]]),
  line(196, 0, 196, 140, { layer: "BUKUM" }),
]);

/** The engine's own analysis of the sample, so every number shown next to it is real. */
export const SAMPLE = analyzeDxf(SAMPLE_DXF);

/** Example inputs for the worked quote on the marketing site. They are stated next to the result; they are not market data. */
export const EXAMPLE = { qty: 60, thickness: 3, material: "DKP sac", ratePerMin: 60, pricePerKg: 40, marginPct: 25, sheetW: 3000, sheetH: 1500 };

/** The sample part priced by the real engine with the example inputs above and the 3 kW starter cutting table. */
export const SAMPLE_QUOTE = priceQuote([{
  id: "ornek", qty: EXAMPLE.qty, cutLength: SAMPLE.cutLength, pierceCount: SAMPLE.pierceCount, netArea: SAMPLE.netArea,
  rects: SAMPLE.parts.map((p) => ({ w: p.w, h: p.h })), bends: SAMPLE.bendCount, extraPerUnit: 0, thickness: EXAMPLE.thickness, stockKey: "ornek",
  material: { densityGcm3: 7.85, pricePerKg: EXAMPLE.pricePerKg, sheetW: EXAMPLE.sheetW, sheetH: EXAMPLE.sheetH },
  machine: { ratePerMin: EXAMPLE.ratePerMin, params: LASER_PRESETS["3kw"].tables.dkp.map(([thickness, feedMmMin, pierceSec]) => ({ thickness, feedMmMin, pierceSec })) },
}], { marginPct: EXAMPLE.marginPct, setupFee: 0, minOrder: 0, vatPct: 20, bendRate: 15, bendSetup: 250, rapidSecPerPierce: 0.5, sheetMargin: 10, partGap: 5, remnantPolicy: "used-length", qtyBreaks: [] });
