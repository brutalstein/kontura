import { constants, copyFileSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { createRequire } from "node:module";
import { setTimeout } from "node:timers/promises";

/** @param {Record<string, string | undefined>} ambient @param {Record<string, string>} local @returns {NodeJS.ProcessEnv} */
export function developmentEnv(ambient, local) {
  return {
    ...ambient, ...local, NODE_ENV: "development",
    // Only an explicit local setting may select PostgreSQL. Never migrate an unrelated ambient database.
    DATABASE_URL: local.DATABASE_URL ?? "",
    PGLITE_DATA_DIR: local.PGLITE_DATA_DIR ?? "",
    DB_MIGRATE_ON_START: "true",
    COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
  };
}

/** Startup-only: use Next's own dotenv expansion after dependencies have been installed. @param {string} directory */
export function loadDevelopmentEnv(directory) {
  const contents = readFileSync(path.join(directory, ".env.local"), "utf8");
  Object.assign(process.env, developmentEnv(process.env, {}));
  for (const key of Object.keys(parseEnv(contents))) delete process.env[key];
  const require = createRequire(import.meta.url);
  const nextEnv = createRequire(require.resolve("next/package.json"))("@next/env");
  // Load every Next env file once and retain its processed marker, including in
  // child processes, so an escaped dollar in a password is never expanded twice.
  const { combinedEnv: loaded } = nextEnv.loadEnvConfig(directory, true, console, true);
  return developmentEnv(loaded, { DATABASE_URL: loaded.DATABASE_URL ?? "", PGLITE_DATA_DIR: loaded.PGLITE_DATA_DIR ?? "" });
}

async function main() {
  if (Number(process.versions.node.split(".")[0]) < 24) throw new Error("Node.js 24 veya üzerini kurun.");
  process.chdir(path.resolve(import.meta.dirname, ".."));
  try { copyFileSync(".env.example", ".env.local", constants.COPYFILE_EXCL); }
  catch (error) { if (error.code !== "EEXIST") throw error; }
  // Do not silently switch ports: origin checks and public links need the configured address.
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", () => reject(new Error("3000 portu dolu. Mevcut sunucuyu durdurup tekrar deneyin.")));
    probe.listen(3000, "127.0.0.1", () => probe.close(resolve));
  });
  console.log("[dev] Bağımlılıklar kontrol ediliyor (pnpm kilit dosyası)...");
  const windows = process.platform === "win32";
  const install = spawnSync(windows ? "cmd.exe" : "corepack", windows ? ["/d", "/s", "/c", "corepack pnpm install --frozen-lockfile"] : ["pnpm", "install", "--frozen-lockfile"], {
    env: developmentEnv(process.env, {}), stdio: "inherit", windowsHide: true,
  });
  if (install.error || install.status !== 0) throw new Error("Bağımlılıklar kurulamadı. Node.js 24 ile gelen Corepack kurulu ve erişilebilir olmalı.");
  const env = loadDevelopmentEnv(process.cwd());
  console.log(`[dev] Veritabanı: ${env.DATABASE_URL ? ".env.local PostgreSQL" : ".data/pglite (kalıcı yerel veri)"}`);
  console.log(`[dev] E-posta: ${env.SMTP_URL ? "SMTP yapılandırıldı" : "konsol bağlantıları; gerçek e-posta gönderilmez"}`);
  console.log(`[dev] Ödeme: ${env.IYZICO_API_KEY && env.IYZICO_SECRET_KEY ? "iyzico yapılandırıldı" : env.BILLING_TEST_MODE === "true" ? "TEST MODU; tahsilat yapılmaz" : "kapalı; deneme hesabıyla çalışabilirsiniz"}`);
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "3000"], { env, stdio: "inherit", windowsHide: true });
  let exited = false, stopping = false;
  const done = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => { exited = true; resolve(code ?? (stopping ? 0 : 1)); });
  });
  const stop = () => {
    stopping = true;
    if (exited) return;
    if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    else child.kill("SIGTERM");
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    const deadline = Date.now() + 180_000;
    let ready = false;
    while (!exited && !stopping && Date.now() < deadline) {
      try {
        const response = await fetch("http://127.0.0.1:3000/api/health", { signal: AbortSignal.timeout(3000) });
        if (response.ok) { ready = true; break; }
      } catch { /* The server is still starting. */ }
      await setTimeout(500);
    }
    if (!ready && !stopping) {
      stop();
      await done;
      throw new Error("Uygulama/veritabanı hazır olmadı. Yukarıdaki sunucu hatasını kontrol edin.");
    }
    if (ready) console.log("\n[dev] Hazır: http://localhost:3000 — kayıt olup gerçek teklif/sipariş işlemleri yapabilirsiniz. Durdur: Ctrl+C\n");
    process.exitCode = stopping ? 0 : Number(await done);
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`[dev] ${error.message}`); process.exitCode = 1; });
}
