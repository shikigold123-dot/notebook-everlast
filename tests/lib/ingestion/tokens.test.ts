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

import { countTokens, estimateTokens } from "@/lib/ingestion/tokens";

beforeEach(() => {
  countTokensMock.mockReset();
  process.env.ANTHROPIC_API_KEY = "test-key";
  delete process.env.OPENROUTER_API_KEY;
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

  it("nutzt mit OpenRouter-Key eine lokale Token-Schätzung", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    await expect(countTokens("123456789")).resolves.toBe(3);
    expect(countTokensMock).not.toHaveBeenCalled();
  });

  it("wirft einen Fehler ohne ANTHROPIC_API_KEY und ohne OPENROUTER_API_KEY", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    await expect(countTokens("Text")).rejects.toThrow(
      "ANTHROPIC_API_KEY fehlt"
    );
  });
});

describe("estimateTokens", () => {
  it("liefert mindestens ein Token", () => {
    expect(estimateTokens("")).toBe(1);
  });
});
