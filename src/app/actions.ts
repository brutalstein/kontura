"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import * as auth from "@/server/auth";
import * as billing from "@/server/billing";
import * as catalog from "@/server/catalog";
import { AppError, rateLimit } from "@/server/core";
import { getDb } from "@/server/db";
import { mailConfigured, mailDisabled } from "@/server/mail";
import { deleteOrg } from "@/server/privacy";
import * as quotes from "@/server/quotes";
import * as parts from "@/server/parts";
import { type State, attempt, clearSessionCookie, clientIp, getSession, panelAction, setSessionCookie } from "@/server/session";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const orNull = (fd: FormData, k: string) => s(fd, k).trim() || null;
/** Numeric form field. Turkish keyboards and habits give a decimal comma ("7,5"); the server parses a dot. */
const dec = (v: FormDataEntryValue | string | null) => String(v ?? "").trim().replace(",", ".");
const decOrNull = (fd: FormData, k: string) => dec(fd.get(k)) || null;
const on = (fd: FormData, k: string) => fd.get(k) === "on";
/** Local/staging only: without SMTP the link cannot be e-mailed, so it is shown on screen instead. Never in production. */
const devLink = (url: string | null) => (url && !mailConfigured() && process.env.NODE_ENV !== "production" ? url : undefined);

// ---- Account ----------------------------------------------------------------

export async function signupAction(_: State, fd: FormData): Promise<State> {
  return attempt(async () => {
    rateLimit(`signup:${await clientIp()}`, 10, 60 * 60_000);
    if (!on(fd, "terms")) throw new AppError("Devam etmek için kullanım koşullarını ve aydınlatma metnini onaylayın.");
    const r = await auth.signup(await getDb(), { name: s(fd, "name"), company: s(fd, "company"), email: s(fd, "email"), password: s(fd, "password") });
    await setSessionCookie(r.session);
    redirect("/panel/kurulum");
  });
}

export async function loginAction(_: State, fd: FormData): Promise<State> {
  return attempt(async () => {
    const r = await auth.login(await getDb(), { email: s(fd, "email"), password: s(fd, "password") }, await clientIp());
    await setSessionCookie(r.session);
    redirect("/panel");
  });
}

export async function logoutAction() {
  const { db, raw } = await getSession();
  if (raw) await auth.logout(db, raw);
  await clearSessionCookie();
  redirect("/giris");
}

export async function forgotAction(_: State, fd: FormData): Promise<State> {
  return attempt(async () => {
    const url = await auth.requestPasswordReset(await getDb(), s(fd, "email"), await clientIp());
    // the reset link is a bearer credential: without mail it is never shown on screen, only the operator can issue it (pnpm admin <email> --reset-link)
    if (mailDisabled()) return { error: "Bu kurulumda e-posta gönderimi kapalı olduğu için sıfırlama bağlantısı gönderilemiyor. Hesabınızı açan yöneticiyle iletişime geçin." };
    return { ok: "Bu e-posta kayıtlıysa sıfırlama bağlantısı gönderildi. Gelen kutunuzu kontrol edin.", url: devLink(url) };
  });
}

export async function resetAction(token: string, _: State, fd: FormData): Promise<State> {
  return attempt(async () => {
    await auth.resetPassword(await getDb(), token, s(fd, "password"));
    redirect("/giris?durum=sifre");
  });
}

export async function acceptInviteAction(token: string, _: State, fd: FormData): Promise<State> {
  return attempt(async () => {
    const r = await auth.acceptInvite(await getDb(), token, { name: s(fd, "name") || undefined, password: s(fd, "password") });
    await setSessionCookie(r.session);
    redirect("/panel");
  });
}

/** Verification happens on a button press, not on page load, so mail scanners that open links cannot use the token up. */
export async function verifyEmailAction(token: string, _: State, _fd: FormData): Promise<State> {
  return attempt(async () => {
    await auth.verifyEmail(await getDb(), token);
    return { ok: "E-posta adresiniz doğrulandı." };
  });
}

export async function resendVerifyAction(_: State, _fd: FormData): Promise<State> {
  return attempt(async () => {
    const { db, info } = await getSession();
    if (!info) redirect("/giris");
    rateLimit(`verify:${info.user.id}`, 3, 60 * 60_000);
    const url = await auth.sendVerification(db, info.user.id, info.user.email);
    return { ok: "Doğrulama e-postası gönderildi.", url: devLink(url) };
  });
}

