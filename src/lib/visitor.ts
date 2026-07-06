import { visitor } from "@/db/schema";
import type { Db } from "@/db";

export const VISITOR_COOKIE = "everlast_visitor";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Legt die Visitor-Zeile an, falls sie fehlt (idempotent). */
export async function ensureVisitor(db: Db, id: string): Promise<void> {
  await db.insert(visitor).values({ id }).onConflictDoNothing();
}

/** Liest die Besucher-ID aus dem Cookie-Store; null bei fehlendem/ungültigem Wert. */
export function readVisitorId(cookieStore: {
  get(name: string): { value: string } | undefined;
}): string | null {
  const value = cookieStore.get(VISITOR_COOKIE)?.value;
  if (!value || !UUID_RE.test(value)) return null;
  return value;
}
