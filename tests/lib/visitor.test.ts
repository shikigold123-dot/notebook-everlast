// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createTestDb } from "../helpers/db";
import { ensureVisitor, readVisitorId, UUID_RE } from "@/lib/visitor";
import { visitor } from "@/db/schema";
import type { Db } from "@/db";

const VALID_ID = "6f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8";

describe("ensureVisitor", () => {
  it("legt die Zeile an und ist idempotent", async () => {
    const db = (await createTestDb()) as unknown as Db;
    await ensureVisitor(db, VALID_ID);
    await ensureVisitor(db, VALID_ID); // zweiter Aufruf darf nicht werfen
    const rows = await db.select().from(visitor);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(VALID_ID);
  });
});

describe("readVisitorId", () => {
  it("liefert eine gültige UUID aus dem Cookie", () => {
    const store = { get: () => ({ value: VALID_ID }) };
    expect(readVisitorId(store)).toBe(VALID_ID);
  });

  it("liefert null ohne Cookie", () => {
    const store = { get: () => undefined };
    expect(readVisitorId(store)).toBeNull();
  });

  it("liefert null bei ungültigem Format (kein DB-Fehler später)", () => {
    const store = { get: () => ({ value: "nicht-uuid'; DROP TABLE--" }) };
    expect(readVisitorId(store)).toBeNull();
  });
});

describe("UUID_RE", () => {
  it("akzeptiert Großschreibung", () => {
    expect(UUID_RE.test(VALID_ID.toUpperCase())).toBe(true);
  });
});
