import type { NextConfig } from "next";

const prod = process.env.NODE_ENV === "production";

// shortcut: 'unsafe-inline' for scripts, because Next's inline bootstrap and iyzico's checkout snippet are not nonce-aware here;
// move to a nonce-based policy (proxy.ts) before handling anything more sensitive than this app's own pages.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${prod ? "" : " 'unsafe-eval'"} https://*.iyzipay.com`,
  "style-src 'self' 'unsafe-inline' https://*.iyzipay.com",
  "img-src 'self' data: blob: https://*.iyzipay.com",
  "font-src 'self' data:",
  `connect-src 'self' https://*.iyzipay.com${prod ? "" : " ws:"}`,
  "frame-src https://*.iyzipay.com",
  "form-action 'self' https://*.iyzipay.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const cloudflare = process.env.KONTURA_TARGET === "cloudflare";

const nextConfig: NextConfig = {
  distDir: process.env.KONTURA_E2E === "true" ? ".next-e2e" : ".next",
  // cacheComponents / partialPrefetching are off on purpose: every screen is per-tenant and reads the session cookie.
  serverExternalPackages: cloudflare ? [] : ["@electric-sql/pglite"],
  ...(cloudflare ? { turbopack: { resolveAlias: { "@electric-sql/pglite": "./src/server/no-embedded-db.ts" } } } : {}),
  poweredByHeader: false,
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ...(prod ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
      ],
    }];
  },
};

export default nextConfig;
