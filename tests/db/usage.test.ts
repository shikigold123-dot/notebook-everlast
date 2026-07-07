// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "../helpers/db";
import type { Db } from "@/db";
import { getUsageValue, incrementUsage } from "@/db/repo/usage";

let db: Db;

beforeEach(async () => {
  db = (await createTestDb()) as unknown as Db;
});

describe("Usage-Repository", () => {
  it("liefert 0 für nicht vorhandene Counter", async () => {
    await expect(getUsageValue(db, "visitor:x:2026-07-08", "chat")).resolves.toBe(0);
  });

  it("legt Counter an und erhöht sie per Upsert", async () => {
    await expect(
      incrementUsage(db, "visitor:x:2026-07-08", "chat")
    ).resolves.toBe(1);
    await expect(
      incrementUsage(db, "visitor:x:2026-07-08", "chat", 2)
    ).resolves.toBe(3);
    await expect(getUsageValue(db, "visitor:x:2026-07-08", "chat")).resolves.toBe(3);
  });
});
