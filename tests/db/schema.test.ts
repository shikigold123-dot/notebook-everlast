// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createTestDb } from "../helpers/db";
import { visitor, notebook, usageCounter } from "@/db/schema";
import { eq } from "drizzle-orm";

describe("Schema", () => {
  it("legt Visitor und Notebook an und liest sie zurück", async () => {
    const db = await createTestDb();
    const [v] = await db.insert(visitor).values({}).returning();
    const [nb] = await db
      .insert(notebook)
      .values({ visitorId: v.id, title: "Kant" })
      .returning();

    const rows = await db
      .select()
      .from(notebook)
      .where(eq(notebook.visitorId, v.id));

    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Kant");
    expect(rows[0].isDemo).toBe(false);
    expect(nb.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("erzwingt den zusammengesetzten Primärschlüssel auf usage_counter", async () => {
    const db = await createTestDb();
    await db
      .insert(usageCounter)
      .values({ scope: "global:2026-07-06", metric: "chat", value: 1 });

    await expect(
      db
        .insert(usageCounter)
        .values({ scope: "global:2026-07-06", metric: "chat", value: 2 })
    ).rejects.toThrow();
  });
});
