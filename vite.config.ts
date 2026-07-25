import vinext from "vinext";
import { defineConfig } from "vite";

// Cloudflare bindings. The Vite plugin writes these straight into the generated
// `dist/server/wrangler.json`, which is what `wrangler deploy` publishes, so
// whatever is declared here is also what production gets. There is deliberately
// no separate wrangler.toml.

// Miniflare ignores the id locally and just creates a database, so the
// placeholder is fine for dev. Deploying against it would silently bind a
// database that does not exist, so set these before shipping:
//
//   npx wrangler d1 create bounce-d1     # prints the real id
//   CLOUDFLARE_D1_DATABASE_ID=<id> npm run deploy
//
// Kept in the environment rather than committed because the id identifies a
// real resource in a specific account.
const PLACEHOLDER_D1_DATABASE_ID = "00000000-0000-4000-8000-000000000000";
const d1DatabaseId = process.env.CLOUDFLARE_D1_DATABASE_ID ?? PLACEHOLDER_D1_DATABASE_ID;
const d1DatabaseName = process.env.CLOUDFLARE_D1_DATABASE_NAME ?? "bounce-d1";

if (process.env.NODE_ENV === "production" && d1DatabaseId === PLACEHOLDER_D1_DATABASE_ID) {
  // A warning, not a throw: `npm run build` is also how CI and local smoke
  // checks run, and neither needs a real database.
  console.warn(
    "\n[bounce] Building with the placeholder D1 database id.\n" +
      "         Set CLOUDFLARE_D1_DATABASE_ID before `wrangler deploy`, or the\n" +
      "         deployed worker will bind a database that does not exist.\n",
  );
}

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: [
    {
      binding: "DB",
      database_name: d1DatabaseName,
      database_id: d1DatabaseId,
    },
  ],
  // One Durable Object per live room. It is the strongly-consistent authority
  // for "what is happening in this room right now"; D1 above is the archive.
  durable_objects: {
    bindings: [{ name: "ROOM_SESSION", class_name: "RoomSession" }],
  },
  // new_sqlite_classes (not new_classes) so the object gets SQLite-backed
  // storage, which is what Hibernatable WebSockets and drizzle-orm's
  // durable-sqlite driver both expect.
  migrations: [{ tag: "v1", new_sqlite_classes: ["RoomSession"] }],
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
