import { it, expect } from "vitest";
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

it("expands a populated original schema without rewriting its quote and can migrate twice", async () => {
  const folder = mkdtempSync(path.join(tmpdir(), "kontura-migration-"));
  const pg = new PGlite();
  try {
    mkdirSync(path.join(folder, "meta"));
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
    writeFileSync(path.join(folder, "meta/_journal.json"), JSON.stringify({ ...journal, entries: journal.entries.slice(0, 1) }));
    copyFileSync("drizzle/0000_flashy_ink.sql", path.join(folder, "0000_flashy_ink.sql"));
    const db = drizzle(pg);
    await migrate(db, { migrationsFolder: folder });
    await pg.exec(`INSERT INTO orgs (id,name,slug,rules,trial_ends_at) VALUES ('legacy','Eski Firma','eski-firma','{}',now());
      INSERT INTO quotes (id,org_id,number,public_token,totals) VALUES ('legacy-q','legacy',1,'legacy-token','{"ok":true,"net":123.45}');`);
    await migrate(db, { migrationsFolder: "drizzle" });
    await migrate(db, { migrationsFolder: "drizzle" });
    const result = await pg.query<{ id: string; totals: unknown; options: unknown; selected_option_id: unknown }>("select id,totals,options,selected_option_id from quotes where id='legacy-q'");
    expect(result.rows).toEqual([{ id: "legacy-q", totals: { ok: true, net: 123.45 }, options: [], selected_option_id: null }]);
    expect((await pg.query("select * from part_revisions")).rows).toEqual([]);
  } finally {
    await pg.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
