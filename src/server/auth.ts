import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "./db";
import { AppError, type Ctx, TRIAL_DAYS, audit, need, randomToken, rateLimit, seatCount, sha256, slugify, entitlements, loadOrg } from "./core";
import { appUrl, sendMail } from "./mail";
import { type OrgRules, type Role, memberships, orgs, sessions, tokens, users } from "./schema";

const SCRYPT_N = 32768;
const kdf = (pw: string, salt: Buffer) =>
  new Promise<Buffer>((res, rej) => scrypt(pw, salt, 64, { N: SCRYPT_N, r: 8, p: 1, maxmem: 128 * 1024 * 1024 }, (e, k) => (e ? rej(e) : res(k))));

export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  return `scrypt$${SCRYPT_N}$${salt.toString("base64")}$${(await kdf(pw, salt)).toString("base64")}`;
}
export async function verifyPassword(pw: string, stored: string) {
  const [alg, , salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await kdf(pw, Buffer.from(salt, "base64"));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export const DEFAULT_RULES: OrgRules = {
  marginPct: 25, setupFee: 0, minOrder: 0, vatPct: 20, bendRate: 15, bendSetup: 250, rapidSecPerPierce: 0.5,
  sheetMargin: 10, partGap: 5, remnantPolicy: "used-length", qtyBreaks: [], validityDays: 15, fx: { USD: 0, EUR: 0 },
};

const email = z.string().trim().toLowerCase().email("Geçerli bir e-posta girin.").max(200);
const password = z.string().min(10, "Şifre en az 10 karakter olmalı.").max(200);
const personName = z.string().trim().min(2, "Ad soyad girin.").max(100);

export const signupInput = z.object({ name: personName, company: z.string().trim().min(2, "Firma adını girin.").max(120), email, password });

const SESSION_DAYS = 30;
const days = (n: number) => new Date(Date.now() + n * 86_400_000);

async function issueToken(db: DB, kind: "verify" | "reset" | "invite", fields: { userId?: string; orgId?: string; email?: string; role?: Role }, ttlMs: number) {
  const raw = randomToken();
  await db.insert(tokens).values({ id: sha256(raw), kind, ...fields, expiresAt: new Date(Date.now() + ttlMs) });
  return raw;
}

/** Marks the token used and returns it, or null if it is unknown, expired or already used. Single statement, so it cannot be redeemed twice. */
async function consumeToken(db: DB, raw: string, kind: "verify" | "reset" | "invite") {
  const [row] = await db.update(tokens).set({ usedAt: new Date() })
    .where(and(eq(tokens.id, sha256(raw)), eq(tokens.kind, kind), isNull(tokens.usedAt), gt(tokens.expiresAt, new Date())))
    .returning();
  return row ?? null;
}

export async function createSession(db: DB, userId: string, orgId: string | null) {
  const raw = randomToken();
  await db.insert(sessions).values({ id: sha256(raw), userId, orgId, expiresAt: days(SESSION_DAYS) });
  return raw;
}

export async function signup(db: DB, input: z.input<typeof signupInput>) {
  const data = signupInput.parse(input);
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, data.email));
  if (existing) throw new AppError("Bu e-posta ile kayıtlı bir hesap var. Giriş yapmayı deneyin.");
  const passwordHash = await hashPassword(data.password);
  const base = slugify(data.company);
  const result = await db.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({ email: data.email, name: data.name, passwordHash }).returning();
    let slug = base;
    for (let i = 0; (await tx.select({ id: orgs.id }).from(orgs).where(eq(orgs.slug, slug))).length; i++) slug = `${base}-${randomBytes(2).toString("hex")}`;
    const [org] = await tx.insert(orgs).values({ name: data.company, slug, rules: DEFAULT_RULES, trialEndsAt: days(TRIAL_DAYS) }).returning();
    await tx.insert(memberships).values({ orgId: org.id, userId: user.id, role: "owner" });
    return { user, org };
  });
  const verifyUrl = await sendVerification(db, result.user.id, data.email);
  const session = await createSession(db, result.user.id, result.org.id);
  return { ...result, session, verifyUrl };
}