export async function switchOrgAction(fd: FormData) {
  const { db, raw, info } = await getSession();
  if (!info || !raw) redirect("/giris");
  await auth.switchOrg(db, raw, info.user.id, s(fd, "orgId"));
  redirect("/panel");
}

export async function changePasswordAction(_: State, fd: FormData): Promise<State> {
  return panelAction(async ({ ctx }) => {
    await auth.changePassword(ctx.db, ctx.userId, s(fd, "current"), s(fd, "next"));
    return { ok: "Şifreniz değiştirildi." };
  });
}

// ---- Onboarding and settings ------------------------------------------------

export async function onboardAction(_: State, fd: FormData): Promise<State> {
  return panelAction(async ({ ctx }) => {
    const materials = catalog.MATERIAL_PRESETS.filter((m) => on(fd, `use_${m.key}`)).map((m) => ({ key: m.key, pricePerKg: dec(fd.get(`price_${m.key}`)) as unknown as number }));
    await catalog.onboard(ctx, { preset: s(fd, "preset") as "3kw", machineName: s(fd, "machineName"), ratePerMin: dec(fd.get("ratePerMin")) as unknown as number, materials });
    redirect("/panel?kurulum=tamam");
  });
}

export async function saveCompanyAction(_: State, fd: FormData): Promise<State> {
  return panelAction(async ({ ctx }) => {
    await catalog.saveCompany(ctx, { name: s(fd, "name"), taxOffice: s(fd, "taxOffice"), taxNo: s(fd, "taxNo"), address: s(fd, "address"), phone: s(fd, "phone"), email: s(fd, "email") });
  });
}

export async function saveMachineAction(_: State, fd: FormData): Promise<State> {
  return panelAction(async ({ ctx }) => {
    await catalog.saveMachine(ctx, { id: s(fd, "id") || undefined, name: s(fd, "name"), kind: s(fd, "kind") as "laser", ratePerMin: dec(fd.get("ratePerMin")) as unknown as number });
  });
}
export async function deleteMachineAction(id: string, _: State, _fd: FormData): Promise<State> {
  return panelAction(async ({ ctx }) => { await catalog.deleteMachine(ctx, id); return { ok: "Makine silindi." }; });
}

export async function saveOperationAction(_: State, fd: FormData): Promise<State> {
  return panelAction(async ({ ctx }) => {
    await catalog.saveOperation(ctx, { id: s(fd, "id") || undefined, name: s(fd, "name"), unit: s(fd, "unit") as "adet", price: dec(fd.get("price")) as unknown as number, setupFee: (dec(fd.get("setupFee")) || "0") as unknown as number });
  });
}
export async function deleteOperationAction(id: string, _: State, _fd: FormData): Promise<State> {
  return panelAction(async ({ ctx }) => { await catalog.deleteOperation(ctx, id); return { ok: "İşlem silindi." }; });
}

export async function saveMaterialAction(_: State, fd: FormData): Promise<State> {
  return panelAction(async ({ ctx }) => {
    const n = (k: string) => dec(fd.get(k)) as unknown as number;
    await catalog.saveMaterial(ctx, { id: s(fd, "id") || undefined, name: s(fd, "name"), densityGcm3: n("densityGcm3"), pricePerKg: n("pricePerKg"), currency: s(fd, "currency") as "TRY", sheetW: n("sheetW"), sheetH: n("sheetH") });
  });
}
export async function deleteMaterialAction(id: string, _: State, _fd: FormData): Promise<State> {
  return panelAction(async ({ ctx }) => { await catalog.deleteMaterial(ctx, id); return { ok: "Malzeme silindi." }; });
}

export async function saveCutTableAction(machineId: string, materialId: string, _: State, fd: FormData): Promise<State> {
  return panelAction(async ({ ctx }) => {
    const [t, f, p] = ["thickness", "feedMmMin", "pierceSec"].map((k) => fd.getAll(k).map(dec));
    const rows = t.map((thickness, i) => ({ thickness, feedMmMin: f[i] ?? "", pierceSec: p[i] || "0" })).filter((r) => r.thickness.trim() || r.feedMmMin.trim());
    await catalog.saveCutTable(ctx, machineId, materialId, rows as never);
    return { ok: "Kesim tablosu kaydedildi." };
  });
}

