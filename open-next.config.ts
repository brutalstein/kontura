import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

// Prerendered public pages are served from the Worker's static assets (read-only, no paid storage).
// Every panel and customer screen is rendered per request, so nothing needs revalidation storage.
export default defineCloudflareConfig({ incrementalCache: staticAssetsIncrementalCache });
