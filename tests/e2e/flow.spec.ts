import path from "node:path";
import { type Browser, type Page, expect, test } from "@playwright/test";

/**
 * End-to-end flows through the real UI, server and database.
 * State is shared between the tests in this file, so they run in order.
 * Set E2E_SHOTS=<directory> to save full-page screenshots of every screen visited.
 */
test.describe.configure({ mode: "serial" });

const run = Date.now().toString(36);
const password = `E2e-${run}-Parola!`; // generated per run, never a real credential
const SHOTS = process.env.E2E_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true, caret: "initial" });
};

let ownerState: Awaited<ReturnType<Awaited<ReturnType<Browser["newContext"]>>["storageState"]>>;
let quotePath = "";
let publicUrl = "";
let sample: Buffer;

async function signup(page: Page, tag: string, company: string) {
  await page.goto("/kayit");
  await page.getByLabel("Ad soyad").fill(`Test ${tag}`);
  await page.getByLabel("Firma adı").fill(company);
  await page.getByLabel("İş e-postası").fill(`${tag}-${run}@ornek.test`);
  await page.getByLabel("Şifre").fill(password);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Hesabı oluştur" }).click();
  await expect(page).toHaveURL(/\/panel\/kurulum/);
}

async function onboard(page: Page) {
  await page.getByLabel("Dakika ücreti (₺/dk)").fill("60");
  await page.getByLabel("DKP / siyah sac (S235) kilogram fiyatı").fill("40");
  await page.getByRole("button", { name: "Kurulumu tamamla" }).click();
  await expect(page).toHaveURL(/\/panel(\?|$)/);
}

test.beforeAll(async ({ request }) => {
  const res = await request.get("/ornek.dxf");
  expect(res.ok()).toBe(true);
  sample = await res.body();
});

test("anonymous visitors cannot reach the panel or the API", async ({ page, request }) => {
  await page.goto("/panel");
  await expect(page).toHaveURL(/\/giris/);
  expect((await request.get("/api/export")).status()).toBe(401);
  expect((await request.get("/api/files/00000000-0000-0000-0000-000000000000")).status()).toBe(401);
  const admin = await page.context().newPage();
  await admin.goto("/yonetim");
  await expect(admin).toHaveURL(/\/giris/);
  await admin.close();
});

