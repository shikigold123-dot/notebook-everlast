export type OpenRouterChatModelOption = {
  id: string;
  name: string;
};

export const DEFAULT_CHAT_MODEL = "deepseek/deepseek-v4-flash";

export const CURATED_CHAT_MODELS: OpenRouterChatModelOption[] = [
  { id: DEFAULT_CHAT_MODEL, name: "DeepSeek V4 Flash" },
  { id: "google/gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite" },
  { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash" },
  { id: "qwen/qwen3.6-flash", name: "Qwen3.6 Flash" },
  { id: "deepseek/deepseek-chat", name: "DeepSeek V3 (Chat)" },
  { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B Instruct" },
];

export const FALLBACK_CHAT_MODELS = CURATED_CHAT_MODELS;

export function normalizeOpenRouterModelId(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 160) return null;
  if (!/^[a-zA-Z0-9_.~:-]+\/[a-zA-Z0-9_.~:-]+$/.test(trimmed)) return null;
  return trimmed;
}
