import type { ArtifactKind } from "@/db/repo/artifacts";
import type { ChatSource } from "@/lib/chat/openrouter";

export class ArtifactGenerationError extends Error {
  constructor(
    message = "Artefakt konnte nicht generiert werden — bitte später nochmal versuchen."
  ) {
    super(message);
  }
}

const TYPE_LABELS: Record<ArtifactKind, string> = {
  study_guide: "Study Guide",
  faq: "FAQ",
  timeline: "Timeline",
  briefing: "Briefing",
  mindmap: "Mind Map",
};

const SCHEMAS: Record<ArtifactKind, string> = {
  study_guide:
    '{"title":"string","sections":[{"heading":"string","bullets":["string"]}],"quiz":[{"question":"string","answer":"string"}],"glossary":[{"term":"string","definition":"string"}]}',
  faq: '{"items":[{"question":"string","answer":"string"}]}',
  timeline:
    '{"events":[{"date_label":"string","title":"string","description":"string"}]}',
  briefing:
    '{"summary":"string","key_points":["string"],"quotes":["string"],"open_questions":["string"]}',
  mindmap:
    '{"label":"string","children":[{"label":"string","children":[{"label":"string","children":[]}]}]}',
};

function getApiKey() {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new ArtifactGenerationError(
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

export function buildArtifactMessages(type: ArtifactKind, sources: ChatSource[]) {
  return [
    {
      role: "system",
      content:
        "Du bist Everlast Studio. Erzeuge deutsche Lernartefakte ausschließlich aus den bereitgestellten Quellen. " +
        "Antworte ausschließlich mit gültigem JSON, ohne Markdown und ohne Codeblock.",
    },
    {
      role: "user",
      content:
        `Artefakt: ${TYPE_LABELS[type]}\n` +
        `JSON-Schema: ${SCHEMAS[type]}\n\n` +
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

export function parseArtifactJson(raw: string): unknown {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new ArtifactGenerationError(
      "Artefakt-Antwort war kein gültiges JSON — bitte erneut versuchen."
    );
  }
}

export async function generateArtifactContent({
  type,
  sources,
}: {
  type: ArtifactKind;
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
      messages: buildArtifactMessages(type, sources),
      response_format: { type: "json_object" },
      max_tokens: 1800,
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    throw new ArtifactGenerationError();
  }

  const json = (await response.json()) as OpenRouterResponse;
  const content = textFromContent(json.choices?.[0]?.message?.content).trim();
  if (!content) {
    throw new ArtifactGenerationError();
  }
  return parseArtifactJson(content);
}
