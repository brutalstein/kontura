import { MAX_DXF_BYTES, addItem } from "@/server/quotes";
import { apiCtx, errorResponse, sameOrigin, unauthorized } from "@/server/session";
import { decodeDxf } from "@/ui/decode";

/** Adds one uploaded DXF to a draft quote. A route handler rather than a server action because drawings exceed the action body limit. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return Response.json({ error: "Geçersiz istek kaynağı." }, { status: 403 });
  const ctx = await apiCtx();
  if (!ctx) return unauthorized();
  try {
    const file = (await req.formData()).get("file");
    if (!(file instanceof File)) return Response.json({ error: "Dosya bulunamadı." }, { status: 400 });
    if (file.size > MAX_DXF_BYTES) return Response.json({ error: `${file.name}: dosya çok büyük (en fazla 8 MB).` }, { status: 413 });
    const item = await addItem(ctx, (await params).id, { name: file.name, content: decodeDxf(await file.arrayBuffer()) });
    return Response.json({ id: item.id }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
