import type { ArtifactKind } from "@/db/repo/artifacts";
import type { ChatSource } from "@/lib/chat/openrouter";
import type { DetailLevel } from "@/lib/generation/customization";

export class ArtifactGenerationError extends Error {
  constructor(
    message = "Artefakt konnte nicht generiert werden — bitte später nochmal versuchen."
  ) {
    super(message);
  }
}

export type ArtifactCustomization = {
  detailLevel?: DetailLevel;
  customInstructions?: string;
  /** Nur für type "infographic" relevant. */
  visualStyle?: string;
};

const VISUAL_STYLE_INSTRUCTIONS: Record<string, string> = {
  minimal:
    "Minimalistischer, reduzierter Stil mit viel Weißraum und klaren geometrischen Formen.",
  sketchnote:
    "Sketchnote-Stil: handgezeichnet wirkende Linien, Icons und Beschriftungen wie ein visuelles Protokoll.",
  clay:
    "3D-Clay-Stil: weiche, plastisch gerenderte 3D-Objekte wie Knetfiguren, warmes Studiolicht.",
  photo:
    "Fotorealistischer Stil mit realistischen Materialien, Licht und Tiefenschärfe.",
  anime:
    "Anime-/Comic-Stil mit kräftigen Konturen, dynamischer Komposition und lebendigen Farben.",
};

export function isVisualStyleKey(value: unknown): value is keyof typeof VISUAL_STYLE_INSTRUCTIONS {
  return typeof value === "string" && value in VISUAL_STYLE_INSTRUCTIONS;
}

const DETAIL_LEVEL_INSTRUCTIONS: Partial<Record<DetailLevel, string>> = {
  brief: "Halte den Umfang bewusst knapp und auf das Wesentliche reduziert.",
  detailed:
    "Gehe besonders ausführlich vor: mehr Tiefe, mehr Beispiele und mehr Unterpunkte als im Standardfall.",
};

function customizationLines(
  customization: ArtifactCustomization,
  { includeVisualStyle = false }: { includeVisualStyle?: boolean } = {}
): string[] {
  const lines: string[] = [];
  const detailLine =
    customization.detailLevel && DETAIL_LEVEL_INSTRUCTIONS[customization.detailLevel];
  if (detailLine) lines.push(detailLine);

  if (includeVisualStyle && isVisualStyleKey(customization.visualStyle)) {
    lines.push(VISUAL_STYLE_INSTRUCTIONS[customization.visualStyle]);
  }

  const custom = customization.customInstructions?.trim();
  if (custom) lines.push(`Zusätzliche Nutzer-Anweisung: "${custom}"`);

  return lines;
}

