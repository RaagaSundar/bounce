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
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(d1, { schema });
}
