import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type DB = PostgresJsDatabase<typeof schema>;
const g = globalThis as unknown as { __db?: DB; __pg?: ReturnType<typeof postgres> };

function getDb(): DB {
  if (!g.__db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    // prepare:false keeps us compatible with transaction-mode poolers (e.g. PgBouncer) if one is added later.
    g.__pg = postgres(url, { prepare: false, max: 10 });
    g.__db = drizzle(g.__pg, { schema });
  }
  return g.__db;
}

/** Lazily-connected Drizzle instance (so `next build` works without a database). */
export const db: DB = new Proxy({} as DB, {
  get(_t, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const v = real[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(real) : v;
  },
});

export async function closeDb() {
  await g.__pg?.end();
  g.__pg = undefined;
  g.__db = undefined;
}

export type { DB };
export { schema };
