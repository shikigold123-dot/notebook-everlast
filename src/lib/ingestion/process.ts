import type { Db } from "@/db";
import {
  createSource,
  getReadyTokenTotal,
  getSource,
  listSources,
  markProcessing,
  markReady,
  markError,
} from "@/db/repo/sources";
import { extractPdf } from "./pdf";
import { extractUrl } from "./url";
import { extractYoutube } from "./youtube";
import { extractAudio } from "./audio";
import { countTokens } from "./tokens";
import { IngestionError } from "./errors";
import { LIMITS } from "@/lib/limits";
import {
  generateResearchReport,
  type ResearchFoundSource,
  ResearchGenerationError,
} from "@/lib/research/openrouter";
import { writeNotebookAutoSummary } from "@/lib/notebook/auto-summary";

function researchQueryFromMeta(meta: unknown, title: string) {
  if (
    meta &&
    typeof meta === "object" &&
    "query" in meta &&
    typeof meta.query === "string"
  ) {
    return meta.query;
  }
  return title.replace(/^Recherche:\s*/, "");
}

function normalizeUrl(raw: string) {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function readResearchFoundSources(meta: unknown): ResearchFoundSource[] {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return [];
  const record = meta as Record<string, unknown>;
  const foundSources = record.foundSources;

  if (Array.isArray(foundSources)) {
    return foundSources
      .map((item) => {
        if (typeof item === "string") return { url: item };
        if (!item || typeof item !== "object") return null;
        const source = item as Record<string, unknown>;
        if (typeof source.url !== "string") return null;
        return {
          url: source.url,
          ...(typeof source.title === "string" && source.title.trim()
            ? { title: source.title.trim() }
            : {}),
        };
      })
      .filter((source): source is ResearchFoundSource => source !== null);
  }

  const citations = record.citations;
  if (!Array.isArray(citations)) return [];
  return citations
    .filter((citation): citation is string => typeof citation === "string")
    .map((url) => ({ url }));
}

async function safeWriteNotebookAutoSummary(db: Db, notebookId: string) {
  try {
    await writeNotebookAutoSummary(db, notebookId);
  } catch {
    // Quellenverarbeitung darf nicht fehlschlagen, nur weil die automatische
    // Chat-Zusammenfassung gerade nicht erzeugt werden konnte.
  }
}

async function autoImportResearchSources(
  db: Db,
  notebookId: string,
  researchSourceId: string,
  meta: unknown
) {
  const candidates = readResearchFoundSources(meta);
  if (candidates.length === 0) return;

  const existingSources = await listSources(db, notebookId);
  const existingUrls = new Set(
    existingSources
      .map((source) => source.originalUrl)
      .filter((url): url is string => typeof url === "string")
      .map(normalizeUrl)
      .filter((url): url is string => url !== null)
  );

  for (const candidate of candidates) {
    const normalizedUrl = normalizeUrl(candidate.url);
    if (!normalizedUrl || existingUrls.has(normalizedUrl)) continue;
    existingUrls.add(normalizedUrl);

    try {
      const created = await createSource(db, notebookId, {
        type: "url",
        title: candidate.title ? candidate.title.slice(0, 160) : "Wird geladen …",
        originalUrl: normalizedUrl,
        meta: { importedFromResearch: researchSourceId },
      });
      await processSource(db, notebookId, created.id);
    } catch {
      break;
    }
  }
}

export async function processSource(
  db: Db,
  notebookId: string,
  sourceId: string
): Promise<void> {
  const src = await getSource(db, notebookId, sourceId);
  if (!src) return;

  await markProcessing(db, sourceId);

  try {
    let content: string;
    let meta: unknown = null;
    let title: string | undefined;

    if (src.type === "pdf") {
      const result = await extractPdf(src.blobUrl!);
      content = result.content;
      meta = result.meta;
    } else if (src.type === "url") {
      const result = await extractUrl(src.originalUrl!);
      content = result.content;
      title = result.title;
    } else if (src.type === "youtube") {
      const result = await extractYoutube(src.originalUrl!);
      content = result.content;
      meta = result.meta;
      title = result.title;
    } else if (src.type === "audio") {
      const result = await extractAudio(src.blobUrl!);
      content = result.content;
      meta = result.meta;
    } else if (src.type === "research") {
      const result = await generateResearchReport({
        query: researchQueryFromMeta(src.meta, src.title),
      });
      content = result.content;
      meta = result.meta;
      title = result.title;
    } else {
      // "text" wird bereits synchron in der API-Route auf ready gesetzt und
      // durchläuft processSource in der Praxis nie (Task 9 ruft diese
      // Funktion nur für pdf/url/youtube/audio auf). Dieser Zweig ist ein
      // defensiver Fallback für "text" oder einen künftigen unbekannten Typ,
      // damit kein Pfad ohne Terminalstatus (ready/error) endet — sonst
      // bliebe die Zeile für immer auf "processing" hängen.
      await markError(db, sourceId, "Unbekannter Quellentyp.");
      return;
    }

    const tokenCount = await countTokens(content);

    const existingTokens = await getReadyTokenTotal(db, notebookId, sourceId);
    if (existingTokens + tokenCount > LIMITS.tokensPerNotebook) {
      await markError(
        db,
        sourceId,
        `Diese Quelle überschreitet mit den vorhandenen Quellen (${(
          existingTokens + tokenCount
        ).toLocaleString(
          "de-DE"
        )} Tokens) das Token-Limit von ${LIMITS.tokensPerNotebook.toLocaleString(
          "de-DE"
        )} pro Notebook.`
      );
      return;
    }

    await markReady(db, sourceId, { content, tokenCount, meta, title });
    if (src.type === "research") {
      await autoImportResearchSources(db, notebookId, sourceId, meta);
    }
    await safeWriteNotebookAutoSummary(db, notebookId);
  } catch (err) {
    const message =
      err instanceof IngestionError || err instanceof ResearchGenerationError
        ? err.message
        : "Die Verarbeitung ist unerwartet fehlgeschlagen — bitte erneut versuchen.";
    await markError(db, sourceId, message);
  }
}
