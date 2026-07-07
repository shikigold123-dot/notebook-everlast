// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { LIMITS } from "@/lib/limits";

afterEach(() => {
  delete process.env.LIMIT_NOTEBOOKS_PER_VISITOR;
  delete process.env.LIMIT_AUDIO_PER_VISITOR_DAY;
  delete process.env.LIMIT_AUDIO_GLOBAL_DAY;
  delete process.env.DAILY_BUDGET_CENTS;
});

describe("LIMITS", () => {
  it("liefert den Spec-Default ohne Env-Variable", () => {
    expect(LIMITS.notebooksPerVisitor).toBe(5);
  });

  it("liest den Wert aus der Env-Variable", () => {
    process.env.LIMIT_NOTEBOOKS_PER_VISITOR = "9";
    expect(LIMITS.notebooksPerVisitor).toBe(9);
  });

  it("fällt bei unbrauchbarem Env-Wert auf den Default zurück", () => {
    process.env.LIMIT_NOTEBOOKS_PER_VISITOR = "quatsch";
    expect(LIMITS.notebooksPerVisitor).toBe(5);
  });

  it("liefert Defaults für Audio und Tagesbudget", () => {
    expect(LIMITS.audioPerVisitorDay).toBe(2);
    expect(LIMITS.audioGlobalDay).toBe(10);
    expect(LIMITS.dailyBudgetCents).toBe(0);
  });
});
