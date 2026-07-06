// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { LIMITS } from "@/lib/limits";

afterEach(() => {
  delete process.env.LIMIT_NOTEBOOKS_PER_VISITOR;
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
});
