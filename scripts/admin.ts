/**
 * Grants or revokes platform-operator access (the /yonetim console).
 *   pnpm admin user@example.com          grant
 *   pnpm admin user@example.com --revoke revoke
 *   pnpm admin user@example.com --reset-link   print a one-hour password reset link (for deployments without e-mail)
 *   pnpm admin user@example.com --plan workshop --months 12
 *                                        activate a plan for the organisations this user owns, paid outside the app
 *                                        (bank transfer, or while no payment provider is connected)
 * Uses the same database as the app (DATABASE_URL, or the embedded dev database).
 * The embedded database allows one process at a time: stop the dev server first.
 */
import { and, eq } from "drizzle-orm";
import { requestPasswordReset } from "../src/server/auth";
import { getDb } from "../src/server/db";
import { memberships, orgs, users } from "../src/server/schema";

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !email.includes("@")) {
  console.error("Usage: pnpm admin <email> [--revoke | --reset-link | --plan <starter|workshop|pro> [--months N]]");
  process.exit(1);
}
const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const grant = !process.argv.includes("--revoke");
const db = await getDb();
if (process.argv.includes("--reset-link")) {
  const url = await requestPasswordReset(db, email, "operator");
  console.log(url ? `Give this link to the account owner only (valid for 1 hour):\n${url}` : `No user with e-mail ${email}.`);
  process.exit(url ? 0 : 1);
}
const plan = arg("--plan");
if (plan) {
  if (plan !== "starter" && plan !== "workshop" && plan !== "pro") { console.error("Plan must be starter, workshop or pro."); process.exit(1); }
  const months = Number(arg("--months") ?? 12);
  if (!Number.isInteger(months) || months < 1 || months > 60) { console.error("--months must be a whole number from 1 to 60."); process.exit(1); }
  const until = new Date(); until.setMonth(until.getMonth() + months);
  const owned = await db.select({ id: orgs.id, name: orgs.name }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).innerJoin(orgs, eq(orgs.id, memberships.orgId))
    .where(and(eq(users.email, email), eq(memberships.role, "owner")));
  if (!owned.length) { console.error(`${email} owns no organisation.`); process.exit(1); }
  for (const o of owned) {
    await db.update(orgs).set({ plan, subStatus: "active", subRenewsAt: until }).where(eq(orgs.id, o.id));
    console.log(`${o.name}: ${plan} until ${until.toISOString().slice(0, 10)}.`);
  }
  process.exit(0);
}
const rows = await db.update(users).set({ isPlatformAdmin: grant }).where(eq(users.email, email)).returning({ id: users.id });
if (!rows.length) {
  console.error(`No user with e-mail ${email}. The user must sign up first.`);
  process.exit(1);
}
console.log(`${email}: platform admin ${grant ? "granted" : "revoked"}.`);
process.exit(0);
