import { expect, test } from "@playwright/test";

const SHOTS = process.env.E2E_SHOTS; // optional directory for full-page screenshots

test("a multi-part quote is filled in from one bulk assignment and one pasted parts list", async ({ page }) => {
  const run = Date.now().toString(36);
  await page.goto("/kayit");
  await page.getByLabel("Ad soyad").fill("Liste Testi");
  await page.getByLabel("Firma adı").fill(`Liste Lazer ${run}`);
  await page.getByLabel("İş e-postası").fill(`liste-${run}@ornek.test`);
  await page.getByLabel("Şifre").fill(`Liste-${run}-Test!`);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Hesabı oluştur" }).click();
  await expect(page).toHaveURL(/\/panel\/kurulum/);
  await page.getByLabel("Dakika ücreti (₺/dk)").fill("60");
  await page.getByLabel("DKP / siyah sac (S235) kilogram fiyatı").fill("40");
  await page.getByRole("button", { name: "Kurulumu tamamla" }).click();
  await expect(page).toHaveURL(/\/panel(\?|$)/);

  await page.goto("/panel/teklifler");
  await page.getByRole("button", { name: "Yeni teklif" }).click();
  await expect(page).toHaveURL(/\/panel\/teklifler\//);
  const buffer = await (await page.request.get("/ornek.dxf")).body();
  await page.locator('input[type="file"]').setInputFiles(["braket.dxf", "flans.dxf"].map((name) => ({ name, mimeType: "application/dxf", buffer })));
  const names = page.getByLabel("Kalem adı");
  await expect(names).toHaveCount(2);
  const line = (name: string) => page.locator("article").filter({ has: page.locator(`input[name="name"][value="${name}"]`) });

  await page.getByText("Toplu düzenleme ve parça listesi").click();
  const bulk = page.locator("form").filter({ has: page.getByRole("button", { name: "Hepsine uygula" }) });
  await bulk.locator('input[name="thickness"]').fill("3");
  await bulk.getByRole("button", { name: "Hepsine uygula" }).click();
  await expect(page.getByText("Tüm kalemlere uygulandı.")).toBeVisible();
  for (const n of ["braket", "flans"]) await expect(line(n).locator('input[name="thickness"]')).toHaveValue("3");

  await page.getByLabel("Parça listesi").fill("Parça\tAdet\tKalınlık\nbraket\t20\nFLANS.dxf;8;1,5\nkapak;4");
  await page.getByRole("button", { name: "Listeyi uygula" }).click();
  await expect(page.getByText("2 kalem güncellendi. Çizimi yüklenmemiş: kapak.")).toBeVisible();
  await expect(line("braket").locator('input[name="qty"]')).toHaveValue("20");
  await expect(line("flans").locator('input[name="qty"]')).toHaveValue("8");
  await expect(line("flans").locator('input[name="thickness"]')).toHaveValue("1.5");
  await expect(line("braket").locator('input[name="thickness"]')).toHaveValue("3");
  if (SHOTS) {
    await page.screenshot({ path: `${SHOTS}/teklif-toplu.png`, fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.screenshot({ path: `${SHOTS}/teklif-toplu-375.png`, fullPage: true });
  }

  await page.getByLabel("Parça listesi").fill("braket;yirmi");
  await page.getByRole("button", { name: "Listeyi uygula" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "1. satır" })).toHaveCount(0); // first row with unreadable quantity is taken as a header
  await page.getByLabel("Parça listesi").fill("braket;5\nflans;yirmi");
  await page.getByRole("button", { name: "Listeyi uygula" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "2. satır: adet okunamadı" })).toBeVisible();
  await expect(line("braket").locator('input[name="qty"]')).toHaveValue("20");
});
