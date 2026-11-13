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

async function openServer(url: string): Promise<DB> {
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const db = drizzle(new Pool({ connectionString: url, max: Number(process.env.DB_POOL_MAX ?? 10) }), { schema });
  if (process.env.DB_MIGRATE_ON_START !== "false") await migrate(db, { migrationsFolder: MIGRATIONS });
  return db as unknown as DB;
}

const globalForDb = globalThis as { __konturaDb?: Promise<DB> };

/** Process-wide database handle. Production requires DATABASE_URL; development falls back to an embedded database on disk. */
export function getDb(): Promise<DB> {
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
