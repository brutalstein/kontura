import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { type SessionInfo, resolveSession } from "./auth";
import { AppError, type Ctx } from "./core";
import { getDb } from "./db";
import type { Role, orgs } from "./schema";

export const SESSION_COOKIE = "kontura_session";

/** One session lookup per request, shared by layouts, pages and actions. */
export const getSession = cache(async () => {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  const db = await getDb();
  return { db, raw, info: await resolveSession(db, raw) };
});

export async function setSessionCookie(raw: string) {
  (await cookies()).set(SESSION_COOKIE, raw, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 30 * 86_400 });
}
export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** shortcut: trusts X-Forwarded-For, which is only correct behind a reverse proxy that overwrites it (see docs/DEPLOYMENT.md). */
export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "unknown";
}

export type Authed = { ctx: Ctx; raw: string; info: SessionInfo & { org: typeof orgs.$inferSelect; role: Role } };

/** Signed-in user with an active organisation, or a redirect. Use in every panel page, action and route handler. */
export async function requireCtx(): Promise<Authed> {
  const { db, raw, info } = await getSession();
  if (!info || !raw) redirect("/giris");
  if (!info.org || !info.role) redirect("/firmasiz");
  return { ctx: { db, orgId: info.org.id, userId: info.user.id, role: info.role }, raw, info: info as Authed["info"] };
}

// ---- Server action plumbing -------------------------------------------------

export type State = { error?: string; ok?: string; url?: string; html?: string } | null;

/** Runs an action body and turns expected failures into a message for the form. Redirects pass through. */
export async function attempt(fn: () => Promise<State | void>): Promise<State> {
  try {
    return (await fn()) ?? { ok: "Kaydedildi." };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof AppError) return { error: e.message };
    if (e instanceof ZodError) return { error: e.issues[0]?.message ?? "Girdiğiniz bilgileri kontrol edin." };
    console.error("[action]", e);
    return { error: "Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin." };
  }
}

/** Panel mutation: runs with the caller's tenant context, then refreshes every panel screen. */
export function panelAction(fn: (a: Authed) => Promise<State | void>): Promise<State> {
  return attempt(async () => {
    const result = await fn(await requireCtx());
    revalidatePath("/panel", "layout");
    return result;
  });
}

// ---- Route handler plumbing -------------------------------------------------

/** Tenant context for a route handler, or null when the caller is not signed in (handlers answer 401 instead of redirecting). */
export async function apiCtx(): Promise<Ctx | null> {
  const { db, info } = await getSession();
  if (!info?.org || !info.role) return null;
  return { db, orgId: info.org.id, userId: info.user.id, role: info.role };
}

const STATUS = { invalid: 400, forbidden: 403, not_found: 404, limit: 403, inactive: 403, rate: 429 } as const;
export function errorResponse(e: unknown) {
  if (e instanceof AppError) return Response.json({ error: e.message }, { status: STATUS[e.code] });
  if (e instanceof ZodError) return Response.json({ error: e.issues[0]?.message ?? "Geçersiz istek." }, { status: 400 });
  console.error("[api]", e);
  return Response.json({ error: "Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin." }, { status: 500 });
}
export const unauthorized = () => Response.json({ error: "Oturumunuz sona ermiş. Yeniden giriş yapın." }, { status: 401 });

/** Route handlers are not covered by the built-in server-action origin check, so cookie-authenticated ones verify it themselves. */
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  return !origin || new URL(origin).host === (req.headers.get("x-forwarded-host") ?? req.headers.get("host"));
}
