// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "../../helpers/db";
import type { Db } from "@/db";

vi.mock("@/lib/ingestion/pdf", () => ({ extractPdf: vi.fn() }));
vi.mock("@/lib/ingestion/url", () => ({ extractUrl: vi.fn() }));
vi.mock("@/lib/ingestion/youtube", () => ({ extractYoutube: vi.fn() }));
vi.mock("@/lib/ingestion/audio", () => ({ extractAudio: vi.fn() }));
vi.mock("@/lib/ingestion/tokens", () => ({ countTokens: vi.fn() }));

import { extractPdf } from "@/lib/ingestion/pdf";
import { extractUrl } from "@/lib/ingestion/url";
import { extractYoutube } from "@/lib/ingestion/youtube";
import { extractAudio } from "@/lib/ingestion/audio";
import { countTokens } from "@/lib/ingestion/tokens";
import { IngestionError } from "@/lib/ingestion/errors";
import { processSource } from "@/lib/ingestion/process";
import { createSource, getSource } from "@/db/repo/sources";
import { createNotebook } from "@/db/repo/notebooks";

const VISITOR = "aaaaaaaa-0000-4000-8000-000000000001";
let db: Db;
let notebookId: string;

beforeEach(async () => {
  db = (await createTestDb()) as unknown as Db;
  const nb = await createNotebook(db, VISITOR, "Test");
  notebookId = nb.id;
  vi.mocked(extractPdf).mockReset();
  vi.mocked(extractUrl).mockReset();
  vi.mocked(extractYoutube).mockReset();
  vi.mocked(extractAudio).mockReset();
  vi.mocked(countTokens).mockReset();
  delete process.env.LIMIT_TOKENS_PER_NOTEBOOK;
});