test("owner signs up, sets up the shop, prices a DXF and the customer accepts", async ({ page, browser }) => {
  await signup(page, "sahip", `E2E Lazer ${run}`);
  await shot(page, "panel-kurulum");
  await onboard(page);
  await shot(page, "panel-genel");

  await page.getByRole("button", { name: "Yeni teklif" }).first().click();
  await expect(page).toHaveURL(/\/panel\/teklifler\/[0-9a-f-]{36}/);
  quotePath = new URL(page.url()).pathname;
  await shot(page, "teklif-bos");

  await page.locator('input[type="file"]').setInputFiles({ name: "braket.dxf", mimeType: "application/dxf", buffer: sample });
  await expect(page.getByLabel("Kalem adı")).toHaveValue(/braket/);

  const item = page.locator("form").filter({ has: page.getByLabel("Kalem adı") });
  await item.locator('select[name="materialId"]').selectOption({ index: 1 });
  await item.locator('select[name="machineId"]').selectOption({ index: 1 });
  await item.locator('input[name="thickness"]').fill("3");
  await item.locator('input[name="qty"]').fill("60");
  await item.getByRole("button", { name: "Kaydet" }).click();

  const summary = page.getByLabel("Teklif özeti");
  await expect(summary).toContainText(/₺\s?[\d.]+,\d\d/);
  await expect(page.getByRole("heading", { name: "Plaka yerleşimi" })).toBeVisible();
  await shot(page, "teklif-fiyatli");

  await page.getByRole("button", { name: "Teklifi gönder" }).click();
  const link = page.getByRole("link", { name: "Müşteri görünümü" });
  await expect(link).toBeVisible();
  publicUrl = (await link.getAttribute("href"))!;
  await shot(page, "teklif-gonderildi");
  ownerState = await page.context().storageState();

  // The customer has no account: a fresh browser context with no cookies.
  const guest = await browser.newContext({ locale: "tr-TR" });
  const pub = await guest.newPage();
  await pub.goto(publicUrl);
  await expect(pub.getByRole("heading", { level: 1 })).toContainText("Fiyat teklifi");
  await expect(pub.getByText("Kâr")).toHaveCount(0); // cost breakdown and margin stay private
  await expect(pub.getByText("Makine süresi")).toHaveCount(0);
  await shot(pub, "musteri-teklif");
  pub.once("dialog", (d) => d.accept());
  await pub.getByRole("button", { name: "Teklifi onayla" }).click();
  await expect(pub.getByText(/tarihinde onaylandı/)).toBeVisible();
  await expect(pub.getByRole("button", { name: "Teklifi onayla" })).toHaveCount(0);
  await shot(pub, "musteri-onaylandi");
  await guest.close();

  await page.goto("/panel/siparisler");
  await expect(page.locator('select[name="status"]')).toHaveCount(1);
  await shot(page, "siparisler");
  await page.goto(quotePath);
  await expect(page.getByText(/tarihinde onaylandı/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Teklifi gönder" })).toHaveCount(0);
});

test("a second organisation cannot see or change the first one's quote", async ({ browser }) => {
  const other = await browser.newContext({ locale: "tr-TR" });
  const page = await other.newPage();
  await signup(page, "rakip", `E2E Rakip ${run}`);
  await onboard(page);

  // The panel streams (loading.tsx), so "not found" arrives as rendered content rather than as an HTTP status.
  await page.goto(quotePath);
  await expect(page.getByRole("heading", { name: "Sayfa bulunamadı" })).toBeVisible();
  await expect(page.getByLabel("Kalem adı")).toHaveCount(0);
  await expect(page.getByText("braket")).toHaveCount(0);
  await page.goto("/panel/teklifler");
  await expect(page.getByText(`E2E Lazer ${run}`)).toHaveCount(0);

  const id = quotePath.split("/").pop()!;
  const upload = await page.request.post(`/api/quotes/${id}/items`, {
    headers: { origin: new URL(page.url()).origin },
    multipart: { file: { name: "x.dxf", mimeType: "application/dxf", buffer: sample } },
  });
  expect(upload.status()).toBe(404);

  // A cross-site POST with a valid session cookie is refused.
  const forged = await page.request.post(`/api/quotes/${id}/items`, {
    headers: { origin: "https://evil.example" },
    multipart: { file: { name: "x.dxf", mimeType: "application/dxf", buffer: sample } },
  });
  expect(forged.status()).toBe(403);
  await other.close();
});

test("customer portal: upload, estimate, request; the shop receives a draft", async ({ browser }) => {
  const owner = await browser.newContext({ locale: "tr-TR", storageState: ownerState });
  const page = await owner.newPage();
  await page.goto("/panel/ayarlar/portal");
  await page.locator('input[name="enabled"]').check();
  await page.locator('input[name="showPrice"]').check();
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByRole("status")).toBeVisible();
  await shot(page, "ayarlar-portal");
  const portalUrl = await page.locator('a[href*="/p/"]').first().getAttribute("href");
  expect(portalUrl).toBeTruthy();

  const guest = await browser.newContext({ locale: "tr-TR" });
  const pub = await guest.newPage();
  await pub.goto(portalUrl!);
  await pub.locator('input[type="file"]').setInputFiles({ name: "braket.dxf", mimeType: "application/dxf", buffer: sample });
  await expect(pub.getByRole("heading", { name: "braket.dxf" })).toBeVisible();
  await expect(pub.getByText(/7 delme/)).toBeVisible();
  await expect(pub.getByRole("complementary")).toContainText(/₺\s?[\d.]+,\d\d/);
  await shot(pub, "portal-tahmin");

  // A price belongs to the exact selection that produced it. Hide it as soon as quantity changes.
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let arrived!: () => void;
  const requested = new Promise<void>((resolve) => { arrived = resolve; });
  await pub.route("**/tahmin", async (route) => {
    const response = await route.fetch();
    arrived();
    await held;
    await route.fulfill({ response });
  });
  await pub.getByLabel("Adet").fill("2");
  await requested;
  try {
    await expect(pub.getByRole("complementary")).not.toContainText(/₺\s?[\d.]+,\d\d/);
  } finally {
    release();
  }
  await expect(pub.getByRole("complementary")).toHaveAttribute("aria-busy", "false");
  await pub.unroute("**/tahmin");

  await pub.getByLabel("Ad soyad").fill("Portal Müşterisi");
  await pub.getByLabel("E-posta").fill(`musteri-${run}@ornek.test`);
  await pub.getByRole("checkbox").check();
  await pub.getByRole("button", { name: "Talebi gönder" }).click();
  await expect(pub.getByRole("heading", { name: "Talebiniz iletildi" })).toBeVisible();
  await shot(pub, "portal-iletildi");
  await guest.close();

  await page.goto("/panel/teklifler");
  await expect(page.getByText("Portal Müşterisi")).toBeVisible();
  await shot(page, "teklifler");
  await owner.close();
});

test("settings, support and sign-in screens work for the owner", async ({ browser }) => {
  const owner = await browser.newContext({ locale: "tr-TR", storageState: ownerState });
  const page = await owner.newPage();
  for (const tab of ["firma", "makineler", "malzemeler", "fiyatlandirma", "ekip", "abonelik", "hesap"]) {
    const res = await page.goto(`/panel/ayarlar/${tab}`);
    expect(res?.status(), tab).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await shot(page, `ayarlar-${tab}`);
  }
  await page.goto("/panel/ayarlar/abonelik");
  if (process.env.E2E_PRODUCTION === "true") await expect(page.getByText("TEST MODU.")).toHaveCount(0);
  else await expect(page.getByText("TEST MODU.")).toBeVisible(); // never presented as real payment

  await page.goto("/panel/destek");
  await page.getByLabel("Konu").fill("E2E deneme mesajı");
  await page.getByLabel("Mesajınız").fill("Bu mesaj otomatik test tarafından gönderildi.");
  await page.getByRole("button", { name: "Gönder", exact: true }).click();
  await expect(page.getByRole("status")).toBeVisible();
  await shot(page, "destek");

  await page.goto("/panel/musteriler");
  await shot(page, "musteriler");
  await page.goto("/yonetim"); // not a platform admin
  await expect(page.getByRole("heading", { name: "Sayfa bulunamadı" })).toBeVisible();
  await owner.close();

  // Wrong password is rejected, the right one signs in.
  const fresh = await browser.newContext({ locale: "tr-TR" });
  const login = await fresh.newPage();
  await login.goto("/giris");
  await login.getByLabel("E-posta").fill(`sahip-${run}@ornek.test`);
  await login.getByLabel("Şifre").fill("yanlis-parola-123");
  await login.getByRole("button", { name: "Giriş yap" }).click();
  await expect(login.getByRole("alert")).toBeVisible();
  await login.getByLabel("Şifre").fill(password);
  await login.getByRole("button", { name: "Giriş yap" }).click();
  await expect(login).toHaveURL(/\/panel/);
  await fresh.close();
});
