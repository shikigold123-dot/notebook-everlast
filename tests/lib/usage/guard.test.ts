// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../../helpers/db";
import type { Db } from "@/db";
import { incrementUsage } from "@/db/repo/usage";
import {
  consumeDailyUsage,
  globalDayScope,
  UsageLimitExceededError,
  visitorDayScope,
} from "@/lib/usage/guard";

const VISITOR = "aaaaaaaa-0000-4000-8000-000000000001";

let db: Db;

beforeEach(async () => {
  db = (await createTestDb()) as unknown as Db;
  delete process.env.LIMIT_CHAT_PER_VISITOR_DAY;
  delete process.env.LIMIT_AUDIO_GLOBAL_DAY;
  delete process.env.DAILY_BUDGET_CENTS;
});

afterEach(() => {
  delete process.env.LIMIT_CHAT_PER_VISITOR_DAY;
  delete process.env.LIMIT_AUDIO_GLOBAL_DAY;
  delete process.env.DAILY_BUDGET_CENTS;
});

describe("Usage-Guard", () => {
  it("zählt Besucher-Nutzung pro Tag", async () => {
    process.env.LIMIT_CHAT_PER_VISITOR_DAY = "2";

    await expect(consumeDailyUsage(db, VISITOR, "chat")).resolves.toBe(1);
    await expect(consumeDailyUsage(db, VISITOR, "chat")).resolves.toBe(2);
    await expect(consumeDailyUsage(db, VISITOR, "chat")).rejects.toThrow(
      UsageLimitExceededError
    );
  });

  it("setzt Audio zusätzlich gegen das globale Tageslimit", async () => {
    process.env.LIMIT_AUDIO_GLOBAL_DAY = "1";

    await consumeDailyUsage(db, VISITOR, "audio");
    await expect(
      consumeDailyUsage(db, "bbbbbbbb-0000-4000-8000-000000000002", "audio")
    ).rejects.toThrow("Globales Tageslimit erreicht");
  });

  it("blockiert bei erreichtem globalen Tagesbudget", async () => {
    process.env.DAILY_BUDGET_CENTS = "10";
    await incrementUsage(db, globalDayScope(), "est_cost_cents", 10);

    await expect(consumeDailyUsage(db, VISITOR, "chat")).rejects.toThrow(
      "globale Tagesbudget"
    );
  });

  it("bildet stabile Scope-Schlüssel", () => {
    const date = new Date("2026-07-08T12:00:00.000Z");
    expect(visitorDayScope(VISITOR, date)).toBe(
      `visitor:${VISITOR}:2026-07-08`
    );
    expect(globalDayScope(date)).toBe("global:2026-07-08");
  });
});
