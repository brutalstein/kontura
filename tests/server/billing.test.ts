import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { activateTestSubscription, billingMode, cancelSubscription, changePlan, completeCheckout, handleWebhook, iyzicoAuthHeader, startCheckout, webhookSignature } from "@/server/billing";
import { AppError, entitlements, loadOrg } from "@/server/core";
import type { DB } from "@/server/db";
import { deleteOrg, exportOrgData } from "@/server/privacy";
import { createQuote, listQuotes } from "@/server/quotes";
import { resolveSession } from "@/server/auth";
import { billingEvents, users } from "@/server/schema";
import { freshDb, makeOrg, member, setPlan } from "./helpers";

let db: DB;
beforeAll(async () => { db = await freshDb(); });

const ENV = { IYZICO_API_KEY: "API_KEY", IYZICO_SECRET_KEY: "sandbox-secret", IYZICO_MERCHANT_ID: "m-1", IYZICO_PLAN_STARTER: "plan-s", IYZICO_PLAN_WORKSHOP: "plan-w", IYZICO_PLAN_PRO: "plan-p" };
const buyer = { name: "Ayşe", surname: "Yılmaz", email: "ayse@example.com", gsmNumber: "+905321112233", identityNumber: "11111111111", address: "OSB 1. Cadde No 5", city: "Bursa" };
const paidEnd = Date.UTC(new Date().getUTCFullYear() + 1, 1, 28);
const subscription = (ref: string, status = "ACTIVE", end = paidEnd, plan = "plan-s") => ({
  status: "success", data: { referenceCode: ref, pricingPlanReferenceCode: plan, subscriptionStatus: status,
    endDate: paidEnd + 365 * 86_400_000, orders: [
      { referenceCode: "paid-order", orderStatus: "SUCCESS", startPeriod: end - 28 * 86_400_000, endPeriod: end },
      { referenceCode: "future-order", orderStatus: "WAITING", startPeriod: end, endPeriod: end + 31 * 86_400_000 },
    ] },
});

function mockIyzico(handler: (url: string, init: RequestInit) => unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(handler(url, init)), { status: 200 });
  });
  return calls;
}