export async function saveRulesAction(_: State, fd: FormData): Promise<State> {
  return panelAction(async ({ ctx }) => {
    const n = (k: string) => dec(fd.get(k)) as unknown as number;
    const mins = fd.getAll("minQty").map(dec), discs = fd.getAll("discountPct").map(dec);
    const qtyBreaks = mins.map((minQty, i) => ({ minQty, discountPct: discs[i] ?? "" })).filter((b) => b.minQty.trim() && b.discountPct.trim());
    await catalog.saveRules(ctx, {
      marginPct: n("marginPct"), setupFee: n("setupFee"), minOrder: n("minOrder"), vatPct: n("vatPct"), bendRate: n("bendRate"), bendSetup: n("bendSetup"),
      rapidSecPerPierce: n("rapidSecPerPierce"), sheetMargin: n("sheetMargin"), partGap: n("partGap"), remnantPolicy: s(fd, "remnantPolicy") as "used-length",
      qtyBreaks: qtyBreaks as never, validityDays: n("validityDays"), fx: { USD: n("fxUSD") || 0, EUR: n("fxEUR") || 0 },
    });
    return { ok: "Fiyatlandırma kuralları kaydedildi. Taslak teklifler bir sonraki düzenlemede yeni kurallarla hesaplanır." };
  });
}

export async function savePortalAction(_: State, fd: FormData): Promise<State> {
  return panelAction(async ({ ctx }) => { await catalog.savePortal(ctx, { enabled: on(fd, "enabled"), showPrice: on(fd, "showPrice") }); });
}

// ---- Team -------------------------------------------------------------------

export async function inviteAction(_: State, fd: FormData): Promise<State> {
  return panelAction(async ({ ctx }) => {
    const url = await auth.inviteMember(ctx, { email: s(fd, "email"), role: s(fd, "role") });
    // the inviter is a signed-in admin of this organisation, so handing them the invite link is safe
    if (mailDisabled()) return { ok: "Davet oluşturuldu. Bu kurulumda e-posta gönderimi kapalı; bağlantıyı davet ettiğiniz kişiyle kendiniz paylaşın.", url };
    return { ok: "Davet gönderildi.", url: devLink(url) };
  });
}
export async function revokeInviteAction(id: string, _: State, _fd: FormData): Promise<State> {
  return panelAction(async ({ ctx }) => { await auth.revokeInvite(ctx, id); return { ok: "Davet iptal edildi." }; });
}
export async function setRoleAction(userId: string, _: State, fd: FormData): Promise<State> {
  return panelAction(async ({ ctx }) => { await auth.setMemberRole(ctx, userId, s(fd, "role")); return { ok: "Rol güncellendi." }; });
}
export async function removeMemberAction(userId: string, _: State, _fd: FormData): Promise<State> {
  return panelAction(async ({ ctx }) => { await auth.removeMember(ctx, userId); return { ok: "Üye çıkarıldı." }; });
}

// ---- Quotes -----------------------------------------------------------------

export async function createQuoteAction(_: State, fd: FormData): Promise<State> {
  return panelAction(async ({ ctx }) => {
    const q = await quotes.createQuote(ctx, { customerId: orNull(fd, "customerId") });
    redirect(`/panel/teklifler/${q.id}`);
  });
}

