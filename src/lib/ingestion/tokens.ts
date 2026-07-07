import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY fehlt — bitte in .env.local eintragen."
    );
  }
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

export async function countTokens(text: string): Promise<number> {
  const client = getClient();
  const result = await client.messages.countTokens({
    model: "claude-opus-4-8",
    messages: [{ role: "user", content: text }],
  });
  return result.input_tokens;
}
