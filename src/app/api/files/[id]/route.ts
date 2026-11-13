import { getFile } from "@/server/quotes";
import { apiCtx, errorResponse, unauthorized } from "@/server/session";

/** Downloads an uploaded drawing. Scoped to the caller's organisation by getFile. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await apiCtx();
  if (!ctx) return unauthorized();
  try {
    const f = await getFile(ctx, (await params).id);
    const name = f.name.replace(/[^\w.\- ]+/g, "_");
    return new Response(f.content, { headers: { "Content-Type": "application/dxf", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
