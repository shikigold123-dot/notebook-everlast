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

export function estimateTokens(text: string): number {
  // OpenRouter bietet keinen Claude-kompatiblen count_tokens-Endpunkt.
  // Für Limits reicht eine konservative lokale Näherung: Deutsche/englische
  // Fließtexte liegen grob bei 3-5 Zeichen pro Token; 4 ist praktikabel.
  return Math.max(1, Math.ceil(text.length / 4));
}

export async function countTokens(text: string): Promise<number> {
  if (!process.env.ANTHROPIC_API_KEY && process.env.OPENROUTER_API_KEY) {
    return estimateTokens(text);
  }

  const client = getClient();
  const result = await client.messages.countTokens({
    model: "claude-opus-4-8",
    messages: [{ role: "user", content: text }],
  });
  return result.input_tokens;
}