beforeEach(() => { for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("iyzico subscription billing", () => {
  it("signs requests the documented way", () => {
    const header = iyzicoAuthHeader("key", "secret", "123", "/v2/x", '{"a":1}');
    const decoded = Buffer.from(header.replace("IYZWSv2 ", ""), "base64").toString();
    expect(decoded).toBe(`apiKey:key&randomKey:123&signature:${createHmac("sha256", "secret").update('123/v2/x{"a":1}').digest("hex")}`);
  });

  it("checkout: initialises a hosted form, then activates the plan named by the provider — not by the caller", async () => {
    const { ctx, org } = await makeOrg(db, { onboarded: false });
    const calls = mockIyzico((url) => url.includes("/subscriptions/") ? subscription("sub-1", "ACTIVE", paidEnd, "plan-w") : url.endsWith("/initialize")
      ? { status: "success", token: "tok", checkoutFormContent: "<script>form</script>" }
      : { status: "success", conversationId: org.id, data: { referenceCode: "sub-1", pricingPlanReferenceCode: "plan-w", subscriptionStatus: "ACTIVE", endDate: Date.now() + 30 * 86_400_000 } });
    const started = await startCheckout(ctx, { plan: "workshop", ...buyer });
    expect(started).toMatchObject({ mode: "iyzico", formContent: "<script>form</script>" });
    const sent = JSON.parse(String(calls[0].init.body));
    expect(sent).toMatchObject({ pricingPlanReferenceCode: "plan-w", conversationId: org.id, subscriptionInitialStatus: "ACTIVE" });
    expect(String((calls[0].init.headers as Record<string, string>).Authorization)).toMatch(/^IYZWSv2 /);

    expect(await completeCheckout(db, "tok")).toEqual({ orgId: org.id, plan: "workshop" });
    const after = await loadOrg(db, org.id);
    expect(after).toMatchObject({ plan: "workshop", subStatus: "active", subRef: "sub-1" });
    expect(after.subRenewsAt?.getTime()).toBe(paidEnd); // the subscription's overall endDate is not the paid period
    expect(entitlements(after)).toMatchObject({ active: true, seats: 5, portal: true });
    await setPlan(db, org.id, { subStatus: "canceled" });
    await completeCheckout(db, "tok");
    expect((await loadOrg(db, org.id)).subStatus).toBe("canceled");
  });

  it("refuses checkout results it cannot tie to a known plan and org, and provider failures", async () => {
    mockIyzico(() => ({ status: "success", conversationId: "no-such-org", data: { referenceCode: "s", pricingPlanReferenceCode: "plan-w" } }));
    await expect(completeCheckout(db, "t")).rejects.toThrow(AppError);
    mockIyzico(() => ({ status: "success", conversationId: "x", data: { referenceCode: "s", pricingPlanReferenceCode: "unknown-plan" } }));
    await expect(completeCheckout(db, "t")).rejects.toThrow(AppError);
    mockIyzico(() => ({ status: "failure", errorMessage: "Kart reddedildi" }));
    await expect(completeCheckout(db, "t")).rejects.toThrow(/Kart reddedildi/);
  });

  it("only the owner can buy, change or cancel; input is validated", async () => {
    const { ctx, org } = await makeOrg(db, { onboarded: false });
    const admin = await member(db, org.id, "admin");
    await expect(startCheckout(admin, { plan: "starter", ...buyer })).rejects.toMatchObject({ code: "forbidden" });
    await expect(cancelSubscription(admin)).rejects.toMatchObject({ code: "forbidden" });
    await expect(startCheckout(ctx, { plan: "starter", ...buyer, identityNumber: "abc" })).rejects.toThrow();
    await expect(startCheckout(ctx, { plan: "enterprise" as "pro", ...buyer })).rejects.toThrow();
  });

  it("webhooks: verified, idempotent, and they move the subscription state", async () => {
    const { org } = await makeOrg(db, { onboarded: false });
    await setPlan(db, org.id, { plan: "starter", subStatus: "active", subRef: "sub-hook" });
    const ev = (type: string, ref: string) => ({ iyziEventType: type, iyziReferenceCode: ref, subscriptionReferenceCode: "sub-hook", orderReferenceCode: "o1", customerReferenceCode: "c1" });
    const sign = (b: ReturnType<typeof ev>) => webhookSignature("m-1", "sandbox-secret", b);
    let remoteStatus = "UNPAID";
    mockIyzico(() => subscription("sub-hook", remoteStatus));

    const fail = ev("subscription.order.failure", "e1");
    await expect(handleWebhook(db, null, fail)).rejects.toMatchObject({ code: "forbidden" });
    await expect(handleWebhook(db, "00".repeat(32), fail)).rejects.toMatchObject({ code: "forbidden" });
    await expect(handleWebhook(db, sign(fail), { ...fail, subscriptionReferenceCode: "sub-other" })).rejects.toMatchObject({ code: "forbidden" });
    expect((await loadOrg(db, org.id)).subStatus).toBe("active");

    expect(await handleWebhook(db, sign(fail), fail)).toBe("ok");
    expect((await loadOrg(db, org.id)).subStatus).toBe("past_due");
    expect(await handleWebhook(db, sign(fail), fail)).toBe("duplicate");

    const ok = ev("subscription.order.success", "e2");
    remoteStatus = "ACTIVE";
    expect(await handleWebhook(db, sign(ok).toUpperCase(), ok)).toBe("ok");
    const renewed = await loadOrg(db, org.id);
    expect(renewed.subStatus).toBe("active");
    expect(renewed.subRenewsAt!.getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);

    const stranger = { ...ev("subscription.order.success", "e3"), subscriptionReferenceCode: "sub-unknown" };
    expect(await handleWebhook(db, sign(stranger), stranger)).toBe("ignored");
  });

  it("reconciles repeated orders and late failures to the provider's current paid period", async () => {
    const { org } = await makeOrg(db, { onboarded: false });
    await setPlan(db, org.id, { plan: "starter", subStatus: "active", subRef: "sub-order", subRenewsAt: new Date(paidEnd) });
    mockIyzico(() => subscription("sub-order"));
    const event = { iyziEventType: "subscription.order.success", iyziReferenceCode: "order-a", subscriptionReferenceCode: "sub-order", orderReferenceCode: "same-order", customerReferenceCode: "c" };
    const send = (body: typeof event) => handleWebhook(db, webhookSignature("m-1", "sandbox-secret", body), body);
    const results = await Promise.all([send(event), send({ ...event, iyziReferenceCode: "order-b" })]);
    expect(results).toEqual(["ok", "ok"]);
    expect((await loadOrg(db, org.id)).subRenewsAt?.getTime()).toBe(paidEnd);
    await send({ ...event, iyziReferenceCode: "late-failure", iyziEventType: "subscription.order.failure" });
    expect(await loadOrg(db, org.id)).toMatchObject({ subStatus: "active", subRenewsAt: new Date(paidEnd) });
    await setPlan(db, org.id, { subStatus: "canceled" });
    await send({ ...event, iyziReferenceCode: "late-success" });
    expect((await loadOrg(db, org.id)).subStatus).toBe("canceled");
  });

  it("does not consume a webhook on provider outage; the same event can be retried", async () => {
    const { org } = await makeOrg(db, { onboarded: false });
    await setPlan(db, org.id, { plan: "starter", subStatus: "past_due", subRef: "sub-retry" });
    const event = { iyziEventType: "subscription.order.success", iyziReferenceCode: "retry-event", subscriptionReferenceCode: "sub-retry", orderReferenceCode: "o", customerReferenceCode: "c" };
    const signature = webhookSignature("m-1", "sandbox-secret", event);
    mockIyzico(() => ({ status: "failure", errorMessage: "temporary outage" }));
    await expect(handleWebhook(db, signature, event)).rejects.toThrow();
    expect(await db.select().from(billingEvents).where(eq(billingEvents.id, event.iyziReferenceCode))).toHaveLength(0);
    expect((await loadOrg(db, org.id)).subStatus).toBe("past_due");
    mockIyzico(() => subscription("sub-retry"));
    expect(await handleWebhook(db, signature, event)).toBe("ok");
    expect(await handleWebhook(db, signature, event)).toBe("duplicate");
  });

  it("rejects an inconsistent provider snapshot without consuming the notification", async () => {
    const { org } = await makeOrg(db, { onboarded: false });
    await setPlan(db, org.id, { plan: "starter", subStatus: "past_due", subRef: "sub-validate" });
    const event = { iyziEventType: "subscription.order.success", iyziReferenceCode: "validate-event", subscriptionReferenceCode: "sub-validate", orderReferenceCode: "o", customerReferenceCode: "c" };
    const signature = webhookSignature("m-1", "sandbox-secret", event);
    for (const response of [subscription("different-sub"), subscription("sub-validate", "ACTIVE", paidEnd, "unknown-plan"), { status: "success", data: { referenceCode: "sub-validate" } }]) {
      mockIyzico(() => response);
      await expect(handleWebhook(db, signature, event)).rejects.toThrow();
      expect(await db.select().from(billingEvents).where(eq(billingEvents.id, event.iyziReferenceCode))).toHaveLength(0);
      expect((await loadOrg(db, org.id)).subStatus).toBe("past_due");
    }
  });

  it("rolls back state and event consumption when the audit write fails", async () => {
    const { org } = await makeOrg(db, { onboarded: false });
    await setPlan(db, org.id, { plan: "starter", subStatus: "past_due", subRef: "sub-atomic" });
    mockIyzico(() => subscription("sub-atomic"));
    const event = { iyziEventType: "subscription.order.success", iyziReferenceCode: "atomic-event", subscriptionReferenceCode: "sub-atomic", orderReferenceCode: "o", customerReferenceCode: "c" };
    const signature = webhookSignature("m-1", "sandbox-secret", event);
    await db.execute(sql`CREATE FUNCTION billing_audit_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'billing.webhook' THEN RAISE EXCEPTION 'simulated audit outage'; END IF; RETURN NEW; END; $$`);
    await db.execute(sql`CREATE TRIGGER billing_audit_fault BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION billing_audit_fault()`);
    try {
      await expect(handleWebhook(db, signature, event)).rejects.toThrow();
      expect(await db.select().from(billingEvents).where(eq(billingEvents.id, event.iyziReferenceCode))).toHaveLength(0);
      expect((await loadOrg(db, org.id)).subStatus).toBe("past_due");
    } finally {
      await db.execute(sql`DROP TRIGGER billing_audit_fault ON audit_log`);
      await db.execute(sql`DROP FUNCTION billing_audit_fault()`);
    }
    expect(await handleWebhook(db, signature, event)).toBe("ok");
  });

  it("does not discard an event that arrives before the checkout callback links its subscription", async () => {
    const { org } = await makeOrg(db, { onboarded: false });
    const event = { iyziEventType: "subscription.order.success", iyziReferenceCode: "early-event", subscriptionReferenceCode: "sub-early", orderReferenceCode: "o", customerReferenceCode: "c" };
    const signature = webhookSignature("m-1", "sandbox-secret", event);
    expect(await handleWebhook(db, signature, event)).toBe("ignored");
    await setPlan(db, org.id, { plan: "starter", subStatus: "active", subRef: "sub-early" });
    mockIyzico(() => subscription("sub-early"));
    expect(await handleWebhook(db, signature, event)).toBe("ok");
    expect((await loadOrg(db, org.id)).subRenewsAt?.getTime()).toBe(paidEnd);
  });

  it("never grants paid-plan access beyond the verified paid period, including past-due accounts", async () => {
    const { org } = await makeOrg(db, { onboarded: false });
    const now = new Date(paidEnd);
    for (const subStatus of ["active", "past_due", "canceled"] as const) {
      const paid = { ...org, plan: "starter" as const, subStatus, subRenewsAt: new Date(paidEnd) };
      expect(entitlements(paid, new Date(paidEnd - 1)).active).toBe(true);
      expect(entitlements(paid, now).active).toBe(false);
      expect(entitlements({ ...paid, subRenewsAt: null }, now).active).toBe(false);
    }
  });

  it("cancel stops renewal but keeps access until the paid period ends; plan changes go through the provider", async () => {
    const { ctx, org } = await makeOrg(db, { onboarded: false });
    await setPlan(db, org.id, { plan: "starter", subStatus: "active", subRef: "sub-c", subRenewsAt: new Date(Date.now() + 10 * 86_400_000) });
    const calls = mockIyzico((url) => (url.includes("/upgrade") ? { status: "success", data: { referenceCode: "sub-c2" } } : { status: "success" }));
    await changePlan(ctx, "pro");
    expect(await loadOrg(db, org.id)).toMatchObject({ plan: "pro", subRef: "sub-c2" });
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({ newPricingPlanReferenceCode: "plan-p", upgradePeriod: "NOW" });
    await cancelSubscription(ctx);
    expect(calls[1].url).toContain("/v2/subscription/subscriptions/sub-c2/cancel");
    const o = await loadOrg(db, org.id);
    expect(o.subStatus).toBe("canceled");
    expect(entitlements(o).active).toBe(true);
    expect(entitlements(o, new Date(Date.now() + 11 * 86_400_000)).active).toBe(false);
    await expect(cancelSubscription(ctx)).rejects.toThrow(AppError);
  });

  it("the payment simulator exists only in non-production test mode", async () => {
    const { ctx, org } = await makeOrg(db, { onboarded: false });
    vi.stubEnv("IYZICO_API_KEY", ""); vi.stubEnv("IYZICO_SECRET_KEY", "");
    expect(billingMode()).toBe("off");
    await expect(startCheckout(ctx, { plan: "starter", ...buyer })).rejects.toThrow(AppError);
    await expect(activateTestSubscription(ctx, "starter")).rejects.toMatchObject({ code: "forbidden" });
    vi.stubEnv("BILLING_TEST_MODE", "true");
    expect(billingMode()).toBe("test");
    await activateTestSubscription(ctx, "workshop");
    expect(await loadOrg(db, org.id)).toMatchObject({ plan: "workshop", subStatus: "active" });
    vi.stubEnv("NODE_ENV", "production");
    expect(billingMode()).toBe("off");
    await expect(activateTestSubscription(ctx, "pro")).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("data export and deletion", () => {
  it("exports the org's own data only, and deletion removes it completely", async () => {
    const a = await makeOrg(db), b = await makeOrg(db);
    await createQuote(a.ctx); await createQuote(b.ctx);
    const admin = await member(db, a.org.id, "admin");
    await expect(exportOrgData(admin)).rejects.toMatchObject({ code: "forbidden" });
    const dump = await exportOrgData(a.ctx);
    expect(dump.quotes).toHaveLength(1);
    expect(dump.quotes[0].orgId).toBe(a.org.id);
    expect(JSON.stringify(dump)).not.toContain(b.org.id);
    expect(JSON.stringify(dump)).not.toContain("passwordHash");

    await expect(deleteOrg(a.ctx, "yanlış ad")).rejects.toThrow(AppError);
    await deleteOrg(a.ctx, a.org.name);
    expect(await resolveSession(db, a.session)).toBeNull();
    expect(await db.select().from(users).where(eq(users.id, a.user.id))).toEqual([]);
    expect(await listQuotes(b.ctx)).toHaveLength(1);
  });
});
