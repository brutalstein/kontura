// Stands in for @electric-sql/pglite in the Cloudflare build (see next.config.ts): the embedded database is megabytes of
// WebAssembly that a Worker can neither load from disk nor fit in its size limit. Workers always use PostgreSQL.
export class PGlite {
  constructor() { throw new Error("The embedded database is not available on Cloudflare Workers."); }
}
export const types = {};
