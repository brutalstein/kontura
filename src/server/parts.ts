import { and, desc, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { AppError, type Ctx, need, needActive, sha256 } from "./core";
import { addItem, createQuote, getFile, getQuote, updateItem } from "./quotes";
import { type PartRecipe, customers, partRevisions, quoteItems } from "./schema";

/** Byte-content identity after line-ending normalization; not geometric similarity. */
export const drawingHash = (content: string) => sha256(content.replace(/\r\n?/g, "\n").trim());

export async function savePartRevision(ctx: Ctx, itemId: string) {
  need(ctx, "write");
  await needActive(ctx);
  const [item] = await ctx.db.select().from(quoteItems).where(and(eq(quoteItems.id, itemId), eq(quoteItems.orgId, ctx.orgId)));
  if (!item) throw new AppError("Kalem bulunamadı.", "not_found");
  const { quote } = await getQuote(ctx, item.quoteId);
  if (!quote.customerId) throw new AppError("Parça hafızası için önce kayıtlı bir müşteri seçin.");
  const identity = z.object({ code: z.string().trim().min(1, "Parça kodunu girin.").max(80), revision: z.string().trim().min(1, "Revizyonu girin.").max(40) })
    .parse({ code: item.partCode, revision: item.revision });
  if (!item.fileId || !item.result) throw new AppError("Parçayı kaydetmeden önce DXF ve fiyat bilgilerini tamamlayın.");
  const file = await getFile(ctx, item.fileId);
  const recipe: PartRecipe = { materialId: item.materialId, machineId: item.machineId, thickness: item.thickness, qty: item.qty, bends: item.bends, extraPerUnit: item.extraPerUnit, ops: item.ops, customerMaterial: item.customerMaterial };
  const contentHash = drawingHash(file.content);
  const [saved] = await ctx.db.insert(partRevisions).values({
    orgId: ctx.orgId, customerId: quote.customerId, ...identity, name: item.name, content: file.content, contentHash,
    analysis: item.analysis, recipe, baseline: { qty: item.qty, result: item.result, quoteNumber: quote.number, savedAt: new Date().toISOString() },
  }).onConflictDoNothing().returning();
  if (saved) return saved;
  const [existing] = await ctx.db.select().from(partRevisions).where(and(eq(partRevisions.orgId, ctx.orgId), eq(partRevisions.customerId, quote.customerId), eq(partRevisions.code, identity.code), eq(partRevisions.revision, identity.revision)));
  if (existing.contentHash !== contentHash) {
    throw new AppError("Bu revizyon kayıtlı ve değiştirilemez. Farklı çizim için yeni revizyon girin.");
  }
  return existing;
}

/** Metadata only: never loads all saved drawing contents into the library screen. */
export async function listPartRevisions(ctx: Ctx, filter: { customerId?: string; q?: string } = {}) {
  need(ctx, "read");
  const conditions = [eq(partRevisions.orgId, ctx.orgId)];
  if (filter.customerId) conditions.push(eq(partRevisions.customerId, filter.customerId));
  if (filter.q?.trim()) {
    const term = `%${filter.q.trim().replace(/[%_\\]/g, "\\$&")}%`;
    conditions.push(or(ilike(partRevisions.code, term), ilike(partRevisions.name, term), ilike(partRevisions.revision, term))!);
  }
  return ctx.db.select({ id: partRevisions.id, customerId: partRevisions.customerId, customerName: customers.name, code: partRevisions.code,
    revision: partRevisions.revision, name: partRevisions.name, contentHash: partRevisions.contentHash, analysis: partRevisions.analysis,
    baseline: partRevisions.baseline, createdAt: partRevisions.createdAt })
    .from(partRevisions).innerJoin(customers, and(eq(customers.id, partRevisions.customerId), eq(customers.orgId, ctx.orgId)))
    .where(and(...conditions)).orderBy(desc(partRevisions.createdAt), desc(partRevisions.id)).limit(100);
}

async function ownPart(ctx: Ctx, partId: string) {
  const [part] = await ctx.db.select().from(partRevisions).where(and(eq(partRevisions.id, partId), eq(partRevisions.orgId, ctx.orgId)));
  if (!part) throw new AppError("Kayıtlı parça bulunamadı.", "not_found");
  return part;
}

export async function addSavedPart(ctx: Ctx, quoteId: string, partId: string) {
  need(ctx, "write");
  await needActive(ctx);
  const part = await ownPart(ctx, partId);
  const { quote } = await getQuote(ctx, quoteId);
  if (quote.customerId !== part.customerId) throw new AppError("Bu parça farklı bir müşteriye ait. Teklifte parçanın müşterisini seçin.");
  return ctx.db.transaction(async (tx) => {
    const scoped = { ...ctx, db: tx };
    const item = await addItem(scoped, quoteId, { name: `${part.code}.dxf`, content: part.content });
    await updateItem(scoped, item.id, { ...part.recipe, name: part.name, partCode: part.code, revision: part.revision });
    await tx.update(quoteItems).set({ baseline: part.baseline }).where(and(eq(quoteItems.id, item.id), eq(quoteItems.orgId, ctx.orgId)));
    return item;
  });
}

export async function quoteFromPart(ctx: Ctx, partId: string) {
  need(ctx, "write");
  await needActive(ctx);
  const part = await ownPart(ctx, partId);
  return ctx.db.transaction(async (tx) => {
    const scoped = { ...ctx, db: tx };
    const quote = await createQuote(scoped, { customerId: part.customerId });
    await addSavedPart(scoped, quote.id, part.id);
    return quote;
  });
}
