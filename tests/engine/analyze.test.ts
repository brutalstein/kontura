import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { DxfError, analyzeDxf } from "@/engine";
import { arc, circle, dxf, insert, line, lwpoly, rectLines } from "../dxf-builder";

const close = (a: number, b: number, rel = 1e-3) => expect(Math.abs(a - b)).toBeLessThanOrEqual(Math.abs(b) * rel + 1e-6);

describe("DXF analysis against closed-form geometry", () => {
  it("rectangle drawn as four lines", () => {
    const a = analyzeDxf(dxf(rectLines(10, 20, 100, 50)));
    expect(a.parts).toHaveLength(1);
    close(a.netArea, 5000);
    close(a.cutLength, 300);
    expect(a.pierceCount).toBe(1);
    close(a.width, 100); close(a.height, 50);
    expect(a.openContours).toBe(0);
  });

  it("circle area and circumference", () => {
    const a = analyzeDxf(dxf([circle(0, 0, 10)]));
    close(a.netArea, Math.PI * 100);
    close(a.cutLength, 2 * Math.PI * 10, 1e-9); // length is analytic, not the polyline's
    expect(a.pierceCount).toBe(1);
  });

  it("plate with two holes: net area, pierces, smallest hole", () => {
    const a = analyzeDxf(dxf([...rectLines(0, 0, 200, 100), circle(50, 50, 10), circle(150, 50, 4)]));
    expect(a.parts).toHaveLength(1);
    expect(a.parts[0].holes).toBe(2);
    close(a.netArea, 20000 - Math.PI * 100 - Math.PI * 16);
    close(a.cutLength, 600 + 2 * Math.PI * 14, 1e-9);
    expect(a.pierceCount).toBe(3);
    close(a.minHole!, 8, 1e-2);
  });

  it("obround slot from an LWPOLYLINE with bulges", () => {
    // straight sides 60 long, 20 apart, closed by two semicircles (bulge 1 = 180° CCW)
    const a = analyzeDxf(dxf([lwpoly([[0, 0], [60, 0, 1], [60, 20], [0, 20, 1]])]));
    close(a.netArea, 60 * 20 + Math.PI * 100);
    close(a.cutLength, 120 + 2 * Math.PI * 10, 1e-9);
    close(a.width, 80); close(a.height, 20);
  });

  it("rounded rectangle from lines and arcs given in arbitrary order", () => {
    const r = 5, w = 80, h = 40;
    const ents = [
      arc(w - r, h - r, r, 0, 90), line(r, 0, w - r, 0), arc(r, r, r, 180, 270),
      line(0, h - r, 0, r), arc(w - r, r, r, 270, 360), line(w - r, h, r, h),
      arc(r, h - r, r, 90, 180), line(w, r, w, h - r),
    ];
    const a = analyzeDxf(dxf(ents));
    expect(a.openContours).toBe(0);
    expect(a.parts).toHaveLength(1);
    close(a.netArea, w * h - (4 - Math.PI) * r * r);
    close(a.cutLength, 2 * (w - 2 * r) + 2 * (h - 2 * r) + 2 * Math.PI * r, 1e-9);
  });

  it("converts inches to millimetres", () => {
    const a = analyzeDxf(dxf(rectLines(0, 0, 2, 1), { insunits: 1 }));
    close(a.netArea, 2 * 25.4 * 25.4);
    close(a.cutLength, 6 * 25.4);
  });

  it("expands block inserts with rotation and scale", () => {
    const a = analyzeDxf(dxf([insert("P", 100, 100, 90, 2), insert("P", 300, 0)], { blocks: { P: rectLines(0, 0, 30, 10) } }));
    expect(a.parts).toHaveLength(2);
    close(a.netArea, 300 * 4 + 300);
    close(a.cutLength, 160 + 80);
    const sizes = a.parts.map((p) => [Math.round(p.w), Math.round(p.h)]);
    expect(sizes).toContainEqual([20, 60]); // rotated 90° and doubled
    expect(sizes).toContainEqual([30, 10]);
  });

  it("removes duplicated entities instead of charging for them twice", () => {
    const a = analyzeDxf(dxf([...rectLines(0, 0, 50, 50), line(50, 0, 0, 0), circle(25, 25, 5), circle(25, 25, 5)]));
    expect(a.duplicates).toBe(2);
    close(a.cutLength, 200 + 2 * Math.PI * 5, 1e-9);
    expect(a.pierceCount).toBe(2);
  });

  it("reports open contours and still counts their length", () => {
    const a = analyzeDxf(dxf([...rectLines(0, 0, 50, 50), line(10, 10, 40, 10)]));
    expect(a.openContours).toBe(1);
    close(a.cutLength, 230);
    expect(a.pierceCount).toBe(2);
    expect(a.warnings.map((w) => w.code)).toContain("open_contour");
  });

  it("treats bend-layer lines as bends, not cuts", () => {
    const a = analyzeDxf(dxf([...rectLines(0, 0, 100, 60), line(50, 0, 50, 60, { layer: "BUKUM" }), line(20, 0, 20, 60, { layer: "Bend-Lines" })]));
    expect(a.bendCount).toBe(2);
    close(a.bendLength, 120);
    close(a.cutLength, 320);
    expect(a.pierceCount).toBe(1);
  });

  it("part inside a hole is a separate part (island)", () => {
    const a = analyzeDxf(dxf([circle(0, 0, 50), circle(0, 0, 30), circle(0, 0, 10)]));
    expect(a.parts).toHaveLength(2);
    close(a.netArea, Math.PI * (2500 - 900 + 100));
  });

  it("rejects input that is not DXF", () => {
    expect(() => analyzeDxf("hello world")).toThrow(DxfError);
    expect(() => analyzeDxf("")).toThrow(DxfError);
    expect(() => analyzeDxf("0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nEOF")).toThrow(DxfError);
    expect(() => analyzeDxf("AutoCAD Binary DXF\r\n\x1a\0")).toThrow(DxfError);
  });

  it("ignores text and dimensions but says so", () => {
    const a = analyzeDxf(dxf([...rectLines(0, 0, 10, 10), "0\nTEXT\n8\n0\n10\n1\n20\n1\n1\nhello"]));
    expect(a.warnings.map((w) => w.code)).toContain("ignored");
    close(a.netArea, 100);
  });
});