describe("processSource", () => {
  it("setzt eine URL-Quelle auf ready mit Inhalt, Titel und Tokenzahl", async () => {
    const src = await createSource(db, notebookId, {
      type: "url",
      title: "Warten …",
      originalUrl: "https://example.com/artikel",
    });
    vi.mocked(extractUrl).mockResolvedValue({
      title: "Echter Titel",
      content: "Artikeltext.",
    });
    vi.mocked(countTokens).mockResolvedValue(42);

    await processSource(db, notebookId, src.id);

    const updated = await getSource(db, notebookId, src.id);
    expect(updated?.status).toBe("ready");
    expect(updated?.content).toBe("Artikeltext.");
    expect(updated?.title).toBe("Echter Titel");
    expect(updated?.tokenCount).toBe(42);
  });

  it("setzt eine Quelle auf error mit der IngestionError-Meldung", async () => {
    const src = await createSource(db, notebookId, {
      type: "url",
      title: "Warten …",
      originalUrl: "https://example.com/artikel",
    });
    vi.mocked(extractUrl).mockRejectedValue(
      new IngestionError("Diese Website konnte nicht gelesen werden.")
    );

    await processSource(db, notebookId, src.id);

    const updated = await getSource(db, notebookId, src.id);
    expect(updated?.status).toBe("error");
    expect(updated?.errorMessage).toBe(
      "Diese Website konnte nicht gelesen werden."
    );
  });

  it("setzt eine Quelle auf error, wenn das Token-Limit überschritten wird", async () => {
    process.env.LIMIT_TOKENS_PER_NOTEBOOK = "10";
    const src = await createSource(db, notebookId, {
      type: "url",
      title: "Warten …",
      originalUrl: "https://example.com/artikel",
    });
    vi.mocked(extractUrl).mockResolvedValue({ title: "Titel", content: "Text" });
    vi.mocked(countTokens).mockResolvedValue(20);

    await processSource(db, notebookId, src.id);

    const updated = await getSource(db, notebookId, src.id);
    expect(updated?.status).toBe("error");
    expect(updated?.errorMessage).toContain("Token-Limit");
  });

  it("normalisiert unerwartete Fehler zu einer generischen deutschen Meldung", async () => {
    const src = await createSource(db, notebookId, {
      type: "url",
      title: "Warten …",
      originalUrl: "https://example.com/artikel",
    });
    vi.mocked(extractUrl).mockRejectedValue(new Error("boom"));

    await processSource(db, notebookId, src.id);

    const updated = await getSource(db, notebookId, src.id);
    expect(updated?.status).toBe("error");
    expect(updated?.errorMessage).toBe(
      "Die Verarbeitung ist unerwartet fehlgeschlagen — bitte erneut versuchen."
    );
  });

  it("tut nichts für eine unbekannte Quellen-ID", async () => {
    await expect(
      processSource(
        db,
        notebookId,
        "00000000-0000-4000-8000-000000000000"
      )
    ).resolves.toBeUndefined();
  });

  it("setzt eine PDF-Quelle auf ready mit Inhalt und Seiten-Meta, ohne Titel-Override", async () => {
    const src = await createSource(db, notebookId, {
      type: "pdf",
      title: "Dokument.pdf",
      blobUrl: "https://blob.example/x.pdf",
    });
    vi.mocked(extractPdf).mockResolvedValue({
      content: "Seite eins.",
      meta: { pages: [{ page: 1, start: 0, end: 11 }] },
    });
    vi.mocked(countTokens).mockResolvedValue(5);

    await processSource(db, notebookId, src.id);

    const updated = await getSource(db, notebookId, src.id);
    expect(updated?.status).toBe("ready");
    expect(updated?.content).toBe("Seite eins.");
    expect(updated?.meta).toEqual({ pages: [{ page: 1, start: 0, end: 11 }] });
    expect(updated?.title).toBe("Dokument.pdf"); // PDF liefert keinen Titel, Original bleibt
  });

  it("setzt eine YouTube-Quelle auf ready mit Inhalt, Titel und Zeitstempel-Meta", async () => {
    const src = await createSource(db, notebookId, {
      type: "youtube",
      title: "Wird geladen …",
      originalUrl: "https://www.youtube.com/watch?v=abcdefghijk",
    });
    vi.mocked(extractYoutube).mockResolvedValue({
      title: "Ein Video",
      content: "Hallo Welt",
      meta: { segments: [{ start_s: 0, end_s: 1, text_offset: 0 }] },
    });
    vi.mocked(countTokens).mockResolvedValue(7);

    await processSource(db, notebookId, src.id);

    const updated = await getSource(db, notebookId, src.id);
    expect(updated?.status).toBe("ready");
    expect(updated?.content).toBe("Hallo Welt");
    expect(updated?.title).toBe("Ein Video");
    expect(updated?.meta).toEqual({
      segments: [{ start_s: 0, end_s: 1, text_offset: 0 }],
    });
  });

  it("setzt eine Audio-Quelle auf ready mit Inhalt und Dauer-Meta, ohne Titel-Override", async () => {
    const src = await createSource(db, notebookId, {
      type: "audio",
      title: "Aufnahme.mp3",
      blobUrl: "https://blob.example/x.mp3",
    });
    vi.mocked(extractAudio).mockResolvedValue({
      content: "Gesprochener Text.",
      meta: { duration_s: 42 },
    });
    vi.mocked(countTokens).mockResolvedValue(9);

    await processSource(db, notebookId, src.id);

    const updated = await getSource(db, notebookId, src.id);
    expect(updated?.status).toBe("ready");
    expect(updated?.content).toBe("Gesprochener Text.");
    expect(updated?.meta).toEqual({ duration_s: 42 });
    expect(updated?.title).toBe("Aufnahme.mp3"); // Audio liefert keinen Titel, Original bleibt
  });

  it("setzt eine Text-Quelle auf error, falls sie doch durch processSource läuft (defensiver Fallback)", async () => {
    const src = await createSource(db, notebookId, {
      type: "text",
      title: "Notiz",
      content: "Bereits fertiger Text.",
      tokenCount: 3,
    });

    await processSource(db, notebookId, src.id);

    const updated = await getSource(db, notebookId, src.id);
    expect(updated?.status).toBe("error");
    expect(updated?.errorMessage).toBe("Unbekannter Quellentyp.");
  });
});
