// @vitest-environment node
import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/openrouter/models/route";
import { CURATED_CHAT_MODELS } from "@/lib/openrouter/chat-models";

describe("GET /api/openrouter/models", () => {
  it("liefert nur die kuratierte Chat-Modellliste", async () => {
    const res = await GET();
    const json = await res.json();

    expect(json.models).toEqual(CURATED_CHAT_MODELS);
    expect(json.models.map((model: { id: string }) => model.id)).toEqual([
      "deepseek/deepseek-v4-flash",
      "google/gemini-3.1-flash-lite",
      "google/gemini-2.5-flash",
      "qwen/qwen3.6-flash",
      "deepseek/deepseek-chat",
      "meta-llama/llama-3.3-70b-instruct",
    ]);
  });
});
