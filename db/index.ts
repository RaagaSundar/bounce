import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

type RuntimeBindings = {
  DB?: D1Database;
};

/** Returns the platform database when one is available, otherwise null. */
export function getD1(): D1Database | null {
  try {
    return (env as unknown as RuntimeBindings).DB ?? null;
  } catch {
    // `cloudflare:workers` is intentionally unavailable in some local tooling.
    return null;
  }
}

export function getDb() {
  const d1 = getD1();
  if (!d1) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Check the `d1_databases` entry in vite.config.ts, or run inside `wrangler dev` / a deployed Worker so the binding is injected."
    );
  }

  return drizzle(d1, { schema });
}
