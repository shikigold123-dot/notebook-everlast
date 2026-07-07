import type { AudioScriptTurn } from "@/db/repo/audio";
import type { ChatSource } from "@/lib/chat/openrouter";

export class AudioGenerationError extends Error {
  constructor(
    message = "Audio Overview konnte nicht vorbereitet werden — bitte später nochmal versuchen."
  ) {
    super(message);
  }
}

function getApiKey() {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new AudioGenerationError(
      "OPENROUTER_API_KEY fehlt — bitte in .env.local eintragen."
    );
  }
  return process.env.OPENROUTER_API_KEY;
}

function getModel() {
  return process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash";
}

function sourceBlock(source: ChatSource) {
  return `[${source.label}] ${source.title}\n${source.content}`;
}

export function buildAudioMessages(sources: ChatSource[]) {
  return [
    {
      role: "system",
      content:
        "Du bist Everlast Audio Studio. Schreibe ein deutsches Podcast-Dialogskript ausschließlich aus den Quellen. " +
        "Speaker A ist eine neugierige Moderatorin, Speaker B ein erklärender Experte. " +
        "Antworte ausschließlich mit gültigem JSON, ohne Markdown und ohne Codeblock.",
    },
    {
      role: "user",
      content:
        'JSON-Schema: {"turns":[{"speaker":"A|B","text":"string"}]}\n' +
        "Anforderungen: 8 bis 14 Turns, klarer Einstieg, konkrete Quelleninhalte, keine erfundenen Fakten, maximal 4 Minuten Sprechzeit.\n\n" +
        `Quellen:\n\n${sources.map(sourceBlock).join("\n\n---\n\n")}`,
    },
  ];
}

type OpenRouterResponse = {
  choices?: {
    message?: {
      content?: OpenRouterContent;
    };
  }[];
};

type OpenRouterContent = string | { type?: string; text?: string }[] | undefined;

function textFromContent(content: OpenRouterContent) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part.type === "text" || !part.type ? part.text ?? "" : ""))
      .join("");
  }
  return "";
}

function normalizeTurn(value: unknown): AudioScriptTurn | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const speaker = row.speaker === "B" ? "B" : row.speaker === "A" ? "A" : null;
  const text = typeof row.text === "string" ? row.text.trim() : "";
  if (!speaker || !text) return null;
  return { speaker, text };
}

export function parseAudioScriptJson(raw: string): AudioScriptTurn[] {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new AudioGenerationError(
      "Audio-Skript war kein gültiges JSON — bitte erneut versuchen."
    );
  }

  const rows = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as Record<string, unknown>)?.turns)
      ? ((parsed as Record<string, unknown>).turns as unknown[])
      : [];
  const script = rows.flatMap((row) => {
    const turn = normalizeTurn(row);
    return turn ? [turn] : [];
  });

  if (script.length === 0) {
    throw new AudioGenerationError(
      "Audio-Skript enthielt keine verwertbaren Dialogzeilen."
    );
  }

  return script;
}

export async function generateAudioScript({
  sources,
}: {
  sources: ChatSource[];
}) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${getApiKey()}`,
      "content-type": "application/json",
      "x-title": "Everlast",
    },
    body: JSON.stringify({
      model: getModel(),
      messages: buildAudioMessages(sources),
      response_format: { type: "json_object" },
      max_tokens: 2400,
      temperature: 0.35,
    }),
  });

  if (!response.ok) {
    throw new AudioGenerationError();
  }

  const json = (await response.json()) as OpenRouterResponse;
  const content = textFromContent(json.choices?.[0]?.message?.content).trim();
  if (!content) {
    throw new AudioGenerationError();
  }
  return parseAudioScriptJson(content);
}
