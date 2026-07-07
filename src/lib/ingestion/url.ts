import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";
import { IngestionError } from "./errors";

export type UrlExtractionResult = { title: string; content: string };

export async function extractUrl(
  pageUrl: string
): Promise<UrlExtractionResult> {
  let html: string;
  try {
    const response = await fetch(pageUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    html = await response.text();
  } catch {
    throw new IngestionError("Diese Website konnte nicht geladen werden.");
  }

  const { document } = parseHTML(html);
  const article = new Readability(
    document as unknown as Document
  ).parse();

  const content = article?.textContent?.trim() ?? "";

  // Readability liefert auch für triviale Fragmente (z. B. ein einzelnes
  // <div> ohne Artikelstruktur) ein Ergebnis statt null zurück. Eine
  // Mindestlänge unterscheidet echten Artikelinhalt von solchem Rauschen.
  const MIN_CONTENT_LENGTH = 200;
  if (!article || content.length < MIN_CONTENT_LENGTH) {
    throw new IngestionError("Diese Website konnte nicht gelesen werden.");
  }

  return {
    title: article.title || pageUrl,
    content,
  };
}
