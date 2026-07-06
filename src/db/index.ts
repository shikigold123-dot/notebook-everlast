import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

/**
 * Treiberunabhängiger DB-Typ: Repositories nehmen `Db` als Parameter,
 * damit Tests eine PGlite-Instanz injizieren können.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

let _db: Db | null = null;

export function getDb(): Db {
  if (!_db) {
    const sql = neon(process.env.DATABASE_URL!);
    _db = drizzle(sql, { schema }) as unknown as Db;
  }
  return _db;
}
