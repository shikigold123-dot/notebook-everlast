import { extractText, getDocumentProxy } from "unpdf";
import { IngestionError } from "./errors";

export type PdfExtractionResult = {
  content: string;
  meta: { pages: { page: number; start: number; end: number }[] };
};

export async function extractPdf(
  blobUrl: string
): Promise<PdfExtractionResult> {
  let buffer: ArrayBuffer;
  try {
    const response = await fetch(blobUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    buffer = await response.arrayBuffer();
  } catch {
    throw new IngestionError("Die PDF-Datei konnte nicht geladen werden.");
  }

  let pages: string[];
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const result = await extractText(pdf, { mergePages: false });
    pages = result.text as string[];
  } catch {
    throw new IngestionError(
      "Diese PDF-Datei ist beschädigt oder verschlüsselt."
    );
  }

  if (pages.length === 0 || pages.every((p) => p.trim() === "")) {
    throw new IngestionError("Diese PDF-Datei enthält keinen lesbaren Text.");
  }

  const offsets: { page: number; start: number; end: number }[] = [];
  let content = "";
  pages.forEach((pageText, index) => {
    const start = content.length;
    content += pageText;
    const end = content.length;
    offsets.push({ page: index + 1, start, end });
    content += "\n\n";
  });

  return { content: content.trimEnd(), meta: { pages: offsets } };
}