export async function sendVerification(db: DB, userId: string, to: string) {
  const url = `${appUrl()}/dogrula?t=${await issueToken(db, "verify", { userId }, 3 * 86_400_000)}`;
  await sendMail({ to, subject: "Kontura — e-posta adresinizi doğrulayın", text: `Merhaba,\n\nHesabınızı doğrulamak için bağlantıya tıklayın:\n${url}\n\nBağlantı 3 gün geçerlidir.` });
  return url;
}

export async function verifyEmail(db: DB, raw: string) {
  const t = await consumeToken(db, raw, "verify");
  if (!t?.userId) throw new AppError("Doğrulama bağlantısı geçersiz veya süresi dolmuş.");
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, t.userId));
}

export async function login(db: DB, input: { email: string; password: string }, ip = "unknown") {
  const mail = String(input.email ?? "").trim().toLowerCase();
  rateLimit(`login:${mail}`, 8, 15 * 60_000);
  rateLimit(`login-ip:${ip}`, 40, 15 * 60_000);
  const [user] = await db.select().from(users).where(eq(users.email, mail));
  // run the KDF even for unknown e-mails so response time does not reveal which accounts exist
  const ok = await verifyPassword(String(input.password ?? ""), user?.passwordHash ?? "scrypt$32768$AAAAAAAAAAAAAAAAAAAAAA==$AA==");
  if (!user || !ok) throw new AppError("E-posta veya şifre hatalı.");
  const [m] = await db.select().from(memberships).where(eq(memberships.userId, user.id)).orderBy(memberships.createdAt);
  return { user, session: await createSession(db, user.id, m?.orgId ?? null) };
}

export async function logout(db: DB, rawSession: string) {
  await db.delete(sessions).where(eq(sessions.id, sha256(rawSession)));
}

export type SessionInfo = {
  user: Pick<typeof users.$inferSelect, "id" | "email" | "name" | "emailVerifiedAt" | "isPlatformAdmin">;
  org: typeof orgs.$inferSelect | null;
  role: Role | null;
  orgsOfUser: { id: string; name: string; role: Role }[];
};

export async function resolveSession(db: DB, rawSession: string | undefined): Promise<SessionInfo | null> {
  if (!rawSession) return null;
  const [row] = await db.select({ s: sessions, u: users }).from(sessions).innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sha256(rawSession)), gt(sessions.expiresAt, new Date())));
  if (!row) return null;
  const mine = await db.select({ id: orgs.id, name: orgs.name, role: memberships.role, org: orgs })
    .from(memberships).innerJoin(orgs, eq(orgs.id, memberships.orgId)).where(eq(memberships.userId, row.u.id)).orderBy(memberships.createdAt);
  const active = mine.find((m) => m.id === row.s.orgId) ?? mine[0];
  const { id, email: mail, name, emailVerifiedAt, isPlatformAdmin } = row.u;
  return {
    user: { id, email: mail, name, emailVerifiedAt, isPlatformAdmin },
    org: active?.org ?? null,
    role: active?.role ?? null,
    orgsOfUser: mine.map(({ id: oid, name: oname, role }) => ({ id: oid, name: oname, role })),
  };
}

export async function switchOrg(db: DB, rawSession: string, userId: string, orgId: string) {
  const [m] = await db.select().from(memberships).where(and(eq(memberships.userId, userId), eq(memberships.orgId, orgId)));
  if (!m) throw new AppError("Bu firmaya erişiminiz yok.", "forbidden");
  await db.update(sessions).set({ orgId }).where(and(eq(sessions.id, sha256(rawSession)), eq(sessions.userId, userId)));
}

