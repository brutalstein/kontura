import { defineConfig } from "@playwright/test";
import development from "./playwright.config";

// Deliberate opt-in: this suite creates sample accounts in an already running,
// disposable local production deployment. Never point it at real customer data.
if (process.env.RUN_DISPOSABLE_PRODUCTION_E2E !== "true") {
  throw new Error("Use an isolated local deployment and set RUN_DISPOSABLE_PRODUCTION_E2E=true.");
}
process.env.E2E_PRODUCTION = "true";

export default defineConfig({
  ...development,
  webServer: [],
  outputDir: "test-results-production",
  use: { ...development.use, baseURL: "http://localhost:3000" },
});
