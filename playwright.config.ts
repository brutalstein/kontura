import { defineConfig } from "@playwright/test";
import path from "node:path";

/**
 * Browser tests run against the development server with the embedded database and test-mode billing.
 * They use the locally installed Chrome, so no browser download is needed.
 * A production build cannot be used here: production refuses to start flows that send e-mail without SMTP_URL.
 */
export default defineConfig({
  testDir: "tests/e2e",
  workers: 1, // one embedded database and one in-memory rate limiter: keep the flows sequential
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:3101", channel: process.env.CI ? "chromium" : "chrome", locale: "tr-TR", trace: "retain-on-failure" },
  webServer: {
    command: "pnpm exec next dev --webpack --hostname 127.0.0.1 --port 3101",
    url: "http://127.0.0.1:3101/api/health",
    reuseExistingServer: false,
    timeout: 180_000,
    // An ambient DATABASE_URL must never be picked up by a test run.
    env: {
      DATABASE_URL: "", BILLING_TEST_MODE: "true", KONTURA_E2E: "true",
      PGLITE_DATA_DIR: path.resolve(".data/e2e"), APP_URL: "http://127.0.0.1:3101",
      SMTP_URL: "", IYZICO_API_KEY: "", IYZICO_SECRET_KEY: "", IYZICO_MERCHANT_ID: "",
    },
  },
});