describe("DXF analysis properties", () => {
  it("any rotated, shuffled, randomly reversed rectangle chains to one part with exact area and perimeter", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 3000, noNaN: true }), fc.double({ min: 1, max: 3000, noNaN: true }),
        fc.double({ min: 0, max: Math.PI * 2, noNaN: true }),
        fc.double({ min: -5000, max: 5000, noNaN: true }), fc.double({ min: -5000, max: 5000, noNaN: true }),
        fc.array(fc.boolean(), { minLength: 4, maxLength: 4 }), fc.shuffledSubarray([0, 1, 2, 3], { minLength: 4 }),
        (w, h, rot, tx, ty, flips, order) => {
          const c = Math.cos(rot), s = Math.sin(rot);
          const P = [[0, 0], [w, 0], [w, h], [0, h]].map(([x, y]) => [tx + x * c - y * s, ty + x * s + y * c]);
          const segs = [0, 1, 2, 3].map((i) => {
            const [a, b] = [P[i], P[(i + 1) % 4]];
            return flips[i] ? line(b[0], b[1], a[0], a[1]) : line(a[0], a[1], b[0], b[1]);
          });
          const a = analyzeDxf(dxf(order.map((i) => segs[i])));
          expect(a.parts).toHaveLength(1);
          expect(a.openContours).toBe(0);
          close(a.netArea, w * h, 1e-6);
          close(a.cutLength, 2 * (w + h), 1e-9);
        },
      ),
      { numRuns: 300 },
    );
  });

  it("never throws anything but DxfError on arbitrary text, and never returns NaN", () => {
    fc.assert(
      fc.property(fc.array(fc.oneof(fc.constantFrom("0", "SECTION", "ENTITIES", "2", "LINE", "CIRCLE", "10", "20", "40", "ENDSEC", "LWPOLYLINE", "42", "70", "SPLINE", "INSERT"), fc.string(), fc.double().map(String)), { maxLength: 200 }), (toks) => {
        try {
          const a = analyzeDxf(toks.join("\n"));
          for (const v of [a.cutLength, a.netArea, a.width, a.height]) expect(Number.isFinite(v)).toBe(true);
        } catch (e) {
          expect(e).toBeInstanceOf(DxfError);
        }
      }),
      { numRuns: 500 },
    );
  });
});