export async function requestPasswordReset(db: DB, rawEmail: string, ip = "unknown") {
  const mail = String(rawEmail ?? "").trim().toLowerCase();
  rateLimit(`reset:${mail}`, 3, 60 * 60_000);
  rateLimit(`reset-ip:${ip}`, 20, 60 * 60_000);
  const [user] = await db.select().from(users).where(eq(users.email, mail));
  if (!user) return null; // callers show the same message either way
  const url = `${appUrl()}/sifre-sifirla?t=${await issueToken(db, "reset", { userId: user.id }, 60 * 60_000)}`;
  await sendMail({ to: mail, subject: "Kontura — şifre sıfırlama", text: `Şifrenizi sıfırlamak için bağlantıya tıklayın (1 saat geçerli):\n${url}\n\nBu isteği siz yapmadıysanız bu e-postayı yok sayın.` });
  return url;
}

export async function resetPassword(db: DB, raw: string, newPassword: string) {
  const pw = password.parse(newPassword);
  const t = await consumeToken(db, raw, "reset");
  if (!t?.userId) throw new AppError("Sıfırlama bağlantısı geçersiz veya süresi dolmuş.");
  await db.update(users).set({ passwordHash: await hashPassword(pw), emailVerifiedAt: new Date() }).where(eq(users.id, t.userId));
  await db.delete(sessions).where(eq(sessions.userId, t.userId)); // sign out everywhere
}

export async function changePassword(db: DB, userId: string, current: string, next: string) {
  const pw = password.parse(next);
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || !(await verifyPassword(current, user.passwordHash))) throw new AppError("Mevcut şifre hatalı.");
  await db.update(users).set({ passwordHash: await hashPassword(pw) }).where(eq(users.id, userId));
}

// ---- Team -------------------------------------------------------------------

export async function listMembers(ctx: Ctx) {
  need(ctx, "read");
  return ctx.db.select({ userId: users.id, name: users.name, email: users.email, role: memberships.role, joinedAt: memberships.createdAt })
    .from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.orgId, ctx.orgId)).orderBy(memberships.createdAt);
}

export async function listInvites(ctx: Ctx) {
  need(ctx, "team");
  return ctx.db.select({ id: tokens.id, email: tokens.email, role: tokens.role, expiresAt: tokens.expiresAt }).from(tokens)
    .where(and(eq(tokens.orgId, ctx.orgId), eq(tokens.kind, "invite"), isNull(tokens.usedAt), gt(tokens.expiresAt, new Date())));
}

export async function inviteMember(ctx: Ctx, input: { email: string; role: string }) {
  need(ctx, "team");
  const data = z.object({ email, role: z.enum(["admin", "estimator", "viewer"]) }).parse(input);
  const org = await loadOrg(ctx.db, ctx.orgId);
  const ent = entitlements(org);
  if (!ent.active) throw new AppError(ent.reason!, "inactive");
  const pending = await listInvites(ctx);
  if ((await seatCount(ctx.db, ctx.orgId)) + pending.length >= ent.seats) {
    throw new AppError(`Planınız ${ent.seats} kullanıcıya izin veriyor. Daha fazla kişi eklemek için planınızı yükseltin.`, "limit");
  }
  const [already] = await ctx.db.select({ id: users.id }).from(users).innerJoin(memberships, eq(memberships.userId, users.id))
    .where(and(eq(users.email, data.email), eq(memberships.orgId, ctx.orgId)));
  if (already) throw new AppError("Bu kişi zaten ekipte.");
  const url = `${appUrl()}/davet?t=${await issueToken(ctx.db, "invite", { orgId: ctx.orgId, email: data.email, role: data.role }, 7 * 86_400_000)}`;
  await sendMail({ to: data.email, subject: `${org.name} sizi Kontura'ya davet etti`, text: `${org.name} ekibine katılmak için bağlantıya tıklayın (7 gün geçerli):\n${url}` });
  await audit(ctx, "team.invite", `${data.email} (${data.role})`);
  return url;
}

