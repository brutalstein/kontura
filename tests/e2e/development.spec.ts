import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

test("CSS updates preserve form input and do not start a reload loop", async ({ page, context }) => {
  test.skip(process.env.E2E_PRODUCTION === "true", "Source edits apply only to the development server.");
  const stylesheet = path.resolve("src/app/globals.css");
  const original = readFileSync(stylesheet);
  const marker = String(Date.now());
  try {
    await page.goto("/kayit");
    await page.getByLabel("Ad soyad").fill("Kaybolmaması gereken bilgi");
    await page.evaluate((value) => { Object.assign(window, { konturaDocument: value }); }, marker);
    writeFileSync(stylesheet, Buffer.concat([original, Buffer.from(`\n:root { --kontura-hmr-probe: ${marker}; }\n`)]));
    await expect(page.locator("html")).toHaveCSS("--kontura-hmr-probe", marker);
    const other = await context.newPage();
    await other.goto("/giris");
    await other.reload();
    // Observe beyond a reconnect interval: a hash mismatch repeatedly reloads both pages.
    await page.waitForTimeout(6000);
    expect(await page.evaluate(() => Reflect.get(window, "konturaDocument"))).toBe(marker);
    await expect(page.getByLabel("Ad soyad")).toHaveValue("Kaybolmaması gereken bilgi");
    await other.close();
  } finally {
    writeFileSync(stylesheet, original);
  }
});
