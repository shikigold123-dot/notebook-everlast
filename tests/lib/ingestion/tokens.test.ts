// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const countTokensMock = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(function() {
    return {
      messages: { countTokens: countTokensMock },
    };
  }),
}));

import { countTokens } from "@/lib/ingestion/tokens";

beforeEach(() => {
  countTokensMock.mockReset();
  process.env.ANTHROPIC_API_KEY = "test-key";
});

describe("countTokens", () => {
  it("liefert die Token-Zahl der Claude API zurück", async () => {
    countTokensMock.mockResolvedValue({ input_tokens: 42 });
    const result = await countTokens("Hallo Welt");
    expect(result).toBe(42);
    expect(countTokensMock).toHaveBeenCalledWith({
      model: "claude-opus-4-8",
      messages: [{ role: "user", content: "Hallo Welt" }],
    });
  });

  it("wirft einen Fehler ohne ANTHROPIC_API_KEY", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(countTokens("Text")).rejects.toThrow(
      "ANTHROPIC_API_KEY fehlt"
    );
  });
});
