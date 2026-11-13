import { expect, test } from "@playwright/test";

const SHOTS = process.env.E2E_SHOTS; // optional directory for full-page screenshots

test("named operations and customer-supplied material are priced privately and shown to the customer as scope only", async ({ page, browser }) => {
  const run = Date.now().toString(36);
  await page.goto("/kayit");
  await page.getByLabel("Ad soyad").fill("İşlem Testi");
  await page.getByLabel("Firma adı").fill(`Kapsam Lazer ${run}`);
  await page.getByLabel("İş e-postası").fill(`kapsam-${run}@ornek.test`);
  await page.getByLabel("Şifre").fill(`Kapsam-${run}-Test!`);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Hesabı oluştur" }).click();
  await expect(page).toHaveURL(/\/panel\/kurulum/);
  await page.getByLabel("Dakika ücreti (₺/dk)").fill("60");
  await page.getByLabel("DKP / siyah sac (S235) kilogram fiyatı").fill("42,5"); // decimal comma, as typed on a Turkish keyboard
  await page.getByRole("button", { name: "Kurulumu tamamla" }).click();
  await expect(page).toHaveURL(/\/panel(\?|$)/);

  await page.goto("/panel/ayarlar/islemler");
  const add = page.locator("form").filter({ has: page.getByRole("button", { name: "İşlem ekle" }) });
  await add.getByLabel("İşlem adı").fill("Toz boya");
  await add.locator('select[name="unit"]').selectOption("m2");
  await add.getByLabel("Birim fiyat (₺)").fill("250,50");
  await add.getByLabel("Parti ücreti (₺)").fill("400");
  await add.getByRole("button", { name: "İşlem ekle" }).click();
  await expect(page.getByRole("region", { name: "Toz boya" })).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/ayarlar-islemler.png`, fullPage: true });

  await page.goto("/panel/teklifler");
  await page.getByRole("button", { name: "Yeni teklif" }).click();
  await expect(page).toHaveURL(/\/panel\/teklifler\//);
  const sample = await page.request.get("/ornek.dxf");
  await page.locator('input[type="file"]').setInputFiles({ name: "braket.dxf", mimeType: "application/dxf", buffer: await sample.body() });
  await expect(page.getByLabel("Kalem adı")).toHaveValue(/braket/);
  const item = page.locator("form").filter({ has: page.getByLabel("Kalem adı") });
  await item.locator('input[name="thickness"]').fill("3");
  await item.locator('input[name="qty"]').fill("20");
  await item.getByLabel("Toz boya (m²)").fill("0,07");
  await item.getByLabel("Malzeme müşteriden").check();
  await item.getByRole("button", { name: "Kaydet", exact: true }).click();

  await page.getByText("Maliyet dökümü").click();
  const breakdown = page.locator("details").filter({ hasText: "Maliyet dökümü" });
  // 250,50 x 0,07 m² x 20 adet + 400 parti ücreti
  await expect(breakdown).toContainText(/İşlemler\s*₺750,70/);
  await expect(breakdown).toContainText(/Malzeme \(müşteriden\)\s*₺0,00/);
  await expect(page.getByText("müşteri malzemesi")).toBeVisible();
  if (SHOTS) {
    await page.screenshot({ path: `${SHOTS}/teklif-islemler.png`, fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.screenshot({ path: `${SHOTS}/teklif-islemler-375.png`, fullPage: true });
    await page.setViewportSize({ width: 1280, height: 720 });
  }

  await page.getByRole("button", { name: "Teklifi gönder" }).click();
  const url = await page.getByRole("link", { name: "Müşteri görünümü" }).getAttribute("href");
  const guest = await browser.newContext({ locale: "tr-TR" });
  const pub = await guest.newPage();
  await pub.goto(url!);
  await expect(pub.getByText("Dahil işlemler: Toz boya")).toBeVisible();
  await expect(pub.getByText("Malzeme müşteriden, fiyata dahil değil")).toBeVisible();
  if (SHOTS) await pub.screenshot({ path: `${SHOTS}/musteri-islemler.png`, fullPage: true });
  await expect(pub.getByText("250,50")).toHaveCount(0);
  await expect(pub.getByText("750,70")).toHaveCount(0);
  await guest.close();
});
