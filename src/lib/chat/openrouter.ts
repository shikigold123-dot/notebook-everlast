import type { ChatCitation } from "@/db/repo/chat";

export type ChatSource = {
  id: string;
  label: string;
  title: string;
  content: string;
};

export type ChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export class ChatGenerationError extends Error {
  constructor(message = "Antwort konnte nicht generiert werden — bitte später nochmal versuchen.") {
    super(message);
  }
}

function getModel() {
  return process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash";
}

function getApiKey() {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new ChatGenerationError(
      "OPENROUTER_API_KEY fehlt — bitte in .env.local eintragen."
    );
  }
  return process.env.OPENROUTER_API_KEY;
}

function sourceBlock(source: ChatSource) {
  return `[${source.label}] ${source.title}\n${source.content}`;
}

export function buildChatMessages(
  sources: ChatSource[],
  history: ChatHistoryMessage[],
  question: string
) {
  const sourceText = sources.map(sourceBlock).join("\n\n---\n\n");
  const recentHistory = history.slice(-10);

  return [
    {
      role: "system",
      content:
        "Du bist Everlast, ein deutscher Quellen-Assistent. Antworte knapp, präzise und nur mit Informationen aus den bereitgestellten Quellen. " +
        "Jede konkrete Aussage braucht mindestens eine Quellenmarke im Format [S-01]. Wenn die Quellen nicht reichen, sag das klar.",
    },
    {
      role: "user",
      content: `Quellen:\n\n${sourceText}`,
    },
    ...recentHistory.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    {
      role: "user",
      content: question,
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

export async function generateChatAnswer({
  sources,
  history,
  question,
}: {
  sources: ChatSource[];
  history: ChatHistoryMessage[];
  question: string;
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
      messages: buildChatMessages(sources, history, question),
      max_tokens: 1200,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    throw new ChatGenerationError();
  }

  const json = (await response.json()) as OpenRouterResponse;
  const answer = textFromContent(json.choices?.[0]?.message?.content).trim();
  if (!answer) {
    throw new ChatGenerationError();
  }
  return answer;
}

export function extractCitations(
  answer: string,
  sources: ChatSource[]
): ChatCitation[] {
  const byLabel = new Map(sources.map((source) => [source.label, source]));
  const labels = new Set<string>();
  for (const match of answer.matchAll(/\[(S-\d{2})\]/g)) {
    labels.add(match[1]);
  }

  return [...labels].flatMap((label) => {
    const source = byLabel.get(label);
    return source
      ? [{ sourceId: source.id, label: source.label, title: source.title }]
      : [];
  });
}
