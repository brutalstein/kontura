/**
 * Grants or revokes platform-operator access (the /yonetim console).
 *   pnpm admin user@example.com          grant
 *   pnpm admin user@example.com --revoke revoke
 * Uses the same database as the app (DATABASE_URL, or the embedded dev database).
 * The embedded database allows one process at a time: stop the dev server first.
 */
import { eq } from "drizzle-orm";
import { getDb } from "../src/server/db";
import { users } from "../src/server/schema";

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !email.includes("@")) {
  console.error("Usage: pnpm admin <email> [--revoke]");
  process.exit(1);
}
const grant = !process.argv.includes("--revoke");
const db = await getDb();
const rows = await db.update(users).set({ isPlatformAdmin: grant }).where(eq(users.email, email)).returning({ id: users.id });
if (!rows.length) {
  console.error(`No user with e-mail ${email}. The user must sign up first.`);
  process.exit(1);
}
console.log(`${email}: platform admin ${grant ? "granted" : "revoked"}.`);
process.exit(0);