export async function updateItemAction(itemId: string, _: State, fd: FormData): Promise<State> {
  return panelAction(async ({ ctx }) => {
    await quotes.updateItem(ctx, itemId, {
      name: s(fd, "name") || undefined, materialId: orNull(fd, "materialId"), machineId: orNull(fd, "machineId"),
      partCode: s(fd, "partCode"), revision: s(fd, "revision"),
      thickness: decOrNull(fd, "thickness") as never, qty: s(fd, "qty") as never, bends: (s(fd, "bends") || "0") as never, extraPerUnit: (dec(fd.get("extraPerUnit")) || "0") as never,
      customerMaterial: fd.get("customerMaterial") === "on",
      // one input per catalogue operation, named op_<id>; empty or zero means "not applied"
      ops: [...fd.entries()].filter(([k, v]) => k.startsWith("op_") && Number(dec(v)) !== 0).map(([k, v]) => ({ opId: k.slice(3), qty: dec(v) as never })),
    });
    return { ok: "" };
  });
}
export async function bulkUpdateItemsAction(quoteId: string, _: State, fd: FormData): Promise<State> {
  return panelAction(async ({ ctx }) => {
    // blank fields are left out, so they keep each line's current value
    await quotes.updateAllItems(ctx, quoteId, { materialId: s(fd, "materialId") || undefined, machineId: s(fd, "machineId") || undefined, thickness: (dec(fd.get("thickness")) || undefined) as never });
    return { ok: "Tüm kalemlere uygulandı." };
  });
}
export async function applyPartsListAction(quoteId: string, _: State, fd: FormData): Promise<State> {
  return panelAction(async ({ ctx }) => {
    const r = await quotes.applyPartsList(ctx, quoteId, s(fd, "list"));
    const names = (v: string[]) => v.slice(0, 10).join(", ") + (v.length > 10 ? ` ve ${v.length - 10} satır daha` : "");
    return { ok: [`${r.matched} kalem güncellendi.`, r.unmatched.length ? `Çizimi yüklenmemiş: ${names(r.unmatched)}.` : "", r.missing.length ? `Listede olmayan kalem: ${names(r.missing)}.` : ""].filter(Boolean).join(" ") };
  });
}
export async function removeItemAction(itemId: string, _: State, _fd: FormData): Promise<State> {
  return panelAction(async ({ ctx }) => { await quotes.removeItem(ctx, itemId); return { ok: "" }; });
}

export async function savePartAction(itemId: string, _: State, _fd: FormData): Promise<State> {
  return panelAction(async ({ ctx }) => {
    await parts.savePartRevision(ctx, itemId);
    return { ok: "Revizyon parça hafızasında. Kayıt varsa ilk çizim, reçete ve fiyat korundu." };
  });
}
export async function addSavedPartAction(quoteId: string, _: State, fd: FormData): Promise<State> {
  return panelAction(async ({ ctx }) => { await parts.addSavedPart(ctx, quoteId, s(fd, "partId")); return { ok: "Parça güncel tarifeyle eklendi." }; });
}
export async function quoteFromPartAction(partId: string, _: State, _fd: FormData): Promise<State> {
  return panelAction(async ({ ctx }) => {
    const q = await parts.quoteFromPart(ctx, partId);
    redirect(`/panel/teklifler/${q.id}`);
  });
}
export async function saveQuantityOptionsAction(quoteId: string, _: State, fd: FormData): Promise<State> {
  return panelAction(async ({ ctx }) => {
    const { items } = await quotes.getQuote(ctx, quoteId);
    const options = Array.from({ length: 3 }, (_, i) => ({ label: s(fd, `label_${i}`).trim(),
      quantities: Object.fromEntries(items.map((it) => [it.id, Number(s(fd, `qty_${i}_${it.id}`))])) })).filter((o) => o.label);
    await quotes.saveQuantityOptions(ctx, quoteId, options);
    return { ok: options.length ? "Adet seçenekleri hesaplandı. Gönderirken son tarifeyle sabitlenecek." : "Adet seçenekleri kaldırıldı." };
  });
}

export async function updateQuoteAction(id: string, _: State, fd: FormData): Promise<State> {
  return panelAction(async ({ ctx }) => {
    await quotes.updateQuote(ctx, id, { customerId: fd.has("customerId") ? orNull(fd, "customerId") : undefined, notes: fd.has("notes") ? s(fd, "notes") : undefined });
    return { ok: "" };
  });
}
export async function deleteQuoteAction(id: string, _: State, _fd: FormData): Promise<State> {
  return panelAction(async ({ ctx }) => { await quotes.deleteQuote(ctx, id); redirect("/panel/teklifler"); });
}
export async function sendQuoteAction(id: string, _: State, _fd: FormData): Promise<State> {
  return panelAction(async ({ ctx }) => {
    const r = await quotes.sendQuote(ctx, id);
    return { ok: r.emailed ? `Teklif ${r.emailed} adresine e-postayla gönderildi.` : "Teklif gönderildi olarak işaretlendi. Bağlantıyı müşterinizle paylaşın." };
  });
}
export async function reopenQuoteAction(id: string, _: State, _fd: FormData): Promise<State> {
  return panelAction(async ({ ctx }) => { await quotes.reopenQuote(ctx, id); return { ok: "Teklif taslağa alındı." }; });
}
export async function decideQuoteAction(id: string, decision: "accepted" | "rejected", _: State, _fd: FormData): Promise<State> {
  return panelAction(async ({ ctx }) => { await quotes.decideQuote(ctx, id, decision); return { ok: decision === "accepted" ? "Teklif onaylandı, sipariş oluşturuldu." : "Teklif reddedildi olarak işaretlendi." }; });
}

