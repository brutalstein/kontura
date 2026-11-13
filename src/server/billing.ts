import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "./db";
import { AppError, type Ctx, type PlanId, audit, loadOrg, need } from "./core";
import { appUrl } from "./mail";
import { billingEvents, orgs } from "./schema";

/**
 * iyzico Subscription integration (https://docs.iyzico.com/en/products/subscription).
 * Card data never touches this server: the customer pays on iyzico's hosted checkout form.
 */
type PaidPlan = Exclude<PlanId, "trial">;
const PLAN_ENV: Record<PaidPlan, string> = { starter: "IYZICO_PLAN_STARTER", workshop: "IYZICO_PLAN_WORKSHOP", pro: "IYZICO_PLAN_PRO" };

export type BillingMode = "iyzico" | "test" | "off";
export function billingMode(): BillingMode {
  if (process.env.IYZICO_API_KEY && process.env.IYZICO_SECRET_KEY) return "iyzico";
  // the simulator must never be reachable in production, whatever the flags say
  if (process.env.BILLING_TEST_MODE === "true" && process.env.NODE_ENV !== "production") return "test";
  return "off";
}

const planRef = (plan: PaidPlan) => {
  const ref = process.env[PLAN_ENV[plan]];
  if (!ref) throw new AppError("Bu plan için ödeme planı tanımlı değil. Lütfen destek ile iletişime geçin.");
  return ref;
};
const planOfRef = (ref: string | undefined): PaidPlan | null =>
  (Object.keys(PLAN_ENV) as PaidPlan[]).find((p) => ref && process.env[PLAN_ENV[p]] === ref) ?? null;

/** IYZWSv2 header: base64("apiKey:..&randomKey:..&signature:hex(HMAC_SHA256(randomKey + path + body, secret))"). */
export function iyzicoAuthHeader(apiKey: string, secret: string, randomKey: string, path: string, body: string) {
  const signature = createHmac("sha256", secret).update(randomKey + path + body).digest("hex");
  return "IYZWSv2 " + Buffer.from(`apiKey:${apiKey}&randomKey:${randomKey}&signature:${signature}`).toString("base64");
}

async function iyzico<T>(method: "GET" | "POST", path: string, payload?: unknown): Promise<T> {
  const apiKey = process.env.IYZICO_API_KEY, secret = process.env.IYZICO_SECRET_KEY;
  if (!apiKey || !secret) throw new AppError("Ödeme altyapısı yapılandırılmamış.");
  const base = process.env.IYZICO_BASE_URL ?? "https://sandbox-api.iyzipay.com";
  const body = payload === undefined ? "" : JSON.stringify(payload);
  const randomKey = `${Date.now()}${Math.floor(Math.random() * 1e9)}`;
  const res = await fetch(base + path, {
    method,
    headers: { Authorization: iyzicoAuthHeader(apiKey, secret, randomKey, path, body), "x-iyzi-rnd": randomKey, "Content-Type": "application/json", Accept: "application/json" },
    body: method === "POST" ? body : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => null)) as (T & { status?: string; errorMessage?: string }) | null;
  if (!res.ok || !json || json.status !== "success") {
    console.error(`[iyzico] ${method} ${path} failed: http=${res.status} message=${json?.errorMessage ?? "-"}`);
    throw new AppError(json?.errorMessage ? `Ödeme sağlayıcı hatası: ${json.errorMessage}` : "Ödeme sağlayıcısına ulaşılamadı. Lütfen tekrar deneyin.");
  }
  return json;
}

const checkoutInput = z.object({
  plan: z.enum(["starter", "workshop", "pro"]),
  name: z.string().trim().min(2, "Ad girin.").max(60), surname: z.string().trim().min(2, "Soyad girin.").max(60),
  email: z.string().trim().email("Geçerli bir e-posta girin."),
  gsmNumber: z.string().trim().regex(/^\+?\d{10,14}$/, "Telefonu +905XXXXXXXXX biçiminde girin."),
  identityNumber: z.string().trim().regex(/^\d{10,11}$/, "TCKN veya VKN girin."),
  address: z.string().trim().min(5, "Fatura adresi girin.").max(300), city: z.string().trim().min(2, "Şehir girin.").max(60),
});

type Sub = { referenceCode: string; pricingPlanReferenceCode?: string; subscriptionStatus?: string; endDate?: number };

