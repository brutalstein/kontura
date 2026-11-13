import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll } from "vitest";
import { type DB, openEmbedded } from "@/server/db";
import { signup } from "@/server/auth";
import { onboard } from "@/server/catalog";
import type { Ctx } from "@/server/core";
import { type Role, memberships, orgs, users } from "@/server/schema";
import { hashPassword } from "@/server/auth";
import { circle, dxf, line, rectLines } from "../dxf-builder";

const cleanups: (() => Promise<void>)[] = [];
afterAll(async () => { for (const cleanup of cleanups.reverse()) await cleanup(); });

/** Opt-in PostgreSQL verification creates a disposable database per suite; never uses DATABASE_URL. */
export async function freshDb(): Promise<DB> {
  if (!process.env.TEST_DATABASE_URL) return openEmbedded();
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const name = `kontura_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
  await admin.query(`CREATE DATABASE "${name}"`);
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.pathname = `/${name}`;
  const pool = new Pool({ connectionString: url.toString(), max: 2 });
  // pool.end() resolves before its sockets close, so DROP ... WITH (FORCE) can cut a connection that is still closing.
  // pg-pool re-emits that on the pool, and an unlistened 'error' event is an uncaught exception.
  pool.on("error", () => {});
  cleanups.push(async () => {
    await pool.end();
    try { await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`); }
    finally { await admin.end(); }
  });
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: "drizzle" });
  return db as unknown as DB;
}

let seq = 0;
export async function makeOrg(db: DB, opts: { onboarded?: boolean } = {}) {
  const n = ++seq;
  const r = await signup(db, { name: `Kişi ${n}`, company: `Atölye ${n}`, email: `owner${n}@example.com`, password: "correct-horse-battery" });
  const ctx: Ctx = { db, orgId: r.org.id, userId: r.user.id, role: "owner" };
  if (opts.onboarded !== false) {
    await onboard(ctx, { preset: "3kw", machineName: "Lazer 1", ratePerMin: 60, materials: [{ key: "dkp", pricePerKg: 40 }, { key: "paslanmaz", pricePerKg: 150 }] });
  }
  return { ...r, ctx };
}

/** Adds a member with the given role and returns a ctx acting as them. */
export async function member(db: DB, orgId: string, role: Role): Promise<Ctx> {
  const [u] = await db.insert(users).values({ email: `m${++seq}@example.com`, name: `Üye ${seq}`, passwordHash: await hashPassword("member-password-1") }).returning();
  await db.insert(memberships).values({ orgId, userId: u.id, role });
  return { db, orgId, userId: u.id, role };
}

export const setPlan = (db: DB, orgId: string, patch: Partial<typeof orgs.$inferInsert>) => db.update(orgs).set(patch).where(eq(orgs.id, orgId));

/** 200×100 mm plate with one Ø20 hole. */
export const plateDxf = () => dxf([...rectLines(0, 0, 200, 100), circle(100, 50, 10)]);
export const bracketDxf = () => dxf([...rectLines(0, 0, 120, 80), line(60, 0, 60, 80, { layer: "BUKUM" })]);
