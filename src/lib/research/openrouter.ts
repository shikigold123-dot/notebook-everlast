export class ResearchGenerationError extends Error {
  constructor(message = "Recherche konnte nicht erstellt werden — bitte später nochmal versuchen.") {
    super(message);
  }
}

type OpenRouterContent = string | { type?: string; text?: string }[] | undefined;

type OpenRouterResponse = {
  citations?: string[];
  choices?: {
    message?: {
      content?: OpenRouterContent;
      annotations?: unknown;
    };
  }[];
};

export type ResearchFoundSource = {
  url: string;
  title?: string;
};

export function getResearchModel() {
  return (
    process.env.OPENROUTER_RESEARCH_MODEL ?? "perplexity/sonar-deep-research"
  );
}

function getApiKey() {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new ResearchGenerationError(
      "OPENROUTER_API_KEY fehlt — bitte in .env.local eintragen."
    );
  }
  return process.env.OPENROUTER_API_KEY;
}

export function buildResearchMessages(query: string) {
  return [
    {
      role: "system",
      content:
        "Du bist Everlast Deep Research. Recherchiere im Web gründlich und antworte auf Deutsch. " +
        "Erstelle einen belastbaren, quellenorientierten Recherchebericht mit klarem Titel, Kurzfazit, " +
        "wichtigsten Erkenntnissen, offenen Punkten und einer Quellenliste mit URLs. " +
        "Trenne Fakten sauber von Einschätzungen und nenne Unsicherheiten ausdrücklich.",
    },
    {
      role: "user",
      content: `Recherchefrage:\n${query}`,
    },
  ];
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

function titleFromReport(report: string, query: string) {
  const heading = report
    .split("\n")
    .map((line) => line.trim())
    .find((line) => /^#{1,3}\s+\S/.test(line));
  if (heading) return heading.replace(/^#{1,3}\s+/, "").slice(0, 160);
  return `Recherche: ${query.slice(0, 120)}`;
}

function cleanUrl(raw: string) {
  const trimmed = raw.trim().replace(/[),.;\]\s]+$/g, "");
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function citationTitleFromAnnotation(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const title = record.title;
  return typeof title === "string" && title.trim()
    ? title.trim().slice(0, 180)
    : undefined;
}

export function extractResearchFoundSources({
  citations,
  annotations,
  content,
}: {
  citations?: string[];
  annotations?: unknown;
  content?: string;
}): ResearchFoundSource[] {
  const byUrl = new Map<string, ResearchFoundSource>();

  function add(rawUrl: unknown, title?: string) {
    if (typeof rawUrl !== "string") return;
    const url = cleanUrl(rawUrl);
    if (!url) return;
    const existing = byUrl.get(url);
    if (existing) {
      if (!existing.title && title) existing.title = title;
      return;
    }
    byUrl.set(url, title ? { url, title } : { url });
  }

  for (const citation of citations ?? []) {
    add(citation);
  }

  if (Array.isArray(annotations)) {
    for (const annotation of annotations) {
      if (!annotation || typeof annotation !== "object") continue;
      const record = annotation as Record<string, unknown>;
      const urlCitation = record.url_citation;
      if (urlCitation && typeof urlCitation === "object") {
        const citation = urlCitation as Record<string, unknown>;
        add(citation.url, citationTitleFromAnnotation(citation));
      } else {
        add(record.url, citationTitleFromAnnotation(record));
      }
    }
  }

  for (const match of content?.matchAll(/https?:\/\/[^\s)\]]+/g) ?? []) {
    add(match[0]);
  }

  return [...byUrl.values()];
}

export async function generateResearchReport({ query }: { query: string }) {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    throw new ResearchGenerationError("Recherchefrage darf nicht leer sein.");
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${getApiKey()}`,
      "content-type": "application/json",
      "x-title": "Everlast",
    },
    body: JSON.stringify({
      model: getResearchModel(),
      messages: buildResearchMessages(cleanQuery),
      max_tokens: 4000,
      temperature: 0.2,
      web_search_options: {
        search_context_size: "high",
      },
    }),
  });

  if (!response.ok) {
    throw new ResearchGenerationError();
  }

  const json = (await response.json()) as OpenRouterResponse;
  const content = textFromContent(json.choices?.[0]?.message?.content).trim();
  if (!content) {
    throw new ResearchGenerationError();
  }

  const annotations = json.choices?.[0]?.message?.annotations ?? null;
  const foundSources = extractResearchFoundSources({
    citations: json.citations,
    annotations,
    content,
  });

  return {
    title: titleFromReport(content, cleanQuery),
    content,
    meta: {
      query: cleanQuery,
      model: getResearchModel(),
      citations: foundSources.map((source) => source.url),
      foundSources,
      annotations,
    },
  };
}