const TYPE_LABELS: Record<ArtifactKind, string> = {
  study_guide: "Study Guide",
  faq: "FAQ",
  timeline: "Timeline",
  briefing: "Briefing",
  mindmap: "Mind Map",
  video_overview: "Video Overview",
  presentation: "Präsentation",
  flashcards: "Karteikarten",
  quiz: "Quiz",
  infographic: "Infografik",
  website: "Website",
  data_table: "Datentabelle",
  glossary: "Glossar",
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
  video_overview:
    '{"title":"string","duration_minutes":number,"scenes":[{"timestamp":"mm:ss","headline":"string","narration":"string","visual_prompt":"string","source_refs":["S-01"]}]}',
  presentation:
    '{"title":"string","slides":[{"title":"string","subtitle":"string","bullets":["string"],"speaker_notes":"string","source_refs":["S-01"]}]}',
  flashcards:
    '{"cards":[{"front":"string","back":"string","difficulty":"leicht|mittel|schwer","source_refs":["S-01"]}]}',
  quiz:
    '{"title":"string","questions":[{"question":"string","choices":["string"],"answer_index":number,"explanation":"string","source_refs":["S-01"]}]}',
  infographic:
    '{"title":"string","imageUrl":"data:image/png;base64,... oder https://...","prompt":"string","source_refs":["S-01"]}',
  website:
    '{"title":"string","html":"vollständiges HTML-Dokument als string"}',
  data_table:
    '{"title":"string","columns":["string"],"rows":[["string"]],"notes":["string"],"source_refs":["S-01"]}',
  glossary:
    '{"terms":[{"term":"string","definition":"string","context":"string","source_refs":["S-01"]}]}',
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

function getModelForType(type: ArtifactKind) {
  if (type === "infographic") {
    return (
      process.env.OPENROUTER_INFOGRAPHIC_MODEL ??
      "google/gemini-3.1-flash-lite-image"
    );
  }
  if (type === "website") {
    return process.env.OPENROUTER_WEBSITE_MODEL ?? "deepseek/deepseek-v4-flash";
  }
  return getModel();
}

function sourceBlock(source: ChatSource) {
  return `[${source.label}] ${source.title}\n${source.content}`;
}

export function buildArtifactMessages(
  type: ArtifactKind,
  sources: ChatSource[],
  customization: ArtifactCustomization = {}
) {
  if (type === "infographic") {
    const lines = customizationLines(customization, { includeVisualStyle: true });
    return [
      {
        role: "system",
        content:
          "Du bist Everlast Visual Studio. Erzeuge eine hochwertige deutsche Infografik als Bild aus den bereitgestellten Quellen. " +
          "Nutze klare Hierarchie, lesbare deutsche Beschriftungen, starke Kontraste und keine erfundenen Zahlen. " +
          "Das Ergebnis soll als fertiges Bild ausgegeben werden.",
      },
      {
        role: "user",
        content:
          "Erstelle eine moderne, portfolio-taugliche Infografik zu den Quellen. " +
          "Visualisiere die wichtigsten Aussagen, Zusammenhänge und Zahlen. " +
          "Stil: hochwertiges Everlast-Dossier, klare Karten, dunkle und helle Kontraste, keine überladenen Details." +
          (lines.length ? ` ${lines.join(" ")}` : "") +
          `\n\nQuellen:\n\n${sources.map(sourceBlock).join("\n\n---\n\n")}`,
      },
    ];
  }

  if (type === "website") {
    const lines = customizationLines(customization);
    return [
      {
        role: "system",
        content:
          "Du bist Everlast Web Studio. Erzeuge aus den Quellen eine hochwertige, eigenständige deutsche HTML-Seite. " +
          "Antworte ausschließlich mit gültigem JSON, ohne Markdown und ohne Codeblock.",
      },
      {
        role: "user",
        content:
          `Artefakt: ${TYPE_LABELS[type]}\n` +
          `JSON-Schema: ${SCHEMAS[type]}\n\n` +
          "Anforderungen: vollständiges HTML-Dokument mit inline CSS, responsive Layout, keine externen Skripte, keine externen Fonts, " +
          "prägnante Hero-Sektion, Quellen-/Insight-Sektionen, klare Callouts und ruhiges Premium-Design. " +
          "Nutze nur Fakten aus den Quellen." +
          (lines.length ? ` ${lines.join(" ")}` : "") +
          `\n\nQuellen:\n\n${sources.map(sourceBlock).join("\n\n---\n\n")}`,
      },
    ];
  }

  const lines = customizationLines(customization);
  return [
    {
      role: "system",
      content:
        "Du bist Everlast Studio. Erzeuge deutsche Lernartefakte ausschließlich aus den bereitgestellten Quellen. " +
        "Nutze Quellenlabels in source_refs, sobald ein Schema sie vorsieht. " +
        "Antworte ausschließlich mit gültigem JSON, ohne Markdown und ohne Codeblock.",
    },
    {
      role: "user",
      content:
        `Artefakt: ${TYPE_LABELS[type]}\n` +
        `JSON-Schema: ${SCHEMAS[type]}\n\n` +
        (lines.length ? `${lines.join(" ")}\n\n` : "") +
        `Quellen:\n\n${sources.map(sourceBlock).join("\n\n---\n\n")}`,
    },
  ];
}

type OpenRouterResponse = {
  choices?: {
    message?: {
      content?: OpenRouterContent;
      images?: unknown;
    };
  }[];
};

type OpenRouterContent = string | { type?: string; text?: string }[] | undefined;
type OpenRouterMessage = NonNullable<
  NonNullable<OpenRouterResponse["choices"]>[number]["message"]
>;
type NormalizedMindMap = {
  label: string;
  children: NormalizedMindMap[];
};

function textFromContent(content: OpenRouterContent) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part.type === "text" || !part.type ? part.text ?? "" : ""))
      .join("");
  }
  return "";
}