// ---- Customers, orders, support ---------------------------------------------

export async function saveCustomerAction(_: State, fd: FormData): Promise<State> {
  return panelAction(async ({ ctx }) => {
    await quotes.saveCustomer(ctx, { id: s(fd, "id") || undefined, name: s(fd, "name"), email: s(fd, "email"), phone: s(fd, "phone"), taxNo: s(fd, "taxNo"), note: s(fd, "note") });
    return { ok: "Müşteri kaydedildi." };
  });
}
export async function deleteCustomerAction(id: string, _: State, _fd: FormData): Promise<State> {
  return panelAction(async ({ ctx }) => { await quotes.deleteCustomer(ctx, id); return { ok: "Müşteri silindi." }; });
}

export async function updateOrderAction(id: string, _: State, fd: FormData): Promise<State> {
  return panelAction(async ({ ctx }) => {
    await quotes.updateOrder(ctx, id, { status: s(fd, "status"), dueDate: orNull(fd, "dueDate"), note: s(fd, "note") });
    return { ok: "" };
  });
}

export async function supportAction(_: State, fd: FormData): Promise<State> {
  return panelAction(async ({ ctx }) => {
    rateLimit(`support:${ctx.userId}`, 10, 60 * 60_000);
    await quotes.sendSupport(ctx, { subject: s(fd, "subject"), body: s(fd, "body") });
    return { ok: "Mesajınız alındı. En kısa sürede e-postayla dönüş yapacağız." };
  });
}

// ---- Billing and account closure --------------------------------------------

export async function startCheckoutAction(_: State, fd: FormData): Promise<State> {
  return panelAction(async ({ ctx }) => {
    const r = await billing.startCheckout(ctx, {
      plan: s(fd, "plan") as "starter", name: s(fd, "name"), surname: s(fd, "surname"), email: s(fd, "email"), gsmNumber: s(fd, "gsmNumber").replace(/[\s()-]/g, ""),
      identityNumber: s(fd, "identityNumber"), address: s(fd, "address"), city: s(fd, "city"),
    });
    if (r.mode === "iyzico") return { html: r.formContent };
    await billing.activateTestSubscription(ctx, r.plan);
    return { ok: "TEST MODU: plan etkinleştirildi, gerçek bir ödeme alınmadı." };
  });
}
export async function changePlanAction(plan: "starter" | "workshop" | "pro", _: State, _fd: FormData): Promise<State> {
  return panelAction(async ({ ctx }) => { await billing.changePlan(ctx, plan); return { ok: "Planınız değiştirildi." }; });
}
export async function cancelSubscriptionAction(_: State, _fd: FormData): Promise<State> {
  return panelAction(async ({ ctx }) => { await billing.cancelSubscription(ctx); return { ok: "Aboneliğiniz iptal edildi. Ödediğiniz dönemin sonuna kadar kullanmaya devam edebilirsiniz." }; });
}

export async function deleteOrgAction(_: State, fd: FormData): Promise<State> {
  return panelAction(async ({ ctx }) => {
    await deleteOrg(ctx, s(fd, "confirm"));
    await clearSessionCookie();
    redirect("/?durum=silindi");
  });
}

// ---- Public quote link ------------------------------------------------------

export async function publicDecideAction(token: string, decision: "accepted" | "rejected", _: State, _fd: FormData): Promise<State> {
  return attempt(async () => {
    await quotes.decidePublicQuote(await getDb(), token, decision);
    revalidatePath(`/t/${token}`);
    return { ok: decision === "accepted" ? "Teklifi onayladınız. Firma sizinle iletişime geçecek." : "Teklifi reddettiniz." };
  });
}

export async function acceptQuantityOptionAction(token: string, optionId: string, _: State, _fd: FormData): Promise<State> {
  return attempt(async () => {
    await quotes.decidePublicQuote(await getDb(), token, "accepted", optionId);
    revalidatePath(`/t/${token}`);
    return { ok: "Seçtiğiniz adetlerle teklifi onayladınız." };
  });
}
