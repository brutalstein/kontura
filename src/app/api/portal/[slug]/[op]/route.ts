import { getDb } from "@/server/db";
import { portalEstimate, portalSubmit } from "@/server/quotes";
import { clientIp, errorResponse } from "@/server/session";

/** Public instant-quote portal: `tahmin` prices the uploaded drawings without storing them, `talep` files a quote request with the shop. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string; op: string }> }) {
  const { slug, op } = await params;
  try {
    const body = await req.json().catch(() => null);
    const db = await getDb(), ip = await clientIp();
    if (op === "tahmin") return Response.json(await portalEstimate(db, slug, body?.items, ip));
    if (op === "talep") return Response.json(await portalSubmit(db, slug, { contact: body?.contact, items: body?.items, note: body?.note }, ip), { status: 201 });
    return Response.json({ error: "Bulunamadı." }, { status: 404 });
  } catch (e) {
    return errorResponse(e);
  }
}