function stripCodeFence(raw: string) {
  return raw
    .trim()
    .replace(/^```(?:json|html)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

export function parseArtifactJson(raw: string): unknown {
  const cleaned = stripCodeFence(raw);
  const jsonStart = cleaned.indexOf("{");
  const jsonEnd = cleaned.lastIndexOf("}");
  const candidate =
    jsonStart >= 0 && jsonEnd > jsonStart
      ? cleaned.slice(jsonStart, jsonEnd + 1)
      : cleaned;
  try {
    return JSON.parse(candidate);
  } catch {
    throw new ArtifactGenerationError(
      "Artefakt-Antwort war kein gültiges JSON — bitte erneut versuchen."
    );
  }
}

function extractImageUrl(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractImageUrl(item);
      if (found) return found;
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.url === "string" && /^https?:|^data:image\//.test(record.url)) {
    return record.url;
  }
  if (typeof record.image_url === "string") return record.image_url;
  if (record.image_url && typeof record.image_url === "object") {
    const nested = record.image_url as Record<string, unknown>;
    if (typeof nested.url === "string") return nested.url;
  }
  if (typeof record.data === "string" && record.mime_type?.toString().startsWith("image/")) {
    return `data:${record.mime_type};base64,${record.data}`;
  }

  for (const nested of Object.values(record)) {
    const found = extractImageUrl(nested);
    if (found) return found;
  }
  return null;
}

function textFromMessage(message: OpenRouterMessage | undefined) {
  return textFromContent(message?.content).trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeMindMapNode(value: unknown): NormalizedMindMap | null {
  if (!isRecord(value)) return null;

  const label =
    asString(value.label) ||
    asString(value.title) ||
    asString(value.name) ||
    asString(value.topic);
  if (!label) return null;

  const rawChildren =
    Array.isArray(value.children)
      ? value.children
      : Array.isArray(value.nodes)
        ? value.nodes
        : Array.isArray(value.branches)
          ? value.branches
          : [];
  const children = rawChildren
    .map(normalizeMindMapNode)
    .filter((child): child is NormalizedMindMap => Boolean(child));

  return { label, children };
}

function mindMapFromFlatNodes(value: unknown): NormalizedMindMap | null {
  if (!isRecord(value) || !Array.isArray(value.nodes)) return null;

  const nodes = value.nodes.filter(isRecord);
  const byId = new Map(
    nodes.map((node, index) => [
      String(node.id ?? node.key ?? index),
      {
        id: String(node.id ?? node.key ?? index),
        parentId:
          node.parentId ?? node.parent_id ?? node.parent ?? node.source ?? null,
        label:
          asString(node.label) ||
          asString(node.title) ||
          asString(node.name) ||
          `Knoten ${index + 1}`,
        children: [] as unknown[],
      },
    ])
  );

  for (const node of byId.values()) {
    if (node.parentId === null || node.parentId === undefined) continue;
    byId.get(String(node.parentId))?.children.push(node);
  }

  const childIds = new Set(
    [...byId.values()]
      .filter((node) => node.parentId !== null && node.parentId !== undefined)
      .map((node) => node.id)
  );
  const root =
    [...byId.values()].find((node) => !childIds.has(node.id)) ??
    [...byId.values()][0];
  return root ? normalizeMindMapNode(root) : null;
}

function normalizeMindMap(value: unknown): NormalizedMindMap {
  const direct = normalizeMindMapNode(value);
  if (direct) return direct;
  const flat = mindMapFromFlatNodes(value);
  if (flat) return flat;
  if (isRecord(value)) {
    for (const key of ["mindmap", "mind_map", "root", "tree", "map"]) {
      if (key in value) {
        try {
          const nested: NormalizedMindMap = normalizeMindMap(value[key]);
          if (nested) return nested;
        } catch {
          // Try the next common wrapper key before failing the whole artifact.
        }
      }
    }
  }
  throw new ArtifactGenerationError(
    "Mind-Map-Antwort enthielt keinen lesbaren Baum — bitte erneut versuchen."
  );
}

function normalizeArtifactContent(type: ArtifactKind, parsed: unknown) {
  if (type === "mindmap") return normalizeMindMap(parsed);
  if (isRecord(parsed)) return parsed;

  if (Array.isArray(parsed)) {
    if (type === "faq") return { items: parsed };
    if (type === "timeline") return { events: parsed };
    if (type === "presentation") return { slides: parsed };
    if (type === "flashcards") return { cards: parsed };
    if (type === "quiz") return { questions: parsed };
    if (type === "glossary") return { terms: parsed };
  }

  return parsed;
}

function parseWebsiteContent(raw: string) {
  const cleaned = stripCodeFence(raw);
  if (cleaned.startsWith("{")) {
    const parsed = parseArtifactJson(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new ArtifactGenerationError(
        "Website-Antwort war kein gültiges Format — bitte erneut versuchen."
      );
    }
    const record = parsed as Record<string, unknown>;
    const html = typeof record.html === "string" ? record.html.trim() : "";
    if (!html) {
      throw new ArtifactGenerationError(
        "Website-Antwort enthielt kein HTML — bitte erneut versuchen."
      );
    }
    return {
      title:
        typeof record.title === "string" && record.title.trim()
          ? record.title.trim()
          : "Quellen-Website",
      html,
    };
  }

  const htmlStart = cleaned.search(/(?:<!doctype html>|<html[\s>])/i);
  if (htmlStart >= 0) {
    const html = cleaned.slice(htmlStart).trim();
    const title =
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ||
      "Quellen-Website";
    return { title, html };
  }

  const parsed = parseArtifactJson(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ArtifactGenerationError(
      "Website-Antwort war kein gültiges Format — bitte erneut versuchen."
    );
  }
  const record = parsed as Record<string, unknown>;
  const html = typeof record.html === "string" ? record.html.trim() : "";
  if (!html) {
    throw new ArtifactGenerationError(
      "Website-Antwort enthielt kein HTML — bitte erneut versuchen."
    );
  }
  return {
    title:
      typeof record.title === "string" && record.title.trim()
        ? record.title.trim()
      : "Quellen-Website",
    html,
  };
}

function fallbackInfographic(sources: ChatSource[]) {
  const sections = sources.slice(0, 4).map((source) => {
    const firstSentence =
      source.content
        .split(/(?<=[.!?])\s+/)
        .find((sentence) => sentence.trim().length > 20)
        ?.trim() ?? source.content.slice(0, 180).trim();
    return {
      label: source.label,
      metric: source.title,
      description: firstSentence,
    };
  });

  return {
    title: "Infografik",
    layout: "Dossier-Kacheln",
    sections,
    source_refs: sources.map((source) => source.label),
  };
}

function maxTokensFor(type: ArtifactKind, detailLevel?: DetailLevel) {
  if (type === "infographic" || type === "website") return 3200;
  if (detailLevel === "detailed") return 4800;
  if (detailLevel === "brief") return 2000;
  return 3200;
}

export async function generateArtifactContent({
  type,
  sources,
  customization = {},
}: {
  type: ArtifactKind;
  sources: ChatSource[];
  customization?: ArtifactCustomization;
}) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${getApiKey()}`,
      "content-type": "application/json",
      "x-title": "Everlast",
    },
    body: JSON.stringify({
      model: getModelForType(type),
      messages: buildArtifactMessages(type, sources, customization),
      ...(type === "infographic" || type === "website"
        ? {}
        : { response_format: { type: "json_object" } }),
      max_tokens: maxTokensFor(type, customization.detailLevel),
      temperature: type === "infographic" ? 0.35 : 0.1,
    }),
  });

  if (!response.ok) {
    throw new ArtifactGenerationError();
  }

  const json = (await response.json()) as OpenRouterResponse;
  const message = json.choices?.[0]?.message;
  const content = textFromMessage(message);
  const imageUrl = extractImageUrl(message);

  if (type === "infographic") {
    if (!imageUrl) {
      if (content) {
        const parsed = parseArtifactJson(content);
        if (isRecord(parsed) && (parsed.imageUrl || parsed.sections)) {
          return parsed;
        }
      }
      return fallbackInfographic(sources);
    }
    return {
      title: "Infografik",
      imageUrl,
      prompt: buildArtifactMessages(type, sources, customization)[1].content,
      source_refs: sources.map((source) => source.label),
    };
  }

  if (!content) {
    throw new ArtifactGenerationError();
  }
  if (type === "website") return parseWebsiteContent(content);
  return normalizeArtifactContent(type, parseArtifactJson(content));
}
