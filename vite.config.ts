import vinext from "vinext";
import { defineConfig } from "vite";

// Cloudflare bindings. The Vite plugin writes these straight into the generated
// `dist/server/wrangler.json`, which is what `wrangler deploy` publishes, so
// whatever is declared here is also what production gets. There is deliberately
// no separate wrangler.toml.
//
// TODO(deploy): this id is a placeholder. Create a real D1 database under the
// target Cloudflare account and substitute its id before deploying.
const PLACEHOLDER_D1_DATABASE_ID = "00000000-0000-4000-8000-000000000000";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: [
    {
      binding: "DB",
      database_name: "bounce-d1",
      database_id: PLACEHOLDER_D1_DATABASE_ID,
    },
  ],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    plugins: [
      vinext(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
