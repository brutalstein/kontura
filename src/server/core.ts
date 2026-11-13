import { createHash, randomBytes } from "node:crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import type { DB } from "./db";
import { type Role, auditLog, memberships, orgs, quotes } from "./schema";

/** An error whose message is safe and meant to be shown to the user (Turkish). */
export class AppError extends Error {
  constructor(message: string, public code: "invalid" | "forbidden" | "not_found" | "limit" | "inactive" | "rate" = "invalid") {
    super(message);
  }
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const randomToken = () => randomBytes(32).toString("base64url");

/** Everything a tenant-scoped service needs. Services must filter every query by `orgId`. */
export type Ctx = { db: DB; orgId: string; userId: string; role: Role };

type Perm = "read" | "write" | "settings" | "team" | "billing";
const ALLOWED: Record<Perm, Role[]> = {
  read: ["owner", "admin", "estimator", "viewer"],
  write: ["owner", "admin", "estimator"],
  settings: ["owner", "admin"],
  team: ["owner", "admin"],
  billing: ["owner"],
};
export const can = (role: Role, perm: Perm) => ALLOWED[perm].includes(role);
export function need(ctx: Ctx, perm: Perm) {
  if (!can(ctx.role, perm)) throw new AppError("Bu işlem için yetkiniz yok.", "forbidden");
}

export const ROLE_LABEL: Record<Role, string> = { owner: "Sahip", admin: "Yönetici", estimator: "Teklifçi", viewer: "İzleyici" };

// ---- Plans and entitlements -------------------------------------------------

export type PlanId = "trial" | "starter" | "workshop" | "pro";
export const PLANS: Record<PlanId, { name: string; priceTry: number; quotesPerMonth: number; seats: number; portal: boolean; tagline: string }> = {
  trial: { name: "Deneme", priceTry: 0, quotesPerMonth: Infinity, seats: 3, portal: true, tagline: "14 gün, tüm özellikler" },
  starter: { name: "Başlangıç", priceTry: 1900, quotesPerMonth: 40, seats: 1, portal: false, tagline: "Tek kişilik teklif masası" },
  workshop: { name: "Atölye", priceTry: 4900, quotesPerMonth: Infinity, seats: 5, portal: true, tagline: "Sınırsız teklif ve müşteri portalı" },
  pro: { name: "Pro", priceTry: 9900, quotesPerMonth: Infinity, seats: 15, portal: true, tagline: "Büyük ekipler için" },
};
export const TRIAL_DAYS = 14;

export type Entitlements = { plan: PlanId; active: boolean; reason?: string; quotesPerMonth: number; seats: number; portal: boolean; trialDaysLeft: number | null };

export function entitlements(org: Pick<typeof orgs.$inferSelect, "plan" | "trialEndsAt" | "subStatus"> & { subRenewsAt?: Date | null }, now = new Date()): Entitlements {
  const p = PLANS[org.plan];
  const base = { plan: org.plan, quotesPerMonth: p.quotesPerMonth, seats: p.seats, portal: p.portal };
  if (org.plan === "trial") {
    const left = Math.ceil((org.trialEndsAt.getTime() - now.getTime()) / 86_400_000);
    return left > 0
      ? { ...base, active: true, trialDaysLeft: left }
      : { ...base, active: false, portal: false, trialDaysLeft: 0, reason: "Deneme süreniz doldu. Devam etmek için bir plan seçin." };
  }
  // Retries or delayed webhooks never grant unpaid time. Every paid plan ends at its verified paid period.
  const paidUntil = org.subRenewsAt && org.subRenewsAt > now;
  if (org.subStatus !== "none" && paidUntil) return { ...base, active: true, trialDaysLeft: null };
  return { ...base, active: false, portal: false, trialDaysLeft: null, reason: "Aboneliğiniz etkin değil. Devam etmek için aboneliği yenileyin." };
}

export async function loadOrg(db: DB, orgId: string) {
  const [org] = await db.select().from(orgs).where(eq(orgs.id, orgId));
  if (!org) throw new AppError("Firma bulunamadı.", "not_found");
  return org;
}

/** Blocks writes for expired trials and cancelled subscriptions; returns the org and its entitlements. */
export async function needActive(ctx: Ctx) {
  const org = await loadOrg(ctx.db, ctx.orgId);
  const ent = entitlements(org);
  if (!ent.active) throw new AppError(ent.reason!, "inactive");
  return { org, ent };
}

export async function quotesThisMonth(db: DB, orgId: string, now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(quotes).where(and(eq(quotes.orgId, orgId), gte(quotes.createdAt, start)));
  return r.n;
}

export async function seatCount(db: DB, orgId: string) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(memberships).where(eq(memberships.orgId, orgId));
  return r.n;
}

export async function audit(ctx: Pick<Ctx, "db" | "orgId"> & { userId?: string }, action: string, detail?: string) {
  await ctx.db.insert(auditLog).values({ orgId: ctx.orgId, userId: ctx.userId ?? null, action, detail });
}

// ---- Rate limiting ----------------------------------------------------------

const buckets = new Map<string, { n: number; reset: number }>();
/** Fixed-window limiter. shortcut: in-memory, so limits are per process; move to Redis when running more than one instance. */
export function rateLimit(key: string, max: number, windowMs: number, now = Date.now()) {
  const b = buckets.get(key);
  if (!b || b.reset <= now) {
    if (buckets.size > 50_000) for (const [k, v] of buckets) if (v.reset <= now) buckets.delete(k);
    buckets.set(key, { n: 1, reset: now + windowMs });
    return;
  }
  if (++b.n > max) throw new AppError("Çok fazla deneme yaptınız. Lütfen biraz sonra tekrar deneyin.", "rate");
}
export const resetRateLimits = () => buckets.clear();

export function slugify(s: string) {
  const map: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", İ: "i" };
  return s.replace(/[çğıöşüİ]/g, (c) => map[c]).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "firma";
}