/** Starts a hosted checkout. Returns the provider's form snippet to render; identity and address are passed through, not stored. */
export async function startCheckout(ctx: Ctx, input: z.input<typeof checkoutInput>) {
  need(ctx, "billing");
  const d = checkoutInput.parse(input);
  const mode = billingMode();
  if (mode === "off") throw new AppError("Çevrimiçi ödeme henüz etkin değil. Plan satın almak için destek ile iletişime geçin.");
  if (mode === "test") return { mode, plan: d.plan } as const;
  const r = await iyzico<{ token: string; checkoutFormContent: string }>("POST", "/v2/subscription/checkoutform/initialize", {
    locale: "tr", conversationId: ctx.orgId, callbackUrl: `${appUrl()}/api/billing/iyzico/callback`,
    pricingPlanReferenceCode: planRef(d.plan), subscriptionInitialStatus: "ACTIVE",
    customer: {
      name: d.name, surname: d.surname, email: d.email, gsmNumber: d.gsmNumber, identityNumber: d.identityNumber,
      billingAddress: { address: d.address, contactName: `${d.name} ${d.surname}`, city: d.city, country: "Türkiye" },
    },
  });
  await audit(ctx, "billing.checkout.start", d.plan);
  return { mode, formContent: r.checkoutFormContent } as const;
}

const mapStatus = (s: string) => (s === "ACTIVE" ? "active" : s === "UNPAID" ? "past_due" : "canceled") as "active" | "past_due" | "canceled";

const subscriptionDetails = z.object({
  referenceCode: z.string().min(1), pricingPlanReferenceCode: z.string().min(1),
  subscriptionStatus: z.enum(["ACTIVE", "PENDING", "UNPAID", "UPGRADED", "CANCELED", "EXPIRED"]),
  orders: z.array(z.object({ orderStatus: z.enum(["WAITING", "SUCCESS", "FAILED"]), endPeriod: z.number().int().positive().max(8_640_000_000_000_000) })),
});

/** The overall subscription endDate can span many periods. Only SUCCESS orders establish paid access.
 * https://docs.iyzico.com/en/products/subscription/subscription-implementation/subscription-transactions
 */
async function retrieveSubscription(ref: string) {
  const r = await iyzico<{ data?: unknown }>("GET", `/v2/subscription/subscriptions/${encodeURIComponent(ref)}`);
  const parsed = subscriptionDetails.safeParse(r.data);
  if (!parsed.success || parsed.data.referenceCode !== ref) throw new Error("Invalid iyzico subscription details.");
  const plan = planOfRef(parsed.data.pricingPlanReferenceCode);
  if (!plan) throw new Error("Unknown iyzico pricing plan.");
  const end = Math.max(0, ...parsed.data.orders.filter((o) => o.orderStatus === "SUCCESS").map((o) => o.endPeriod));
  return { plan, subStatus: mapStatus(parsed.data.subscriptionStatus), subRenewsAt: end ? new Date(end) : null };
}

/** Called from the provider's callback with the checkout token. The org comes from the provider's own response, never from the request. */
export async function completeCheckout(db: DB, token: string) {
  const r = await iyzico<{ conversationId?: string; data?: Sub }>("GET", `/v2/subscription/checkoutform/${encodeURIComponent(token)}`);
  const plan = planOfRef(r.data?.pricingPlanReferenceCode);
  if (!r.conversationId || !r.data?.referenceCode || !plan) throw new AppError("Ödeme doğrulanamadı.");
  const orgId = r.conversationId, ref = r.data.referenceCode;
  return db.transaction(async (tx) => {
    const [org] = await tx.select().from(orgs).where(eq(orgs.id, orgId)).for("update");
    if (!org || (org.subRef && org.subRef !== ref && org.subStatus === "active")) throw new AppError("Ödeme doğrulanamadı.");
    const state = await retrieveSubscription(ref);
    if (org.subRef === ref && org.subStatus === "canceled") state.subStatus = "canceled";
    await tx.update(orgs).set({ ...state, subRef: ref }).where(eq(orgs.id, orgId));
    await audit({ db: tx as unknown as DB, orgId }, "billing.subscribed", state.plan);
    return { orgId, plan: state.plan };
  });
}

