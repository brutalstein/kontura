# Development and release verification

**Goal:** Continue the existing Kontura implementation, provide one development entry point, isolate browser tests, and close reproducible payment-state defects.

**Architecture:** Keep Next.js, Drizzle, PGlite for local work and PostgreSQL for deployment. No additional running service is needed for the application's local business flows. SMTP and iyzico remain real external integrations requiring credentials; never report simulated payment or console mail as live verification.

**Acceptance:** The root development command installs locked dependencies without replacing local configuration, starts on a fixed local port, migrates the configured database and serves a healthy application. E2E uses its own port, Next output and database. Lint, types, unit/service tests, PostgreSQL service tests, all browser tests and the production build are rerun. Existing local data and Claude's uncommitted changes are preserved.

## Implementation

- [x] Add `scripts/dev.mjs`, expose it through `pnpm dev`, and add root `dev.cmd`. Environment precedence, source-file preservation, occupied-port rejection, real startup/health/shutdown/restart verified. Dependency-install failure branch exists but was not fault-injected; clean-machine/network-failure verification remains unproven.
- [x] Add explicit embedded database directory selection in `src/server/db.ts`. Configure Playwright on port 3101 with `.next-e2e` and `.data/e2e`, no reuse of existing servers, SMTP or live payment credentials. Update the test's same-origin header. All 14 E2E passed.
- [x] Reproduce webhook retry/order/atomicity and paid-period access defects in `tests/server/billing.test.ts`. Reconcile against the provider's documented subscription/order details, commit event/state/audit in one locked transaction, and bound past-due access to the verified paid period. Provider outage retries, invalid snapshots, cancellation and rollback tests passed. Live-provider verification remains pending.
- [x] Verify migration repeatability and service tests against a disposable PostgreSQL 17 container. Build and run all 14 E2E against Docker production with local SMTP capture. Restore into a separate DB and compare counts. Refresh Graphify and update README/status/test evidence.

## Review boundaries

Missing Node/Corepack, occupied ports, absent/blank/ambient database URLs, configured SMTP and provider keys, duplicate and concurrent signed events, provider outage, already-canceled subscriptions and expired paid periods are material failure cases. Do not publish, charge a real card, delete user data or claim live readiness.

## Evidence / rulings

- Baseline: 81/81 service and engine tests passed, typecheck passed, lint has 0 errors and 40 existing warnings.
- Local `codex-max` was authored from the user's policy after no installable source was found; its frontmatter validation passed. It is explicitly identified as a local workflow, not an official package.
- Keep the existing dirty checkout as requested by the continuation task; do not create a new worktree or commit Claude's unfinished work.
- Use permitted Graphify CLI and targeted source reads. MCP graph extensions are outside the supplied extension allowlist; no MCP index coverage is claimed.
- Final evidence: 90 tests on each DB, 14 development + 14 production E2E, build/lint/types, SMTP capture and restore passed. See TEST_RESULTS.md for details and unverified gates. Original local environment/data preserved; temporary verification services removed.
