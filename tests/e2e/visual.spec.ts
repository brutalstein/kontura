import { expect, test } from "@playwright/test";

for (const width of [375, 768, 1440]) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`public screens at ${width}px in ${colorScheme} mode`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      for (const route of ["/", "/fiyatlar", "/giris", "/kayit", "/yasal/kvkk"]) {
        const response = await page.goto(route);
        expect(response?.status(), route).toBe(200);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), { message: `${route} overflows at ${width}px` }).toBe(true);
        if (route === "/" || route === "/giris") {
          await page.screenshot({ path: test.info().outputPath(`${route === "/" ? "home" : "login"}.png`), fullPage: true, caret: "initial" });
        }
      }
      expect(errors).toEqual([]);
    });
  }
}