export async function changePlan(ctx: Ctx, plan: PaidPlan) {
  need(ctx, "billing");
  const org = await loadOrg(ctx.db, ctx.orgId);
  if (!org.subRef || org.subStatus !== "active") throw new AppError("Plan değiştirmek için etkin bir abonelik gerekli.");
  if (billingMode() === "test" && org.subRef.startsWith("test_")) {
    await ctx.db.update(orgs).set({ plan }).where(eq(orgs.id, ctx.orgId));
  } else {
    const r = await iyzico<{ data?: Sub }>("POST", `/v2/subscription/subscriptions/${encodeURIComponent(org.subRef)}/upgrade`, {
      upgradePeriod: "NOW", newPricingPlanReferenceCode: planRef(plan), useTrial: false, resetRecurrenceCount: true,
    });
    await ctx.db.update(orgs).set({ plan, subRef: r.data?.referenceCode ?? org.subRef }).where(eq(orgs.id, ctx.orgId));
  }
  await audit(ctx, "billing.plan", plan);
}

/** Stops renewal. Access continues until the paid period ends (see entitlements). */
export async function cancelSubscription(ctx: Ctx) {
  need(ctx, "billing");
  const org = await loadOrg(ctx.db, ctx.orgId);
  if (!org.subRef || org.subStatus === "canceled") throw new AppError("İptal edilecek etkin bir abonelik yok.");
  if (!(billingMode() === "test" && org.subRef.startsWith("test_"))) {
    await iyzico("POST", `/v2/subscription/subscriptions/${encodeURIComponent(org.subRef)}/cancel`, { subscriptionReferenceCode: org.subRef });
  }
  await ctx.db.update(orgs).set({ subStatus: "canceled" }).where(eq(orgs.id, ctx.orgId));
  await audit(ctx, "billing.cancel");
}

/** Development/staging only: activates a plan without charging anything. Refuses to run unless test mode is on. */
export async function activateTestSubscription(ctx: Ctx, plan: PaidPlan) {
  need(ctx, "billing");
  if (billingMode() !== "test") throw new AppError("Test ödeme modu kapalı.", "forbidden");
  await ctx.db.update(orgs).set({ plan, subStatus: "active", subRef: `test_${Date.now()}`, subRenewsAt: new Date(Date.now() + 30 * 86_400_000) }).where(eq(orgs.id, ctx.orgId));
  await audit(ctx, "billing.test_activate", plan);
}

const webhookBody = z.object({
  iyziEventType: z.string(), iyziReferenceCode: z.string().min(1),
  subscriptionReferenceCode: z.string().min(1), orderReferenceCode: z.string(), customerReferenceCode: z.string(),
});

/** Signature per iyzico's "subscription format": hex(HMAC_SHA256(secret, merchantId + secret + eventType + subscriptionRef + orderRef + customerRef)). */
export function webhookSignature(merchantId: string, secret: string, b: z.infer<typeof webhookBody>) {
  return createHmac("sha256", secret).update(merchantId + secret + b.iyziEventType + b.subscriptionReferenceCode + b.orderReferenceCode + b.customerReferenceCode).digest("hex");
}

/** Handles subscription.order.success / failure. Unsigned or badly signed calls are rejected; redelivered events are ignored. */
export async function handleWebhook(db: DB, signature: string | null, raw: unknown): Promise<"ok" | "duplicate" | "ignored"> {
  const secret = process.env.IYZICO_SECRET_KEY, merchantId = process.env.IYZICO_MERCHANT_ID;
  if (!secret || !merchantId) throw new AppError("Webhook yapılandırılmamış.", "forbidden");
  const body = webhookBody.parse(raw);
  const expected = Buffer.from(webhookSignature(merchantId, secret, body));
  const given = Buffer.from(String(signature ?? "").toLowerCase());
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw new AppError("Geçersiz imza.", "forbidden");

  if (!["subscription.order.success", "subscription.order.failure"].includes(body.iyziEventType)) return "ignored";
  return db.transaction(async (tx) => {
    // Lock before retrieving the provider snapshot so concurrent/late notifications cannot overwrite newer state.
    const [org] = await tx.select().from(orgs).where(eq(orgs.subRef, body.subscriptionReferenceCode)).for("update");
    if (!org) return "ignored"; // do not consume an event that arrived before checkout linked the subscription
    const fresh = await tx.insert(billingEvents).values({ id: body.iyziReferenceCode, orgId: org.id, type: body.iyziEventType, payload: body }).onConflictDoNothing().returning({ id: billingEvents.id });
    if (!fresh.length) return "duplicate";
    const state = await retrieveSubscription(body.subscriptionReferenceCode);
    if (org.subStatus === "canceled") state.subStatus = "canceled";
    await tx.update(orgs).set(state).where(eq(orgs.id, org.id));
    await audit({ db: tx as unknown as DB, orgId: org.id }, "billing.webhook", body.iyziEventType);
    return "ok";
  });
}
