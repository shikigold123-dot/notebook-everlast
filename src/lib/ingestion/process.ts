import type { Db } from "@/db";
import {
  getReadyTokenTotal,
  getSource,
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
        )} pro Dossier.`
      );
      return;
    }

    await markReady(db, sourceId, { content, tokenCount, meta, title });
  } catch (err) {
    const message =
      err instanceof IngestionError
        ? err.message
        : "Die Verarbeitung ist unerwartet fehlgeschlagen — bitte erneut versuchen.";
    await markError(db, sourceId, message);
  }
}
