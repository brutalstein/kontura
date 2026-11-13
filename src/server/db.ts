import { mkdirSync } from "node:fs";
import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

/** In-process Postgres (PGlite). `dataDir` undefined = in-memory, used by tests. */
export async function openEmbedded(dataDir?: string): Promise<DB> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  if (dataDir) mkdirSync(dataDir, { recursive: true }); // PGlite does not create parent directories
  const db = drizzle(new PGlite(dataDir), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db as unknown as DB;
}

async function openServer(url: string, max = Number(process.env.DB_POOL_MAX ?? 10), migrateOnStart = process.env.DB_MIGRATE_ON_START !== "false"): Promise<DB> {
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const db = drizzle(new Pool({ connectionString: url, max }), { schema });
  if (migrateOnStart) {
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate(db, { migrationsFolder: MIGRATIONS });
  }
  return db as unknown as DB;
}

const onWorkers = typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
const perRequest = new WeakMap<object, Promise<DB>>();
/**
 * Cloudflare Workers: a socket belongs to the request that opened it, so the handle lives as long as the request, not the process.
 * Connections go through the Hyperdrive binding, which pools them next to the database. Migrations run at release time, never here.
 */
async function openWorker(): Promise<DB> {
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const { env, ctx } = getCloudflareContext();
  let db = perRequest.get(ctx);
  if (!db) {
    // 4 of the 6 simultaneous outbound connections a request may hold
    db = openServer((env as unknown as { HYPERDRIVE: { connectionString: string } }).HYPERDRIVE.connectionString, 4, false);
    perRequest.set(ctx, db);
  }
  return db;
}

const globalForDb = globalThis as { __konturaDb?: Promise<DB> };

/** Process-wide database handle. Production requires DATABASE_URL; development falls back to an embedded database on disk. */
export function getDb(): Promise<DB> {
  if (onWorkers) return openWorker();
  if (!globalForDb.__konturaDb) {
    const url = process.env.DATABASE_URL;
    if (url) globalForDb.__konturaDb = openServer(url);
    else if (process.env.NODE_ENV === "production" && process.env.ALLOW_EMBEDDED_DB !== "true") {
      throw new Error("DATABASE_URL is required in production.");
    } else globalForDb.__konturaDb = openEmbedded(process.env.PGLITE_DATA_DIR || path.join(process.cwd(), ".data", "pglite"));
    // A failed connection must not be cached, otherwise the process never recovers from a start-up outage.
    globalForDb.__konturaDb.catch(() => { globalForDb.__konturaDb = undefined; });
  }
  return globalForDb.__konturaDb;
}
