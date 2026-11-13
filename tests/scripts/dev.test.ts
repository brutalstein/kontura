import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { developmentEnv } from "../../scripts/dev.mjs";

describe("development environment", () => {
  it("ignores an unrelated ambient database and uses local embedded storage", () => {
    const env = developmentEnv({ DATABASE_URL: "postgres://unrelated/production", NODE_ENV: "production" }, {});
    expect(env.DATABASE_URL).toBe("");
    expect(env.NODE_ENV).toBe("development");
    expect(env.DB_MIGRATE_ON_START).toBe("true");
  });

  it("uses the database explicitly configured in .env.local without leaking ambient overrides", () => {
    const env = developmentEnv({ DATABASE_URL: "postgres://unrelated/db" }, { DATABASE_URL: "postgres://localhost/kontura", SMTP_URL: "smtp://localhost:1025" });
    expect(env.DATABASE_URL).toBe("postgres://localhost/kontura");
    expect(env.SMTP_URL).toBe("smtp://localhost:1025");
  });

  it("expands local variables and escaped dollars exactly as Next does, preserving the file", () => {
    const folder = mkdtempSync(path.join(tmpdir(), "kontura-dev-env-"));
    const contents = 'DB_NAME=kontura\nDATABASE_URL=postgresql://localhost/$DB_NAME\nSMTP_URL=smtp://host/p\\$ss\n';
    writeFileSync(path.join(folder, ".env.local"), contents);
    try {
      const moduleUrl = pathToFileURL(path.resolve("scripts/dev.mjs")).href;
      const childScript = "const {createRequire}=require('node:module'); const nextEnv=createRequire(require.resolve('next/package.json'))('@next/env'); const env=nextEnv.loadEnvConfig(process.argv[1],true).combinedEnv; process.stdout.write(JSON.stringify({database:env.DATABASE_URL,smtp:env.SMTP_URL}));";
      const script = `import { loadDevelopmentEnv } from ${JSON.stringify(moduleUrl)}; import {spawnSync} from 'node:child_process'; const env = loadDevelopmentEnv(process.argv[1]); const child=spawnSync(process.execPath,['--input-type=commonjs','-e',${JSON.stringify(childScript)},process.argv[1]],{env,encoding:'utf8'}); process.stdout.write(child.stdout); process.stderr.write(child.stderr); process.exitCode=child.status;`;
      const result = spawnSync(process.execPath, ["--input-type=module", "-e", script, folder], { encoding: "utf8", env: { ...process.env, DATABASE_URL: "postgresql://unrelated/db", DB_NAME: "ambient-db" } });
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({ database: "postgresql://localhost/kontura", smtp: "smtp://host/p$ss" });
      expect(readFileSync(path.join(folder, ".env.local"), "utf8")).toBe(contents);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
