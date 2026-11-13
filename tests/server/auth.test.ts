import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  acceptInvite, changePassword, inviteMember, listMembers, login, logout, removeMember, requestPasswordReset, resetPassword, resolveSession,
  setMemberRole, signup, switchOrg, verifyEmail, verifyPassword, hashPassword,
} from "@/server/auth";
import { AppError, resetRateLimits } from "@/server/core";
import type { DB } from "@/server/db";
import { devOutbox } from "@/server/mail";
import { freshDb, makeOrg, member, setPlan } from "./helpers";

let db: DB;
beforeAll(async () => { db = await freshDb(); });
beforeEach(() => { resetRateLimits(); devOutbox.length = 0; });

const tokenOf = (url: string) => new URL(url).searchParams.get("t")!;

describe("accounts and sessions", () => {
  it("hashes passwords with a per-user salt and verifies them", async () => {
    const a = await hashPassword("s3cret-password"), b = await hashPassword("s3cret-password");
    expect(a).not.toBe(b);
    expect(await verifyPassword("s3cret-password", a)).toBe(true);
    expect(await verifyPassword("wrong", a)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });

  it("signup creates user, org, owner membership, a trial and a working session", async () => {
    const r = await makeOrg(db, { onboarded: false });
    const s = await resolveSession(db, r.session);
    expect(s?.user.email).toBe(r.user.email);
    expect(s?.role).toBe("owner");
    expect(s?.org?.plan).toBe("trial");
    expect(s?.org?.trialEndsAt.getTime()).toBeGreaterThan(Date.now() + 13 * 86_400_000);
    expect(await resolveSession(db, "not-a-session")).toBeNull();
  });

  it("validates signup input and refuses duplicate e-mails", async () => {
    await expect(signup(db, { name: "A B", company: "X Ltd", email: "bad", password: "long-enough-pw" })).rejects.toThrow();
    await expect(signup(db, { name: "A B", company: "X Ltd", email: "a@b.co", password: "short" })).rejects.toThrow();
    const r = await makeOrg(db, { onboarded: false });
    await expect(signup(db, { name: "A B", company: "X Ltd", email: r.user.email.toUpperCase(), password: "long-enough-pw" })).rejects.toThrow(AppError);
  });

  it("login accepts the right password, rejects others with one generic message, and rate-limits", async () => {
    const r = await makeOrg(db, { onboarded: false });
    const ok = await login(db, { email: r.user.email, password: "correct-horse-battery" });
    expect((await resolveSession(db, ok.session))?.user.id).toBe(r.user.id);
    const wrongPw = await login(db, { email: r.user.email, password: "nope" }).catch((e) => e.message);
    const wrongUser = await login(db, { email: "nobody@example.com", password: "nope" }).catch((e) => e.message);
    expect(wrongPw).toBe(wrongUser);
    for (let i = 0; i < 8; i++) await login(db, { email: r.user.email, password: "nope" }).catch(() => {});
    await expect(login(db, { email: r.user.email, password: "correct-horse-battery" })).rejects.toMatchObject({ code: "rate" });
  });

  it("logout invalidates the session", async () => {
    const r = await makeOrg(db, { onboarded: false });
    await logout(db, r.session);
    expect(await resolveSession(db, r.session)).toBeNull();
  });

  it("e-mail verification tokens work exactly once", async () => {
    const r = await makeOrg(db, { onboarded: false });
    expect(devOutbox.at(-1)?.to).toBe(r.user.email);
    await verifyEmail(db, tokenOf(r.verifyUrl));
    expect((await resolveSession(db, r.session))?.user.emailVerifiedAt).toBeInstanceOf(Date);
    await expect(verifyEmail(db, tokenOf(r.verifyUrl))).rejects.toThrow(AppError);
    await expect(verifyEmail(db, "forged")).rejects.toThrow(AppError);
  });

  it("password reset changes the password, signs out every session and cannot be replayed", async () => {
    const r = await makeOrg(db, { onboarded: false });
    expect(await requestPasswordReset(db, "nobody@example.com")).toBeNull();
    const url = (await requestPasswordReset(db, r.user.email))!;
    await expect(resetPassword(db, tokenOf(url), "short")).rejects.toThrow();
    await resetPassword(db, tokenOf(url), "a-brand-new-password");
    expect(await resolveSession(db, r.session)).toBeNull();
    await expect(login(db, { email: r.user.email, password: "correct-horse-battery" })).rejects.toThrow(AppError);
    await login(db, { email: r.user.email, password: "a-brand-new-password" });
    await expect(resetPassword(db, tokenOf(url), "another-new-password")).rejects.toThrow(AppError);
  });

  it("changePassword requires the current password", async () => {
    const r = await makeOrg(db, { onboarded: false });
    await expect(changePassword(db, r.user.id, "wrong", "new-password-123")).rejects.toThrow(AppError);
    await changePassword(db, r.user.id, "correct-horse-battery", "new-password-123");
    await login(db, { email: r.user.email, password: "new-password-123" });
  });
});

describe("team", () => {
  it("invite: new person creates an account and joins with the invited role; token is single-use", async () => {
    const { ctx, org } = await makeOrg(db, { onboarded: false });
    const url = await inviteMember(ctx, { email: "new.person@example.com", role: "estimator" });
    const joined = await acceptInvite(db, tokenOf(url), { name: "Yeni Kişi", password: "invited-password-1" });
    const s = await resolveSession(db, joined.session);
    expect(s?.org?.id).toBe(org.id);
    expect(s?.role).toBe("estimator");
    await expect(acceptInvite(db, tokenOf(url), { name: "Yeni Kişi", password: "invited-password-1" })).rejects.toThrow(AppError);
    expect((await listMembers(ctx)).map((m) => m.email)).toContain("new.person@example.com");
  });

  it("invite: an existing account must prove its password and can then switch between orgs", async () => {
    const a = await makeOrg(db, { onboarded: false }), b = await makeOrg(db, { onboarded: false });
    const url = await inviteMember(a.ctx, { email: b.user.email, role: "viewer" });
    await expect(acceptInvite(db, tokenOf(url), { password: "not-their-password" })).rejects.toThrow(AppError);
    await acceptInvite(db, tokenOf(url), { password: "correct-horse-battery" });
    await switchOrg(db, b.session, b.user.id, a.org.id);
    expect((await resolveSession(db, b.session))?.role).toBe("viewer");
    const c = await makeOrg(db, { onboarded: false });
    await expect(switchOrg(db, b.session, b.user.id, c.org.id)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("enforces the plan's seat limit, counting pending invites", async () => {
    const { ctx, org } = await makeOrg(db, { onboarded: false });
    await setPlan(db, org.id, { plan: "starter", subStatus: "active", subRenewsAt: new Date(Date.now() + 86_400_000) });
    await expect(inviteMember(ctx, { email: "x@example.com", role: "viewer" })).rejects.toMatchObject({ code: "limit" });
    await setPlan(db, org.id, { plan: "workshop" });
    for (let i = 0; i < 4; i++) await inviteMember(ctx, { email: `seat${i}@example.com`, role: "viewer" });
    await expect(inviteMember(ctx, { email: "sixth@example.com", role: "viewer" })).rejects.toMatchObject({ code: "limit" });
  });

  it("role rules: only owners touch owners, the last owner cannot leave, removed members lose access", async () => {
    const { ctx, org, user } = await makeOrg(db, { onboarded: false });
    const admin = await member(db, org.id, "admin"), viewer = await member(db, org.id, "viewer");
    await expect(inviteMember(viewer, { email: "v@example.com", role: "viewer" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(setMemberRole(admin, user.id, "viewer")).rejects.toMatchObject({ code: "forbidden" });
    await expect(setMemberRole(admin, viewer.userId, "owner")).rejects.toMatchObject({ code: "forbidden" });
    await expect(setMemberRole(ctx, user.id, "admin")).rejects.toThrow(AppError);
    await expect(removeMember(ctx, user.id)).rejects.toThrow(AppError);
    await setMemberRole(admin, viewer.userId, "estimator");
    await removeMember(admin, viewer.userId);
    expect((await listMembers(ctx)).map((m) => m.userId)).not.toContain(viewer.userId);
  });
});
