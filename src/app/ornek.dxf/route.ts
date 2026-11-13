import { SAMPLE_DXF } from "@/ui/sample";

export function GET() {
  return new Response(SAMPLE_DXF, { headers: { "Content-Type": "application/dxf", "Content-Disposition": 'attachment; filename="kontura-ornek-braket.dxf"' } });
}
