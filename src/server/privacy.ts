import { desc, eq, sql } from "drizzle-orm";
import type { DB } from "./db";
import { AppError, type Ctx, loadOrg, need } from "./core";
import { auditLog, customers, cutParams, files, machines, materials, memberships, operations, orders, orgs, partRevisions, quoteItems, quotes, supportMessages, users } from "./schema";

/** Everything the organisation has stored, as one JSON document (KVKK access / portability requests). Owner only. */
export async function exportOrgData(ctx: Ctx) {
  need(ctx, "billing");
  const by = <T extends { orgId: unknown }>(t: T) => eq(t.orgId as never, ctx.orgId);
  const { subRef: _s, ...org } = await loadOrg(ctx.db, ctx.orgId);
  const members = await ctx.db.select({ name: users.name, email: users.email, role: memberships.role }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.orgId, ctx.orgId));
  return {
    exportedAt: new Date().toISOString(), org, members,
    machines: await ctx.db.select().from(machines).where(by(machines)),
    materials: await ctx.db.select().from(materials).where(by(materials)),
    cutParams: await ctx.db.select().from(cutParams).where(by(cutParams)),
    customers: await ctx.db.select().from(customers).where(by(customers)),
    quotes: await ctx.db.select().from(quotes).where(by(quotes)),
    quoteItems: await ctx.db.select().from(quoteItems).where(by(quoteItems)),
    partRevisions: await ctx.db.select().from(partRevisions).where(by(partRevisions)),
    operations: await ctx.db.select().from(operations).where(by(operations)),
    orders: await ctx.db.select().from(orders).where(by(orders)),
    files: await ctx.db.select({ id: files.id, name: files.name, size: files.size, content: files.content }).from(files).where(by(files)),
  };
}

/** Permanently deletes the organisation and all of its data. Users who belong to no other organisation are deleted too. */
export async function deleteOrg(ctx: Ctx, confirmName: string) {
  need(ctx, "billing");
  const org = await loadOrg(ctx.db, ctx.orgId);
  if (confirmName.trim() !== org.name) throw new AppError("Onay için firma adını aynen yazın.");
  if (org.subStatus === "active" || org.subStatus === "past_due") throw new AppError("Önce aboneliğinizi iptal edin.");
  await ctx.db.transaction(async (tx) => {
    const members = await tx.select({ userId: memberships.userId }).from(memberships).where(eq(memberships.orgId, ctx.orgId));
    await tx.delete(orgs).where(eq(orgs.id, ctx.orgId)); // cascades to every tenant table
    for (const m of members) {
      const other = await tx.select({ orgId: memberships.orgId }).from(memberships).where(eq(memberships.userId, m.userId)).limit(1);
      if (!other.length) await tx.delete(users).where(eq(users.id, m.userId));
    }
  });
}

export async function recentAudit(ctx: Ctx) {
  need(ctx, "settings");
  return ctx.db.select({ action: auditLog.action, detail: auditLog.detail, createdAt: auditLog.createdAt, userName: users.name })
    .from(auditLog).leftJoin(users, eq(users.id, auditLog.userId)).where(eq(auditLog.orgId, ctx.orgId)).orderBy(desc(auditLog.createdAt)).limit(50);
}

/** Latest support messages across all organisations. The caller must have checked `isPlatformAdmin`. */
export async function adminSupport(db: DB) {
  return db.select({ id: supportMessages.id, subject: supportMessages.subject, body: supportMessages.body, createdAt: supportMessages.createdAt, orgName: orgs.name, email: users.email })
    .from(supportMessages).innerJoin(orgs, eq(orgs.id, supportMessages.orgId)).leftJoin(users, eq(users.id, supportMessages.userId))
    .orderBy(desc(supportMessages.createdAt)).limit(100);
}

/** Platform operator view. The caller must have checked `isPlatformAdmin`. */
export async function adminOverview(db: DB) {
  return db.select({
    id: orgs.id, name: orgs.name, slug: orgs.slug, plan: orgs.plan, subStatus: orgs.subStatus, trialEndsAt: orgs.trialEndsAt, createdAt: orgs.createdAt,
    members: sql<number>`(select count(*)::int from ${memberships} where ${memberships.orgId} = ${orgs.id})`,
    quotes: sql<number>`(select count(*)::int from ${quotes} where ${quotes.orgId} = ${orgs.id})`,
  }).from(orgs).orderBy(desc(orgs.createdAt)).limit(500);
}
