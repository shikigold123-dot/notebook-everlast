import type { AudioScriptTurn } from "@/db/repo/audio";
import type { ChatSource } from "@/lib/chat/openrouter";
import type { DetailLevel } from "@/lib/generation/customization";

export class AudioGenerationError extends Error {
  constructor(
    message = "Audio Overview konnte nicht vorbereitet werden — bitte später nochmal versuchen."
  ) {
    super(message);
  }
}

export type AudioCustomization = {
  /** Steuert die Ziel-Länge der Folge. */
  detailLevel?: DetailLevel;
  customInstructions?: string;
  speakerA?: string;
  speakerB?: string;
};

const AUDIO_LENGTH_TEXT: Record<DetailLevel, string> = {
  brief: "16 bis 24 Turns, mindestens 380 Wörter, ideal 2 bis 3 Minuten Sprechzeit",
  standard:
    "38 bis 52 Turns, mindestens 950 Wörter, mindestens 5 Minuten und ideal 5 bis 7 Minuten Sprechzeit",
  detailed:
    "60 bis 80 Turns, mindestens 1500 Wörter, ideal 10 bis 13 Minuten Sprechzeit",
};

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

export function buildAudioMessages(
  sources: ChatSource[],
  customization: AudioCustomization = {}
) {
  const speakerA = customization.speakerA?.trim() || "eine souveräne Moderatorin";
  const speakerB = customization.speakerB?.trim() || "ein erklärender Experte";
  const custom = customization.customInstructions?.trim();
  const lengthText = AUDIO_LENGTH_TEXT[customization.detailLevel ?? "standard"];

  return [
    {
      role: "system",
      content:
        "Du bist Everlast Podcast Studio. Schreibe ein deutsches Podcast-Dialogskript ausschließlich aus den Quellen. " +
        `Speaker A ist ${speakerA}, Speaker B ist ${speakerB}. ` +
        "Die Folge soll wie ein echter, ruhiger Wissenspodcast klingen: kurzer Hook, natürliche Übergänge, Rückfragen, Einordnung, Fazit. " +
        "Antworte ausschließlich mit gültigem JSON, ohne Markdown und ohne Codeblock." +
        (custom ? ` Zusätzliche Nutzer-Anweisung: "${custom}"` : ""),
    },
    {
      role: "user",
      content:
        'JSON-Schema: {"turns":[{"speaker":"A|B","text":"string"}]}\n' +
        `Anforderungen: ${lengthText}, ` +
        "natürlicher Podcast-Dialog, konkrete Quelleninhalte, keine erfundenen Fakten, keine Quellenlabels laut vorlesen.\n\n" +
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

function maxTokensFor(detailLevel?: DetailLevel) {
  if (detailLevel === "detailed") return 9500;
  if (detailLevel === "brief") return 3200;
  return 6500;
}

export async function generateAudioScript({
  sources,
  customization = {},
}: {
  sources: ChatSource[];
  customization?: AudioCustomization;
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
      messages: buildAudioMessages(sources, customization),
      response_format: { type: "json_object" },
      max_tokens: maxTokensFor(customization.detailLevel),
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
