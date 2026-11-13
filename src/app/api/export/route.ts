import { exportOrgData } from "@/server/privacy";
import { apiCtx, errorResponse, unauthorized } from "@/server/session";

/** Full data export for the organisation (owner only), as a JSON download. */
export async function GET() {
  const ctx = await apiCtx();
  if (!ctx) return unauthorized();
  try {
    const dump = await exportOrgData(ctx);
    return new Response(JSON.stringify(dump, null, 2), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="kontura-veri-${new Date().toISOString().slice(0, 10)}.json"`, "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