export async function revokeInvite(ctx: Ctx, tokenId: string) {
  need(ctx, "team");
  await ctx.db.delete(tokens).where(and(eq(tokens.id, tokenId), eq(tokens.orgId, ctx.orgId), eq(tokens.kind, "invite")));
}

export async function peekInvite(db: DB, raw: string) {
  const [t] = await db.select({ email: tokens.email, orgName: orgs.name }).from(tokens).innerJoin(orgs, eq(orgs.id, tokens.orgId))
    .where(and(eq(tokens.id, sha256(raw)), eq(tokens.kind, "invite"), isNull(tokens.usedAt), gt(tokens.expiresAt, new Date())));
  if (!t?.email) return null;
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, t.email));
  return { email: t.email, orgName: t.orgName, hasAccount: Boolean(u) };
}

/** Joins the invited e-mail to the org. A new account is created when none exists; an existing account must prove its password. */
export async function acceptInvite(db: DB, raw: string, input: { name?: string; password: string }) {
  const peek = await peekInvite(db, raw);
  if (!peek) throw new AppError("Davet bağlantısı geçersiz veya süresi dolmuş.");
  let [user] = await db.select().from(users).where(eq(users.email, peek.email));
  if (user) {
    if (!(await verifyPassword(input.password, user.passwordHash))) throw new AppError("Şifre hatalı.");
  } else {
    const data = z.object({ name: personName, password }).parse(input);
    [user] = await db.insert(users).values({ email: peek.email, name: data.name, passwordHash: await hashPassword(data.password), emailVerifiedAt: new Date() }).returning();
  }
  const t = await consumeToken(db, raw, "invite");
  if (!t?.orgId || !t.role) throw new AppError("Davet bağlantısı geçersiz veya süresi dolmuş.");
  await db.insert(memberships).values({ orgId: t.orgId, userId: user.id, role: t.role }).onConflictDoNothing();
  return { user, session: await createSession(db, user.id, t.orgId) };
}

async function ownerCount(ctx: Ctx) {
  return (await ctx.db.select().from(memberships).where(and(eq(memberships.orgId, ctx.orgId), eq(memberships.role, "owner")))).length;
}

export async function setMemberRole(ctx: Ctx, userId: string, role: string) {
  need(ctx, "team");
  const next = z.enum(["owner", "admin", "estimator", "viewer"]).parse(role);
  const [m] = await ctx.db.select().from(memberships).where(and(eq(memberships.orgId, ctx.orgId), eq(memberships.userId, userId)));
  if (!m) throw new AppError("Üye bulunamadı.", "not_found");
  if ((m.role === "owner" || next === "owner") && ctx.role !== "owner") throw new AppError("Sahip rolünü yalnızca firma sahibi değiştirebilir.", "forbidden");
  if (m.role === "owner" && next !== "owner" && (await ownerCount(ctx)) <= 1) throw new AppError("Firmada en az bir sahip kalmalı.");
  await ctx.db.update(memberships).set({ role: next }).where(and(eq(memberships.orgId, ctx.orgId), eq(memberships.userId, userId)));
  await audit(ctx, "team.role", `${userId} -> ${next}`);
}

export async function removeMember(ctx: Ctx, userId: string) {
  need(ctx, "team");
  const [m] = await ctx.db.select().from(memberships).where(and(eq(memberships.orgId, ctx.orgId), eq(memberships.userId, userId)));
  if (!m) throw new AppError("Üye bulunamadı.", "not_found");
  if (m.role === "owner" && (ctx.role !== "owner" || (await ownerCount(ctx)) <= 1)) throw new AppError("Firmanın son sahibi çıkarılamaz.", "forbidden");
  await ctx.db.delete(memberships).where(and(eq(memberships.orgId, ctx.orgId), eq(memberships.userId, userId)));
  await ctx.db.update(sessions).set({ orgId: null }).where(and(eq(sessions.userId, userId), eq(sessions.orgId, ctx.orgId)));
  await audit(ctx, "team.remove", userId);
}
