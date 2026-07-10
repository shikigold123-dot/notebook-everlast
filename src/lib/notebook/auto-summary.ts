import type { Db } from "@/db";
import { createChatMessage } from "@/db/repo/chat";
import { listSources } from "@/db/repo/sources";
import { isUsableContextSource } from "@/lib/sources/context";

type SummarySource = {
  label: string;
  title: string;
  type: string;
  content: string;
};

type OpenRouterContent = string | { type?: string; text?: string }[] | undefined;

type OpenRouterResponse = {
  choices?: {
    message?: {
      content?: OpenRouterContent;
    };
  }[];
};

export class NotebookSummaryError extends Error {
  constructor(message = "Automatische Zusammenfassung konnte nicht erstellt werden.") {
    super(message);
  }
}

function getModel() {
  return process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash";
}

function getApiKey() {
  return process.env.OPENROUTER_API_KEY?.trim() || null;
}

function textFromContent(content: OpenRouterContent) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part.type === "text" || !part.type ? part.text ?? "" : ""))
      .join("");
  }
  return "";
}

function sourceBlock(source: SummarySource) {
  return `[${source.label}] ${source.title} (${source.type})\n${source.content}`;
}

export function buildNotebookSummaryMessages(sources: SummarySource[]) {
  const sourceText = sources.map(sourceBlock).join("\n\n---\n\n");
  return [
    {
      role: "system",
      content:
        "Du bist Everlast. Erstelle nach einer neuen Quelle automatisch eine kurze deutsche Notebook-Zusammenfassung. " +
        "Beschreibe, worum es in diesem Notebook insgesamt geht, welche Hauptthemen sichtbar sind und welche nächsten Fragen naheliegen. " +
        "Nutze nur die bereitgestellten Quellen. Antworte kompakt, hilfreich und ohne erfundene Details.",
    },
    {
      role: "user",
      content: `Aktuelle Quellen:\n\n${sourceText}`,
    },
  ];
}

export function buildSummarySources(
  sources: Awaited<ReturnType<typeof listSources>>
): SummarySource[] {
  let remainingChars = 14_000;

  return sources
    .filter(isUsableContextSource)
    .map((source, index) => {
      const content = (source.content ?? "").trim();
      const sliceLength = Math.min(3_000, remainingChars);
      remainingChars -= sliceLength;
      return {
        label: `S-${String(index + 1).padStart(2, "0")}`,
        title: source.title,
        type: source.type,
        content: content.slice(0, sliceLength),
      };
    })
    .filter((source) => source.content.length > 0 && remainingChars >= 0);
}

export async function generateNotebookSummary(sources: SummarySource[]) {
  const apiKey = getApiKey();
  if (!apiKey || sources.length === 0) return null;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "x-title": "Everlast",
    },
    body: JSON.stringify({
      model: getModel(),
      messages: buildNotebookSummaryMessages(sources),
      max_tokens: 700,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    throw new NotebookSummaryError();
  }

  const json = (await response.json()) as OpenRouterResponse;
  const summary = textFromContent(json.choices?.[0]?.message?.content).trim();
  if (!summary) {
    throw new NotebookSummaryError();
  }
  return summary;
}

export async function writeNotebookAutoSummary(db: Db, notebookId: string) {
  const sources = buildSummarySources(await listSources(db, notebookId));
  const summary = await generateNotebookSummary(sources);
  if (!summary) return null;

  return createChatMessage(
    db,
    notebookId,
    "assistant",
    `Automatische Notebook-Zusammenfassung\n\n${summary}`
  );
}
