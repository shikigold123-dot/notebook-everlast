# Everlast Phase 2 „Quellen-Ingestion" — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Besucher können PDF-, Text-, Website-, YouTube- und Audio-Quellen zu einem Notebook hinzufügen; die Verarbeitung läuft einheitlich im Hintergrund, das Quellen-Panel zeigt Status live per Polling und erlaubt Retry/Löschen.

**Architecture:** Fünf isolierte Extraktions-Module (`src/lib/ingestion/`) mit einem gemeinsamen Fehlertyp, ein Orchestrator (`processSource`) der sie dispatcht und über das Sources-Repository (Drizzle) persistiert, API-Routen die Next.js `after()` für die Hintergrund-Verarbeitung nutzen, ein Client-seitiges Quellen-Panel mit 2-Sekunden-Polling.

**Tech Stack:** Next.js App Router, Drizzle ORM, `@vercel/blob` (Client-Upload), `unpdf` (PDF), `@mozilla/readability` + `linkedom` (Website), `youtubei.js` (YouTube), `openai` (Whisper), `@anthropic-ai/sdk` (Tokenzählung).

**Specs:**
- Produkt: `docs/superpowers/specs/2026-07-06-everlast-notebooklm-alternative-design.md` (Abschnitt 5 Datenmodell, 6.1 Quellen-Ingestion, 7 Limits)
- Technisch: `docs/superpowers/specs/2026-07-08-everlast-phase-2-quellen-ingestion-design.md`

## Global Constraints

- Alle UI-Texte und Fehlermeldungen: Deutsch
- Design „Dossier": harte 1,5px-Linien, keine Rundungen/Schatten, Signalfarbe (`bg-signal`) NUR für primäre Aktionen — niemals für Fehler-Banner (dort `bg-paper`)
- Repositories nehmen `db: Db` als ersten Parameter; Autorisierung immer über `notebookId`/`visitorId` im Repo-Layer, nie nur im Route-Handler
- Neon-HTTP-Treiber unterstützt KEINE Transaktionen
- Alle vier extern-abhängigen Quellentypen (`pdf`, `url`, `youtube`, `audio`) laufen einheitlich über Next.js `after()`; nur `text` wird synchron in der POST-Route auf `ready` gesetzt
- Extraktions-Funktionen werfen ausschließlich `IngestionError` mit einer fertigen deutschen Nutzer-Meldung; alle anderen Fehler werden vom Orchestrator zu einer generischen deutschen Meldung normalisiert
- Limits: `LIMITS.sourcesPerNotebook` (Default 8), `LIMITS.tokensPerNotebook` (Default 100.000) — beide bereits in `src/lib/limits.ts` vorhanden, keine neuen Getter nötig
- Tests: `npm test` läuft komplett offline — alle externen SDKs (`unpdf`, `@mozilla/readability`, `linkedom`, `youtubei.js`, `openai`, `@anthropic-ai/sdk`, `@vercel/blob/client`) werden mit `vi.mock` ersetzt, nie echt aufgerufen
- Vor jedem Commit: `npm test && npx tsc --noEmit && npm run lint`

---

### Task 1: Sources-Repository (DB-Layer)

**Files:**
- Create: `src/db/repo/sources.ts`
- Test: `tests/db/sources.test.ts`

**Interfaces:**
- Consumes: `source`-Tabelle (`src/db/schema.ts`), `Db`-Typ (`src/db/index.ts`), `LIMITS.sourcesPerNotebook` (`src/lib/limits.ts`), `LimitExceededError` (`src/db/repo/notebooks.ts`), `createTestDb()` (`tests/helpers/db.ts`)
- Produces: `type NewSourceInput = { type: "text"|"pdf"|"url"|"youtube"|"audio"; title: string; content?: string; tokenCount?: number; originalUrl?: string; blobUrl?: string }`, `listSources(db, notebookId)`, `getSource(db, notebookId, sourceId)`, `createSource(db, notebookId, input): Promise<Source>` (wirft `LimitExceededError`), `deleteSource(db, notebookId, sourceId)`, `markProcessing(db, sourceId)`, `markReady(db, sourceId, { content, tokenCount, meta?, title? })`, `markError(db, sourceId, message)`, `retrySource(db, notebookId, sourceId): Promise<Source | null>`

- [ ] **Step 1: Failing Tests schreiben**

`tests/db/sources.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../helpers/db";
import {
  listSources,
  createSource,
  getSource,
  deleteSource,
  markProcessing,
  markReady,
  markError,
  retrySource,
} from "@/db/repo/sources";
import { createNotebook, LimitExceededError } from "@/db/repo/notebooks";
import type { Db } from "@/db";

const VISITOR = "aaaaaaaa-0000-4000-8000-000000000001";
let db: Db;
let notebookId: string;

beforeEach(async () => {
  db = (await createTestDb()) as unknown as Db;
  const nb = await createNotebook(db, VISITOR, "Test");
  notebookId = nb.id;
});

afterEach(() => {
  delete process.env.LIMIT_SOURCES_PER_NOTEBOOK;
});

describe("createSource", () => {
  it("legt eine Text-Quelle sofort als ready an", async () => {
    const src = await createSource(db, notebookId, {
      type: "text",
      title: "Notiz",
      content: "Ein Text.",
      tokenCount: 5,
    });
    expect(src.status).toBe("ready");
    expect(src.content).toBe("Ein Text.");
    expect(src.tokenCount).toBe(5);
  });

  it("legt eine URL-Quelle als pending an, ohne Inhalt", async () => {
    const src = await createSource(db, notebookId, {
      type: "url",
      title: "Wird geladen …",
      originalUrl: "https://example.com",
    });
    expect(src.status).toBe("pending");
    expect(src.content).toBeNull();
  });

  it("wirft LimitExceededError ab dem Quellen-Limit", async () => {
    process.env.LIMIT_SOURCES_PER_NOTEBOOK = "1";
    await createSource(db, notebookId, {
      type: "text",
      title: "Eins",
      content: "A",
      tokenCount: 1,
    });
    await expect(
      createSource(db, notebookId, {
        type: "text",
        title: "Zwei",
        content: "B",
        tokenCount: 1,
      })
    ).rejects.toThrow(LimitExceededError);
  });
});

describe("listSources", () => {
  it("listet Quellen eines Notebooks, älteste zuerst", async () => {
    await createSource(db, notebookId, {
      type: "text",
      title: "Erste",
      content: "A",
      tokenCount: 1,
    });
    await createSource(db, notebookId, {
      type: "text",
      title: "Zweite",
      content: "B",
      tokenCount: 1,
    });
    const rows = await listSources(db, notebookId);
    expect(rows.map((s) => s.title)).toEqual(["Erste", "Zweite"]);
  });
});

describe("getSource", () => {
  it("liefert null für eine Quelle eines fremden Notebooks", async () => {
    const other = await createNotebook(
      db,
      "bbbbbbbb-0000-4000-8000-000000000002",
      "Anderes"
    );
    const src = await createSource(db, notebookId, {
      type: "text",
      title: "X",
      content: "A",
      tokenCount: 1,
    });
    const result = await getSource(db, other.id, src.id);
    expect(result).toBeNull();
  });
});

describe("Statuswechsel", () => {
  it("markProcessing/markReady/markError setzen Status und Felder korrekt", async () => {
    const src = await createSource(db, notebookId, {
      type: "url",
      title: "Wird geladen …",
      originalUrl: "https://example.com",
    });

    await markProcessing(db, src.id);
    let updated = await getSource(db, notebookId, src.id);
    expect(updated?.status).toBe("processing");

    await markReady(db, src.id, {
      content: "Text",
      tokenCount: 10,
      meta: { foo: "bar" },
      title: "Echter Titel",
    });
    updated = await getSource(db, notebookId, src.id);
    expect(updated?.status).toBe("ready");
    expect(updated?.content).toBe("Text");
    expect(updated?.title).toBe("Echter Titel");
    expect(updated?.meta).toEqual({ foo: "bar" });

    await markError(db, src.id, "Etwas ist schiefgelaufen.");
    updated = await getSource(db, notebookId, src.id);
    expect(updated?.status).toBe("error");
    expect(updated?.errorMessage).toBe("Etwas ist schiefgelaufen.");
  });
});

describe("retrySource", () => {
  it("setzt eine fehlerhafte Quelle zurück auf pending und löscht die Fehlermeldung", async () => {
    const src = await createSource(db, notebookId, {
      type: "url",
      title: "X",
      originalUrl: "https://example.com",
    });
    await markError(db, src.id, "Kaputt");

    const retried = await retrySource(db, notebookId, src.id);
    expect(retried?.status).toBe("pending");
    expect(retried?.errorMessage).toBeNull();
  });

  it("liefert null für eine unbekannte Quelle", async () => {
    const result = await retrySource(
      db,
      notebookId,
      "00000000-0000-4000-8000-000000000000"
    );
    expect(result).toBeNull();
  });
});

describe("deleteSource", () => {
  it("löscht eine Quelle", async () => {
    const src = await createSource(db, notebookId, {
      type: "text",
      title: "X",
      content: "A",
      tokenCount: 1,
    });
    await deleteSource(db, notebookId, src.id);
    const result = await getSource(db, notebookId, src.id);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `npm test -- tests/db/sources.test.ts`
Expected: FAIL — `Cannot find module '@/db/repo/sources'`

- [ ] **Step 3: Repository implementieren**

`src/db/repo/sources.ts`:

```ts
import { and, asc, count, eq } from "drizzle-orm";
import { source } from "@/db/schema";
import type { Db } from "@/db";
import { LIMITS } from "@/lib/limits";
import { LimitExceededError } from "./notebooks";

export type NewSourceInput = {
  type: "text" | "pdf" | "url" | "youtube" | "audio";
  title: string;
  content?: string;
  tokenCount?: number;
  originalUrl?: string;
  blobUrl?: string;
};

export async function listSources(db: Db, notebookId: string) {
  return db
    .select()
    .from(source)
    .where(eq(source.notebookId, notebookId))
    .orderBy(asc(source.createdAt), asc(source.id));
}

export async function getSource(db: Db, notebookId: string, sourceId: string) {
  const rows = await db
    .select()
    .from(source)
    .where(and(eq(source.id, sourceId), eq(source.notebookId, notebookId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createSource(
  db: Db,
  notebookId: string,
  input: NewSourceInput
) {
  const [{ value: existing }] = await db
    .select({ value: count() })
    .from(source)
    .where(eq(source.notebookId, notebookId));

  if (existing >= LIMITS.sourcesPerNotebook) {
    throw new LimitExceededError(
      `Maximal ${LIMITS.sourcesPerNotebook} Quellen pro Dossier — lösch eine, um Platz zu schaffen.`
    );
  }

  const [created] = await db
    .insert(source)
    .values({
      notebookId,
      type: input.type,
      title: input.title,
      status: input.type === "text" ? "ready" : "pending",
      content: input.content ?? null,
      tokenCount: input.tokenCount ?? null,
      originalUrl: input.originalUrl ?? null,
      blobUrl: input.blobUrl ?? null,
    })
    .returning();
  return created;
}

export async function deleteSource(
  db: Db,
  notebookId: string,
  sourceId: string
) {
  await db
    .delete(source)
    .where(and(eq(source.id, sourceId), eq(source.notebookId, notebookId)));
}

export async function markProcessing(db: Db, sourceId: string) {
  await db
    .update(source)
    .set({ status: "processing" })
    .where(eq(source.id, sourceId));
}

export async function markReady(
  db: Db,
  sourceId: string,
  data: { content: string; tokenCount: number; meta?: unknown; title?: string }
) {
  await db
    .update(source)
    .set({
      status: "ready",
      content: data.content,
      tokenCount: data.tokenCount,
      meta: data.meta ?? null,
      ...(data.title ? { title: data.title } : {}),
    })
    .where(eq(source.id, sourceId));
}

export async function markError(db: Db, sourceId: string, message: string) {
  await db
    .update(source)
    .set({ status: "error", errorMessage: message })
    .where(eq(source.id, sourceId));
}

export async function retrySource(
  db: Db,
  notebookId: string,
  sourceId: string
) {
  const [updated] = await db
    .update(source)
    .set({ status: "pending", errorMessage: null })
    .where(and(eq(source.id, sourceId), eq(source.notebookId, notebookId)))
    .returning();
  return updated ?? null;
}
```

- [ ] **Step 4: Test laufen lassen — muss bestehen**

Run: `npm test -- tests/db/sources.test.ts`
Expected: PASS (8 Tests)

- [ ] **Step 5: Commit**

```bash
git add src/db/repo/sources.ts tests/db/sources.test.ts
git commit -m "feat: Sources-Repository mit Quellen-Limit und Statuswechseln"
```

---

### Task 2: Token-Zählung über die Claude API

**Files:**
- Create: `src/lib/ingestion/tokens.ts`
- Test: `tests/lib/ingestion/tokens.test.ts`

**Interfaces:**
- Consumes: `@anthropic-ai/sdk`
- Produces: `countTokens(text: string): Promise<number>` — wirft bei fehlendem `ANTHROPIC_API_KEY` einen Fehler mit deutscher Meldung

- [ ] **Step 1: Abhängigkeit installieren**

```bash
npm install @anthropic-ai/sdk
```

- [ ] **Step 2: Failing Test schreiben**

`tests/lib/ingestion/tokens.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const countTokensMock = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { countTokens: countTokensMock },
  })),
}));

import { countTokens } from "@/lib/ingestion/tokens";

beforeEach(() => {
  countTokensMock.mockReset();
  process.env.ANTHROPIC_API_KEY = "test-key";
});

describe("countTokens", () => {
  it("liefert die Token-Zahl der Claude API zurück", async () => {
    countTokensMock.mockResolvedValue({ input_tokens: 42 });
    const result = await countTokens("Hallo Welt");
    expect(result).toBe(42);
    expect(countTokensMock).toHaveBeenCalledWith({
      model: "claude-opus-4-8",
      messages: [{ role: "user", content: "Hallo Welt" }],
    });
  });

  it("wirft einen Fehler ohne ANTHROPIC_API_KEY", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(countTokens("Text")).rejects.toThrow(
      "ANTHROPIC_API_KEY fehlt"
    );
  });
});
```

- [ ] **Step 3: Test laufen lassen — muss fehlschlagen**

Run: `npm test -- tests/lib/ingestion/tokens.test.ts`
Expected: FAIL — `Cannot find module '@/lib/ingestion/tokens'`

- [ ] **Step 4: Implementieren**

`src/lib/ingestion/tokens.ts`:

```ts
import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        "ANTHROPIC_API_KEY fehlt — bitte in .env.local eintragen."
      );
    }
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

export async function countTokens(text: string): Promise<number> {
  const client = getClient();
  const result = await client.messages.countTokens({
    model: "claude-opus-4-8",
    messages: [{ role: "user", content: text }],
  });
  return result.input_tokens;
}
```

- [ ] **Step 5: Test laufen lassen — muss bestehen**

Run: `npm test -- tests/lib/ingestion/tokens.test.ts`
Expected: PASS (2 Tests)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/ingestion/tokens.ts tests/lib/ingestion/tokens.test.ts
git commit -m "feat: Token-Zählung über die Claude API"
```

---

### Task 3: PDF-Extraktion (unpdf)

**Files:**
- Create: `src/lib/ingestion/errors.ts`
- Create: `src/lib/ingestion/pdf.ts`
- Test: `tests/lib/ingestion/pdf.test.ts`

**Interfaces:**
- Consumes: `unpdf`
- Produces: `class IngestionError extends Error` (aus `errors.ts`, wird von allen Extraktions-Modulen genutzt), `type PdfExtractionResult = { content: string; meta: { pages: { page: number; start: number; end: number }[] } }`, `extractPdf(blobUrl: string): Promise<PdfExtractionResult>`

- [ ] **Step 1: Abhängigkeit installieren**

```bash
npm install unpdf
```

- [ ] **Step 2: Fehlertyp anlegen**

`src/lib/ingestion/errors.ts`:

```ts
/** Trägt eine bereits nutzerfreundliche, deutsche Fehlermeldung. */
export class IngestionError extends Error {}
```

- [ ] **Step 3: Failing Test schreiben**

`tests/lib/ingestion/pdf.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const extractTextMock = vi.fn();
const getDocumentProxyMock = vi.fn();
vi.mock("unpdf", () => ({
  extractText: extractTextMock,
  getDocumentProxy: getDocumentProxyMock,
}));

import { extractPdf } from "@/lib/ingestion/pdf";
import { IngestionError } from "@/lib/ingestion/errors";

beforeEach(() => {
  extractTextMock.mockReset();
  getDocumentProxyMock.mockReset();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("extractPdf", () => {
  it("baut Text und Seiten-Offsets aus mehreren Seiten zusammen", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    });
    getDocumentProxyMock.mockResolvedValue({});
    extractTextMock.mockResolvedValue({
      text: ["Seite eins.", "Seite zwei."],
    });

    const result = await extractPdf("https://blob.example/x.pdf");

    expect(result.content).toBe("Seite eins.\n\nSeite zwei.");
    expect(result.meta.pages).toEqual([
      { page: 1, start: 0, end: 11 },
      { page: 2, start: 13, end: 24 },
    ]);
  });

  it("wirft IngestionError, wenn der Download fehlschlägt", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
    });
    await expect(
      extractPdf("https://blob.example/x.pdf")
    ).rejects.toThrow(IngestionError);
  });

  it("wirft IngestionError bei leerem/keinem Text", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    });
    getDocumentProxyMock.mockResolvedValue({});
    extractTextMock.mockResolvedValue({ text: ["   ", ""] });

    await expect(
      extractPdf("https://blob.example/x.pdf")
    ).rejects.toThrow("Diese PDF-Datei enthält keinen lesbaren Text.");
  });
});
```

- [ ] **Step 4: Test laufen lassen — muss fehlschlagen**

Run: `npm test -- tests/lib/ingestion/pdf.test.ts`
Expected: FAIL — `Cannot find module '@/lib/ingestion/pdf'`

- [ ] **Step 5: Implementieren**

`src/lib/ingestion/pdf.ts`:

```ts
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
```

- [ ] **Step 6: Test laufen lassen — muss bestehen**

Run: `npm test -- tests/lib/ingestion/pdf.test.ts`
Expected: PASS (3 Tests)

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/ingestion/errors.ts src/lib/ingestion/pdf.ts tests/lib/ingestion/pdf.test.ts
git commit -m "feat: PDF-Textextraktion mit Seiten-Offsets (unpdf)"
```

---

### Task 4: Website-Extraktion (Readability + linkedom)

**Files:**
- Create: `src/lib/ingestion/url.ts`
- Test: `tests/lib/ingestion/url.test.ts`

**Interfaces:**
- Consumes: `@mozilla/readability`, `linkedom`, `IngestionError` (Task 3)
- Produces: `type UrlExtractionResult = { title: string; content: string }`, `extractUrl(pageUrl: string): Promise<UrlExtractionResult>`

- [ ] **Step 1: Abhängigkeiten installieren**

```bash
npm install @mozilla/readability linkedom
```

- [ ] **Step 2: Failing Test schreiben**

`tests/lib/ingestion/url.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

import { extractUrl } from "@/lib/ingestion/url";
import { IngestionError } from "@/lib/ingestion/errors";

describe("extractUrl", () => {
  it("extrahiert Titel und Artikeltext aus HTML", async () => {
    const absatz =
      "Ein langer Absatz mit genug Text, damit Readability ihn als Hauptinhalt erkennt. ".repeat(
        8
      );
    const html = `<html><head><title>Test</title></head><body>
      <article><h1>Überschrift</h1><p>${absatz}</p></article>
    </body></html>`;
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      text: async () => html,
    });

    const result = await extractUrl("https://example.com/artikel");

    expect(result.content).toContain("Ein langer Absatz");
    expect(result.title.length).toBeGreaterThan(0);
  });

  it("wirft IngestionError, wenn die Seite nicht erreichbar ist", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
    });
    await expect(
      extractUrl("https://example.com/x")
    ).rejects.toThrow(IngestionError);
  });

  it("wirft IngestionError bei nicht-Artikel-Inhalt", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      text: async () => "<html><body><div>zu kurz</div></body></html>",
    });
    await expect(
      extractUrl("https://example.com/x")
    ).rejects.toThrow(IngestionError);
  });
});
```

- [ ] **Step 3: Test laufen lassen — muss fehlschlagen**

Run: `npm test -- tests/lib/ingestion/url.test.ts`
Expected: FAIL — `Cannot find module '@/lib/ingestion/url'`

- [ ] **Step 4: Implementieren**

`src/lib/ingestion/url.ts`:

```ts
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

  if (!article || !article.textContent.trim()) {
    throw new IngestionError("Diese Website konnte nicht gelesen werden.");
  }

  return {
    title: article.title || pageUrl,
    content: article.textContent.trim(),
  };
}
```

- [ ] **Step 5: Test laufen lassen — muss bestehen**

Run: `npm test -- tests/lib/ingestion/url.test.ts`
Expected: PASS (3 Tests)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/ingestion/url.ts tests/lib/ingestion/url.test.ts
git commit -m "feat: Website-Textextraktion mit Readability"
```

---

### Task 5: YouTube-Transkript-Extraktion (youtubei.js)

**Files:**
- Create: `src/lib/ingestion/youtube.ts`
- Test: `tests/lib/ingestion/youtube.test.ts`

**Interfaces:**
- Consumes: `youtubei.js`, `IngestionError` (Task 3)
- Produces: `type YoutubeExtractionResult = { title: string; content: string; meta: { segments: { start_s: number; end_s: number; text_offset: number }[] } }`, `extractYoutube(url: string): Promise<YoutubeExtractionResult>`

- [ ] **Step 1: Abhängigkeit installieren**

```bash
npm install youtubei.js
```

- [ ] **Step 2: Failing Test schreiben**

`tests/lib/ingestion/youtube.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const createMock = vi.fn();
vi.mock("youtubei.js", () => ({
  Innertube: { create: createMock },
}));

import { extractYoutube } from "@/lib/ingestion/youtube";
import { IngestionError } from "@/lib/ingestion/errors";

beforeEach(() => {
  createMock.mockReset();
});

describe("extractYoutube", () => {
  it("baut Text und Zeitstempel-Segmente aus dem Transkript", async () => {
    createMock.mockResolvedValue({
      getInfo: vi.fn().mockResolvedValue({
        basic_info: { title: "Ein Video" },
        getTranscript: vi.fn().mockResolvedValue({
          transcript: {
            content: {
              body: {
                initial_segments: [
                  { snippet: { text: "Hallo" }, start_ms: 0, end_ms: 1000 },
                  { snippet: { text: "Welt" }, start_ms: 1000, end_ms: 2000 },
                ],
              },
            },
          },
        }),
      }),
    });

    const result = await extractYoutube(
      "https://www.youtube.com/watch?v=abcdefghijk"
    );

    expect(result.title).toBe("Ein Video");
    expect(result.content).toBe("Hallo Welt");
    expect(result.meta.segments).toEqual([
      { start_s: 0, end_s: 1, text_offset: 0 },
      { start_s: 1, end_s: 2, text_offset: 6 },
    ]);
  });

  it("wirft IngestionError bei ungültiger URL", async () => {
    await expect(
      extractYoutube("https://example.com/nicht-youtube")
    ).rejects.toThrow("Das ist keine gültige YouTube-URL.");
  });

  it("wirft IngestionError ohne Transkript-Segmente", async () => {
    createMock.mockResolvedValue({
      getInfo: vi.fn().mockResolvedValue({
        basic_info: { title: "Ohne Transkript" },
        getTranscript: vi.fn().mockResolvedValue({
          transcript: { content: { body: { initial_segments: [] } } },
        }),
      }),
    });

    await expect(
      extractYoutube("https://www.youtube.com/watch?v=abcdefghijk")
    ).rejects.toThrow("Für dieses Video ist kein Transkript verfügbar.");
  });
});
```

- [ ] **Step 3: Test laufen lassen — muss fehlschlagen**

Run: `npm test -- tests/lib/ingestion/youtube.test.ts`
Expected: FAIL — `Cannot find module '@/lib/ingestion/youtube'`

- [ ] **Step 4: Implementieren**

`src/lib/ingestion/youtube.ts`:

```ts
import { Innertube } from "youtubei.js";
import { IngestionError } from "./errors";

export type YoutubeExtractionResult = {
  title: string;
  content: string;
  meta: {
    segments: { start_s: number; end_s: number; text_offset: number }[];
  };
};

function extractVideoId(url: string): string | null {
  const match = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

export async function extractYoutube(
  url: string
): Promise<YoutubeExtractionResult> {
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new IngestionError("Das ist keine gültige YouTube-URL.");
  }

  let info: {
    basic_info: { title?: string };
    getTranscript: () => Promise<{
      transcript: {
        content?: {
          body?: {
            initial_segments?: {
              snippet: { text: string };
              start_ms: number;
              end_ms: number;
            }[];
          };
        };
      };
    }>;
  };
  try {
    const yt = await Innertube.create({ retrieve_player: false });
    info = await yt.getInfo(videoId);
  } catch {
    throw new IngestionError(
      "Dieses YouTube-Video konnte nicht geladen werden."
    );
  }

  let segments: { snippet: { text: string }; start_ms: number; end_ms: number }[];
  try {
    const transcriptInfo = await info.getTranscript();
    segments =
      transcriptInfo.transcript.content?.body?.initial_segments ?? [];
  } catch {
    segments = [];
  }

  if (segments.length === 0) {
    throw new IngestionError("Für dieses Video ist kein Transkript verfügbar.");
  }

  let content = "";
  const metaSegments: {
    start_s: number;
    end_s: number;
    text_offset: number;
  }[] = [];
  for (const seg of segments) {
    const text = String(seg.snippet.text);
    metaSegments.push({
      start_s: seg.start_ms / 1000,
      end_s: seg.end_ms / 1000,
      text_offset: content.length,
    });
    content += text + " ";
  }

  return {
    title: info.basic_info.title ?? url,
    content: content.trim(),
    meta: { segments: metaSegments },
  };
}
```

- [ ] **Step 5: Test laufen lassen — muss bestehen**

Run: `npm test -- tests/lib/ingestion/youtube.test.ts`
Expected: PASS (3 Tests)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/ingestion/youtube.ts tests/lib/ingestion/youtube.test.ts
git commit -m "feat: YouTube-Transkript-Extraktion mit Zeitstempeln"
```

---

### Task 6: Audio-Transkription (OpenAI Whisper)

**Files:**
- Create: `src/lib/ingestion/audio.ts`
- Test: `tests/lib/ingestion/audio.test.ts`

**Interfaces:**
- Consumes: `openai`, `IngestionError` (Task 3)
- Produces: `type AudioExtractionResult = { content: string; meta: { duration_s: number } }`, `extractAudio(blobUrl: string): Promise<AudioExtractionResult>` — prüft die Spec-Grenze von 30 Minuten (1800s) nach der Transkription und wirft `IngestionError`, wenn überschritten (die Dauer ist erst nach der Whisper-Antwort bekannt)

- [ ] **Step 1: Abhängigkeit installieren**

```bash
npm install openai
```

- [ ] **Step 2: Failing Test schreiben**

`tests/lib/ingestion/audio.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const createTranscriptionMock = vi.fn();
vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    audio: { transcriptions: { create: createTranscriptionMock } },
  })),
}));

import { extractAudio } from "@/lib/ingestion/audio";
import { IngestionError } from "@/lib/ingestion/errors";

beforeEach(() => {
  createTranscriptionMock.mockReset();
  process.env.OPENAI_API_KEY = "test-key";
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("extractAudio", () => {
  it("liefert Text und Dauer aus der Transkription", async () => {
    createTranscriptionMock.mockResolvedValue({
      text: "Hallo Welt.",
      duration: 12.4,
    });

    const result = await extractAudio("https://blob.example/x.mp3");

    expect(result.content).toBe("Hallo Welt.");
    expect(result.meta.duration_s).toBe(12);
  });

  it("wirft IngestionError, wenn der Download fehlschlägt", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404 })
    );
    await expect(
      extractAudio("https://blob.example/x.mp3")
    ).rejects.toThrow(IngestionError);
  });

  it("wirft IngestionError, wenn Whisper fehlschlägt", async () => {
    createTranscriptionMock.mockRejectedValue(new Error("API down"));
    await expect(
      extractAudio("https://blob.example/x.mp3")
    ).rejects.toThrow("Die Transkription ist fehlgeschlagen");
  });

  it("wirft IngestionError, wenn die Datei länger als 30 Minuten ist", async () => {
    createTranscriptionMock.mockResolvedValue({
      text: "Sehr langer Text.",
      duration: 1801,
    });
    await expect(
      extractAudio("https://blob.example/x.mp3")
    ).rejects.toThrow(
      "Audio-Dateien dürfen höchstens 30 Minuten lang sein."
    );
  });
});
```

- [ ] **Step 3: Test laufen lassen — muss fehlschlagen**

Run: `npm test -- tests/lib/ingestion/audio.test.ts`
Expected: FAIL — `Cannot find module '@/lib/ingestion/audio'`

- [ ] **Step 4: Implementieren**

`src/lib/ingestion/audio.ts`:

```ts
import OpenAI from "openai";
import { IngestionError } from "./errors";

export type AudioExtractionResult = {
  content: string;
  meta: { duration_s: number };
};

const MAX_DURATION_S = 30 * 60;

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY fehlt — bitte in .env.local eintragen.");
    }
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

export async function extractAudio(
  blobUrl: string
): Promise<AudioExtractionResult> {
  let buffer: ArrayBuffer;
  try {
    const response = await fetch(blobUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    buffer = await response.arrayBuffer();
  } catch {
    throw new IngestionError("Die Audio-Datei konnte nicht geladen werden.");
  }

  const file = new File([buffer], "audio.mp3", { type: "audio/mpeg" });

  try {
    const client = getClient();
    const transcription = await client.audio.transcriptions.create({
      file,
      model: "whisper-1",
      response_format: "verbose_json",
    });

    if (!transcription.text.trim()) {
      throw new IngestionError("Die Transkription ergab keinen Text.");
    }

    const durationS = Math.round(transcription.duration ?? 0);
    if (durationS > MAX_DURATION_S) {
      throw new IngestionError(
        "Audio-Dateien dürfen höchstens 30 Minuten lang sein."
      );
    }

    return {
      content: transcription.text.trim(),
      meta: { duration_s: durationS },
    };
  } catch (err) {
    if (err instanceof IngestionError) throw err;
    throw new IngestionError(
      "Die Transkription ist fehlgeschlagen — bitte erneut versuchen."
    );
  }
}
```

- [ ] **Step 5: Test laufen lassen — muss bestehen**

Run: `npm test -- tests/lib/ingestion/audio.test.ts`
Expected: PASS (4 Tests)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/ingestion/audio.ts tests/lib/ingestion/audio.test.ts
git commit -m "feat: Audio-Transkription über OpenAI Whisper"
```

---

### Task 7: Ingestion-Orchestrator

**Files:**
- Create: `src/lib/ingestion/process.ts`
- Test: `tests/lib/ingestion/process.test.ts`

**Interfaces:**
- Consumes: `getSource`, `markProcessing`, `markReady`, `markError` (Task 1), `extractPdf` (Task 3), `extractUrl` (Task 4), `extractYoutube` (Task 5), `extractAudio` (Task 6), `countTokens` (Task 2), `IngestionError` (Task 3), `LIMITS.tokensPerNotebook`, `createTestDb()`, `createNotebook`
- Produces: `processSource(db: Db, notebookId: string, sourceId: string): Promise<void>` — wirft niemals nach außen; setzt die Quelle immer auf `ready` oder `error`

- [ ] **Step 1: Failing Tests schreiben**

`tests/lib/ingestion/process.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "../../helpers/db";
import type { Db } from "@/db";

vi.mock("@/lib/ingestion/pdf", () => ({ extractPdf: vi.fn() }));
vi.mock("@/lib/ingestion/url", () => ({ extractUrl: vi.fn() }));
vi.mock("@/lib/ingestion/youtube", () => ({ extractYoutube: vi.fn() }));
vi.mock("@/lib/ingestion/audio", () => ({ extractAudio: vi.fn() }));
vi.mock("@/lib/ingestion/tokens", () => ({ countTokens: vi.fn() }));

import { extractUrl } from "@/lib/ingestion/url";
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
  vi.mocked(extractUrl).mockReset();
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
});
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `npm test -- tests/lib/ingestion/process.test.ts`
Expected: FAIL — `Cannot find module '@/lib/ingestion/process'`

- [ ] **Step 3: Implementieren**

`src/lib/ingestion/process.ts`:

```ts
import type { Db } from "@/db";
import { getSource, markProcessing, markReady, markError } from "@/db/repo/sources";
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
      // "text" wird bereits synchron in der API-Route auf ready gesetzt
      return;
    }

    const tokenCount = await countTokens(content);

    if (tokenCount > LIMITS.tokensPerNotebook) {
      await markError(
        db,
        sourceId,
        `Diese Quelle ist mit ${tokenCount.toLocaleString(
          "de-DE"
        )} Tokens zu groß für das Token-Limit von ${LIMITS.tokensPerNotebook.toLocaleString(
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
```

- [ ] **Step 4: Test laufen lassen — muss bestehen**

Run: `npm test -- tests/lib/ingestion/process.test.ts`
Expected: PASS (5 Tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/ingestion/process.ts tests/lib/ingestion/process.test.ts
git commit -m "feat: Ingestion-Orchestrator mit Token-Limit-Prüfung"
```

---

### Task 8: Blob-Upload-Token-Route

**Files:**
- Create: `src/lib/ingestion/upload-limits.ts`
- Create: `src/app/api/notebooks/[id]/blob-upload-token/route.ts`
- Test: `tests/api/blob-upload-token.test.ts`

**Interfaces:**
- Consumes: `@vercel/blob/client`, `getDb`/`readVisitorId`/`getNotebook` (Phase 1)
- Produces: `UPLOAD_MAX_SIZES: Record<"pdf"|"audio", number>`, `UPLOAD_CONTENT_TYPES: Record<"pdf"|"audio", string[]>` (aus `upload-limits.ts` — client-importierbar, kein Server-Code darin, damit Task 10 sie fürs Vorab-Feedback im Browser wiederverwenden kann), `tokenOptionsForType(clientPayload: string | null): { allowedContentTypes: string[]; maximumSizeInBytes: number; tokenPayload: string }`, `POST` Route-Handler unter `/api/notebooks/:id/blob-upload-token`

- [ ] **Step 1: Abhängigkeit installieren**

```bash
npm install @vercel/blob
```

- [ ] **Step 2: Geteilte Limits-Konstanten anlegen**

`src/lib/ingestion/upload-limits.ts`:

```ts
/**
 * Geteilt zwischen Server (Blob-Upload-Token-Route) und Client (SourceForm),
 * damit die Client-Vorprüfung exakt dieselben Werte nutzt wie die serverseitige
 * Durchsetzung — keine zwei Wahrheiten für dieselbe Grenze.
 */
export const UPLOAD_MAX_SIZES: Record<"pdf" | "audio", number> = {
  pdf: 15 * 1024 * 1024,
  audio: 25 * 1024 * 1024,
};

export const UPLOAD_CONTENT_TYPES: Record<"pdf" | "audio", string[]> = {
  pdf: ["application/pdf"],
  audio: ["audio/mpeg", "audio/mp4", "audio/wav", "audio/x-m4a", "audio/webm"],
};
```

- [ ] **Step 3: Failing Tests schreiben**

`tests/api/blob-upload-token.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "../helpers/db";
import type { Db } from "@/db";
import { createNotebook } from "@/db/repo/notebooks";

const handleUploadMock = vi.fn();
vi.mock("@vercel/blob/client", () => ({
  handleUpload: handleUploadMock,
}));

let testDb: Db;
vi.mock("@/db", () => ({
  getDb: () => testDb,
}));

let cookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "everlast_visitor" && cookieValue
        ? { value: cookieValue }
        : undefined,
  }),
}));

import {
  POST,
  tokenOptionsForType,
} from "@/app/api/notebooks/[id]/blob-upload-token/route";

const VISITOR = "aaaaaaaa-0000-4000-8000-000000000001";
let notebookId: string;

beforeEach(async () => {
  testDb = (await createTestDb()) as unknown as Db;
  const nb = await createNotebook(testDb, VISITOR, "Test");
  notebookId = nb.id;
  cookieValue = VISITOR;
  handleUploadMock.mockReset();
});

function postRequest(body: unknown) {
  return new Request(
    `http://localhost/api/notebooks/${notebookId}/blob-upload-token`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

function ctx() {
  return { params: Promise.resolve({ id: notebookId }) };
}

describe("tokenOptionsForType", () => {
  it("erlaubt PDF mit 15-MB-Limit", () => {
    const result = tokenOptionsForType(JSON.stringify({ type: "pdf" }));
    expect(result.allowedContentTypes).toEqual(["application/pdf"]);
    expect(result.maximumSizeInBytes).toBe(15 * 1024 * 1024);
  });

  it("erlaubt Audio mit 25-MB-Limit", () => {
    const result = tokenOptionsForType(JSON.stringify({ type: "audio" }));
    expect(result.allowedContentTypes).toContain("audio/mpeg");
    expect(result.maximumSizeInBytes).toBe(25 * 1024 * 1024);
  });

  it("fällt ohne Payload auf pdf zurück", () => {
    const result = tokenOptionsForType(null);
    expect(result.maximumSizeInBytes).toBe(15 * 1024 * 1024);
  });
});

describe("POST /api/notebooks/[id]/blob-upload-token", () => {
  it("gibt die Antwort von handleUpload zurück", async () => {
    handleUploadMock.mockResolvedValue({
      type: "blob.generate-client-token",
      clientToken: "abc",
    });
    const res = await POST(
      postRequest({ type: "blob.generate-client-token" }),
      ctx()
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.clientToken).toBe("abc");
  });

  it("liefert 401 ohne Besucher-Cookie", async () => {
    cookieValue = undefined;
    const res = await POST(postRequest({}), ctx());
    expect(res.status).toBe(401);
  });

  it("liefert 404 für ein fremdes Dossier", async () => {
    const res = await POST(postRequest({}), {
      params: Promise.resolve({
        id: "00000000-0000-4000-8000-000000000000",
      }),
    });
    expect(res.status).toBe(404);
  });

  it("liefert 400, wenn handleUpload einen Fehler wirft", async () => {
    handleUploadMock.mockRejectedValue(new Error("Ungültiger Payload"));
    const res = await POST(postRequest({}), ctx());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Ungültiger Payload");
  });
});
```

- [ ] **Step 4: Test laufen lassen — muss fehlschlagen**

Run: `npm test -- tests/api/blob-upload-token.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/notebooks/[id]/blob-upload-token/route'`

- [ ] **Step 5: Implementieren**

`src/app/api/notebooks/[id]/blob-upload-token/route.ts`:

```ts
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { readVisitorId } from "@/lib/visitor";
import { getNotebook } from "@/db/repo/notebooks";
import { UPLOAD_MAX_SIZES, UPLOAD_CONTENT_TYPES } from "@/lib/ingestion/upload-limits";

export function tokenOptionsForType(clientPayload: string | null) {
  const payload = clientPayload ? JSON.parse(clientPayload) : {};
  const type: "pdf" | "audio" = payload.type === "audio" ? "audio" : "pdf";
  return {
    allowedContentTypes: UPLOAD_CONTENT_TYPES[type],
    maximumSizeInBytes: UPLOAD_MAX_SIZES[type],
    tokenPayload: clientPayload ?? "{}",
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: notebookId } = await params;
  const visitorId = readVisitorId(await cookies());
  if (!visitorId) {
    return NextResponse.json(
      { error: "Keine Besucher-Session — bitte Seite neu laden." },
      { status: 401 }
    );
  }

  const notebook = await getNotebook(getDb(), visitorId, notebookId);
  if (!notebook) {
    return NextResponse.json(
      { error: "Dossier nicht gefunden." },
      { status: 404 }
    );
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) =>
        tokenOptionsForType(clientPayload),
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}
```

- [ ] **Step 6: Test laufen lassen — muss bestehen**

Run: `npm test -- tests/api/blob-upload-token.test.ts`
Expected: PASS (7 Tests)

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/ingestion/upload-limits.ts "src/app/api/notebooks/[id]/blob-upload-token/route.ts" tests/api/blob-upload-token.test.ts
git commit -m "feat: Blob-Upload-Token-Route mit Größenlimits pro Typ"
```

---

### Task 9: Sources-API-Routen (Anlegen, Auflisten, Löschen, Retry)

**Files:**
- Create: `src/app/api/notebooks/[id]/sources/route.ts`
- Create: `src/app/api/notebooks/[id]/sources/[sourceId]/route.ts`
- Create: `src/app/api/notebooks/[id]/sources/[sourceId]/retry/route.ts`
- Test: `tests/api/notebooks-sources.test.ts`
- Test: `tests/api/notebooks-sources-item.test.ts`

**Interfaces:**
- Consumes: `getDb`/`readVisitorId`/`getNotebook`/`LimitExceededError` (Phase 1), `createSource`/`listSources`/`deleteSource`/`retrySource`/`getSource` (Task 1), `countTokens` (Task 2), `processSource` (Task 7)
- Produces: `GET`/`POST` unter `/api/notebooks/:id/sources`, `DELETE` unter `/api/notebooks/:id/sources/:sourceId`, `POST` unter `/api/notebooks/:id/sources/:sourceId/retry`

- [ ] **Step 1: Failing Tests für die Sammel-Route schreiben**

`tests/api/notebooks-sources.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb } from "../helpers/db";
import type { Db } from "@/db";
import { createNotebook } from "@/db/repo/notebooks";

let testDb: Db;
vi.mock("@/db", () => ({
  getDb: () => testDb,
}));

let cookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "everlast_visitor" && cookieValue
        ? { value: cookieValue }
        : undefined,
  }),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: vi.fn((cb: () => unknown) => cb()) };
});

const countTokensMock = vi.fn();
vi.mock("@/lib/ingestion/tokens", () => ({
  countTokens: countTokensMock,
}));

const processSourceMock = vi.fn();
vi.mock("@/lib/ingestion/process", () => ({
  processSource: processSourceMock,
}));

import { GET, POST } from "@/app/api/notebooks/[id]/sources/route";

const VISITOR = "aaaaaaaa-0000-4000-8000-000000000001";
let notebookId: string;

beforeEach(async () => {
  testDb = (await createTestDb()) as unknown as Db;
  const nb = await createNotebook(testDb, VISITOR, "Test");
  notebookId = nb.id;
  cookieValue = VISITOR;
  countTokensMock.mockReset().mockResolvedValue(10);
  processSourceMock.mockReset().mockResolvedValue(undefined);
  delete process.env.LIMIT_SOURCES_PER_NOTEBOOK;
});

function ctx() {
  return { params: Promise.resolve({ id: notebookId }) };
}

function postRequest(body: unknown) {
  return new Request(`http://localhost/api/notebooks/${notebookId}/sources`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/notebooks/[id]/sources", () => {
  it("legt eine Text-Quelle sofort als ready an, ohne Hintergrund-Verarbeitung", async () => {
    const res = await POST(
      postRequest({ type: "text", title: "Notiz", content: "Ein Text." }),
      ctx()
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.source.status).toBe("ready");
    expect(json.source.tokenCount).toBe(10);
    expect(processSourceMock).not.toHaveBeenCalled();
  });

  it("liefert 400 bei leerem Text", async () => {
    const res = await POST(
      postRequest({ type: "text", title: "Notiz", content: "   " }),
      ctx()
    );
    expect(res.status).toBe(400);
  });

  it("legt eine URL-Quelle als pending an und stößt die Verarbeitung an", async () => {
    const res = await POST(
      postRequest({ type: "url", originalUrl: "https://example.com/artikel" }),
      ctx()
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.source.status).toBe("pending");
    expect(processSourceMock).toHaveBeenCalledWith(
      testDb,
      notebookId,
      json.source.id
    );
  });

  it("legt eine PDF-Quelle mit blobUrl als pending an", async () => {
    const res = await POST(
      postRequest({
        type: "pdf",
        title: "Doku.pdf",
        blobUrl: "https://blob.example/x.pdf",
      }),
      ctx()
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.source.status).toBe("pending");
    expect(json.source.blobUrl).toBe("https://blob.example/x.pdf");
  });

  it("liefert 400 ohne blobUrl bei pdf", async () => {
    const res = await POST(
      postRequest({ type: "pdf", title: "Doku.pdf" }),
      ctx()
    );
    expect(res.status).toBe(400);
  });

  it("liefert 400 bei unbekanntem Typ", async () => {
    const res = await POST(postRequest({ type: "video" }), ctx());
    expect(res.status).toBe(400);
  });

  it("liefert 401 ohne Besucher-Cookie", async () => {
    cookieValue = undefined;
    const res = await POST(postRequest({ type: "text", content: "x" }), ctx());
    expect(res.status).toBe(401);
  });

  it("liefert 404 für ein fremdes Dossier", async () => {
    const res = await POST(postRequest({ type: "text", content: "x" }), {
      params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000000" }),
    });
    expect(res.status).toBe(404);
  });

  it("liefert 429 ab dem Quellen-Limit", async () => {
    process.env.LIMIT_SOURCES_PER_NOTEBOOK = "1";
    await POST(postRequest({ type: "text", content: "Eins" }), ctx());
    const res = await POST(postRequest({ type: "text", content: "Zwei" }), ctx());
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toContain("Maximal 1");
  });
});

describe("GET /api/notebooks/[id]/sources", () => {
  it("listet die Quellen des Dossiers", async () => {
    await POST(postRequest({ type: "text", content: "Eins" }), ctx());
    const res = await GET(new Request("http://localhost"), ctx());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sources).toHaveLength(1);
  });

  it("liefert eine leere Liste ohne Cookie", async () => {
    cookieValue = undefined;
    const res = await GET(new Request("http://localhost"), ctx());
    const json = await res.json();
    expect(json.sources).toEqual([]);
  });
});
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `npm test -- tests/api/notebooks-sources.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/notebooks/[id]/sources/route'`

- [ ] **Step 3: Sammel-Route implementieren**

`src/app/api/notebooks/[id]/sources/route.ts`:

```ts
import { NextResponse, after } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { readVisitorId } from "@/lib/visitor";
import { getNotebook, LimitExceededError } from "@/db/repo/notebooks";
import { createSource, listSources } from "@/db/repo/sources";
import { countTokens } from "@/lib/ingestion/tokens";
import { processSource } from "@/lib/ingestion/process";

const KNOWN_TYPES = ["text", "pdf", "url", "youtube", "audio"];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: notebookId } = await params;
  const visitorId = readVisitorId(await cookies());
  if (!visitorId) {
    return NextResponse.json({ sources: [] });
  }
  const db = getDb();
  const notebook = await getNotebook(db, visitorId, notebookId);
  if (!notebook) {
    return NextResponse.json({ sources: [] });
  }
  const sources = await listSources(db, notebookId);
  return NextResponse.json({ sources });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: notebookId } = await params;
  const visitorId = readVisitorId(await cookies());
  if (!visitorId) {
    return NextResponse.json(
      { error: "Keine Besucher-Session — bitte Seite neu laden." },
      { status: 401 }
    );
  }

  const db = getDb();
  const notebook = await getNotebook(db, visitorId, notebookId);
  if (!notebook) {
    return NextResponse.json(
      { error: "Dossier nicht gefunden." },
      { status: 404 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const type = body?.type;

  if (!KNOWN_TYPES.includes(type)) {
    return NextResponse.json(
      { error: "Unbekannter Quellentyp." },
      { status: 400 }
    );
  }

  try {
    if (type === "text") {
      const content =
        typeof body.content === "string" ? body.content.trim() : "";
      if (!content) {
        return NextResponse.json(
          { error: "Text darf nicht leer sein." },
          { status: 400 }
        );
      }
      const tokenCount = await countTokens(content);
      const created = await createSource(db, notebookId, {
        type: "text",
        title:
          typeof body.title === "string" && body.title.trim()
            ? body.title.trim()
            : "Unbenannter Text",
        content,
        tokenCount,
      });
      return NextResponse.json({ source: created }, { status: 201 });
    }

    if (type === "url" || type === "youtube") {
      const originalUrl =
        typeof body.originalUrl === "string" ? body.originalUrl.trim() : "";
      if (!originalUrl) {
        return NextResponse.json(
          { error: "URL darf nicht leer sein." },
          { status: 400 }
        );
      }
      const created = await createSource(db, notebookId, {
        type,
        title: "Wird geladen …",
        originalUrl,
      });
      after(() => processSource(getDb(), notebookId, created.id));
      return NextResponse.json({ source: created }, { status: 201 });
    }

    // pdf / audio
    const blobUrl = typeof body.blobUrl === "string" ? body.blobUrl.trim() : "";
    if (!blobUrl) {
      return NextResponse.json(
        { error: "Datei-URL fehlt." },
        { status: 400 }
      );
    }
    const created = await createSource(db, notebookId, {
      type,
      title:
        typeof body.title === "string" && body.title.trim()
          ? body.title.trim()
          : "Unbenannte Datei",
      blobUrl,
    });
    after(() => processSource(getDb(), notebookId, created.id));
    return NextResponse.json({ source: created }, { status: 201 });
  } catch (err) {
    if (err instanceof LimitExceededError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    throw err;
  }
}
```

- [ ] **Step 4: Test laufen lassen — muss bestehen**

Run: `npm test -- tests/api/notebooks-sources.test.ts`
Expected: PASS (10 Tests)

- [ ] **Step 5: Failing Tests für Item- und Retry-Route schreiben**

`tests/api/notebooks-sources-item.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../helpers/db";
import type { Db } from "@/db";
import { createNotebook } from "@/db/repo/notebooks";
import { createSource, getSource } from "@/db/repo/sources";
import { source } from "@/db/schema";

let testDb: Db;
vi.mock("@/db", () => ({
  getDb: () => testDb,
}));

let cookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "everlast_visitor" && cookieValue
        ? { value: cookieValue }
        : undefined,
  }),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: vi.fn((cb: () => unknown) => cb()) };
});

const processSourceMock = vi.fn();
vi.mock("@/lib/ingestion/process", () => ({
  processSource: processSourceMock,
}));

import { DELETE } from "@/app/api/notebooks/[id]/sources/[sourceId]/route";
import { POST as retryPOST } from "@/app/api/notebooks/[id]/sources/[sourceId]/retry/route";

const VISITOR = "aaaaaaaa-0000-4000-8000-000000000001";
let notebookId: string;
let sourceId: string;

beforeEach(async () => {
  testDb = (await createTestDb()) as unknown as Db;
  const nb = await createNotebook(testDb, VISITOR, "Test");
  notebookId = nb.id;
  const src = await createSource(testDb, notebookId, {
    type: "url",
    title: "Warten …",
    originalUrl: "https://example.com/artikel",
  });
  sourceId = src.id;
  cookieValue = VISITOR;
  processSourceMock.mockReset().mockResolvedValue(undefined);
});

function ctx() {
  return { params: Promise.resolve({ id: notebookId, sourceId }) };
}

describe("DELETE /api/notebooks/[id]/sources/[sourceId]", () => {
  it("löscht die Quelle", async () => {
    const res = await DELETE(
      new Request("http://localhost", { method: "DELETE" }),
      ctx()
    );
    expect(res.status).toBe(200);
    const remaining = await getSource(testDb, notebookId, sourceId);
    expect(remaining).toBeNull();
  });

  it("liefert 401 ohne Besucher-Cookie", async () => {
    cookieValue = undefined;
    const res = await DELETE(
      new Request("http://localhost", { method: "DELETE" }),
      ctx()
    );
    expect(res.status).toBe(401);
  });
});

describe("POST /api/notebooks/[id]/sources/[sourceId]/retry", () => {
  it("setzt eine fehlerhafte Quelle zurück auf pending und stößt die Verarbeitung erneut an", async () => {
    await testDb
      .update(source)
      .set({ status: "error", errorMessage: "Kaputt" })
      .where(eq(source.id, sourceId));

    const res = await retryPOST(
      new Request("http://localhost", { method: "POST" }),
      ctx()
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.source.status).toBe("pending");
    expect(json.source.errorMessage).toBeNull();
    expect(processSourceMock).toHaveBeenCalledWith(
      testDb,
      notebookId,
      sourceId
    );
  });

  it("liefert 404 für eine unbekannte Quelle", async () => {
    const res = await retryPOST(
      new Request("http://localhost", { method: "POST" }),
      {
        params: Promise.resolve({
          id: notebookId,
          sourceId: "00000000-0000-4000-8000-000000000000",
        }),
      }
    );
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 6: Test laufen lassen — muss fehlschlagen**

Run: `npm test -- tests/api/notebooks-sources-item.test.ts`
Expected: FAIL — Module nicht gefunden

- [ ] **Step 7: Item- und Retry-Route implementieren**

`src/app/api/notebooks/[id]/sources/[sourceId]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { readVisitorId } from "@/lib/visitor";
import { getNotebook } from "@/db/repo/notebooks";
import { deleteSource } from "@/db/repo/sources";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; sourceId: string }> }
) {
  const { id: notebookId, sourceId } = await params;
  const visitorId = readVisitorId(await cookies());
  if (!visitorId) {
    return NextResponse.json(
      { error: "Keine Besucher-Session — bitte Seite neu laden." },
      { status: 401 }
    );
  }

  const db = getDb();
  const notebook = await getNotebook(db, visitorId, notebookId);
  if (!notebook) {
    return NextResponse.json(
      { error: "Dossier nicht gefunden." },
      { status: 404 }
    );
  }

  await deleteSource(db, notebookId, sourceId);
  return NextResponse.json({ ok: true });
}
```

`src/app/api/notebooks/[id]/sources/[sourceId]/retry/route.ts`:

```ts
import { NextResponse, after } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { readVisitorId } from "@/lib/visitor";
import { getNotebook } from "@/db/repo/notebooks";
import { retrySource } from "@/db/repo/sources";
import { processSource } from "@/lib/ingestion/process";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; sourceId: string }> }
) {
  const { id: notebookId, sourceId } = await params;
  const visitorId = readVisitorId(await cookies());
  if (!visitorId) {
    return NextResponse.json(
      { error: "Keine Besucher-Session — bitte Seite neu laden." },
      { status: 401 }
    );
  }

  const db = getDb();
  const notebook = await getNotebook(db, visitorId, notebookId);
  if (!notebook) {
    return NextResponse.json(
      { error: "Dossier nicht gefunden." },
      { status: 404 }
    );
  }

  const updated = await retrySource(db, notebookId, sourceId);
  if (!updated) {
    return NextResponse.json(
      { error: "Quelle nicht gefunden." },
      { status: 404 }
    );
  }

  if (updated.type !== "text") {
    after(() => processSource(getDb(), notebookId, sourceId));
  }

  return NextResponse.json({ source: updated });
}
```

- [ ] **Step 8: Test laufen lassen — muss bestehen**

Run: `npm test -- tests/api/notebooks-sources-item.test.ts`
Expected: PASS (4 Tests)

- [ ] **Step 9: Gesamten Suite-Lauf + Commit**

Run: `npm test && npx tsc --noEmit`
Expected: alle Tests grün, keine Typfehler

```bash
git add src/app/api/notebooks/[id]/sources tests/api/notebooks-sources.test.ts tests/api/notebooks-sources-item.test.ts
git commit -m "feat: Sources-API-Routen (anlegen, auflisten, löschen, retry)"
```

---

### Task 10: Quellen-Formular und -Panel (UI-Komponenten)

**Files:**
- Create: `src/components/workspace/SourceForm.tsx`
- Create: `src/components/workspace/SourcesPanel.tsx`
- Test: `tests/components/source-form.test.tsx`
- Test: `tests/components/sources-panel.test.tsx`

**Interfaces:**
- Consumes: `ActionButton` (`src/components/ui/ActionButton.tsx`), `SectionLabel` (`src/components/ui/SectionLabel.tsx`), `@vercel/blob/client`, `UPLOAD_MAX_SIZES` (`src/lib/ingestion/upload-limits.ts`, Task 8) — für die sofortige Größen-Vorprüfung vor dem Upload
- Produces: `type SourceListItem = { id: string; type: "pdf"|"text"|"url"|"youtube"|"audio"; status: "pending"|"processing"|"ready"|"error"; title: string; errorMessage: string | null }` (aus `SourcesPanel.tsx`), `SourceForm({ notebookId, onCreated })`, `SourcesPanel({ notebookId, initialSources })`

- [ ] **Step 1: Failing Test für SourceForm schreiben**

`tests/components/source-form.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SourceForm } from "@/components/workspace/SourceForm";

const uploadMock = vi.fn();
vi.mock("@vercel/blob/client", () => ({
  upload: uploadMock,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  uploadMock.mockReset();
});

describe("SourceForm", () => {
  it("sendet einen Text als neue Quelle und leert das Feld", async () => {
    const onCreated = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          source: {
            id: "s-1",
            type: "text",
            status: "ready",
            title: "Text",
            errorMessage: null,
          },
        }),
      })
    );
    const user = userEvent.setup();
    render(<SourceForm notebookId="nb-1" onCreated={onCreated} />);

    await user.type(
      screen.getByPlaceholderText("Text einfügen …"),
      "Mein Text"
    );
    await user.click(screen.getByRole("button", { name: "Hinzufügen" }));

    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith(
        expect.objectContaining({ id: "s-1" })
      )
    );
    expect(screen.getByPlaceholderText("Text einfügen …")).toHaveValue("");
  });

  it("zeigt eine Fehlermeldung ohne Signalfarbe bei einer 429-Antwort", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Maximal 8 Quellen pro Dossier." }),
      })
    );
    const user = userEvent.setup();
    render(<SourceForm notebookId="nb-1" onCreated={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("Text einfügen …"), "Text");
    await user.click(screen.getByRole("button", { name: "Hinzufügen" }));

    const banner = await screen.findByText("Maximal 8 Quellen pro Dossier.");
    expect(banner.className).toContain("bg-paper");
    expect(banner.className).not.toContain("bg-signal");
  });

  it("lädt eine PDF-Datei zu Blob hoch und legt danach die Quelle an", async () => {
    uploadMock.mockResolvedValue({ url: "https://blob.example/x.pdf" });
    const onCreated = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        source: {
          id: "s-2",
          type: "pdf",
          status: "pending",
          title: "doku.pdf",
          errorMessage: null,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<SourceForm notebookId="nb-1" onCreated={onCreated} />);

    await user.selectOptions(screen.getByRole("combobox"), "pdf");
    const file = new File(["%PDF-1.4"], "doku.pdf", {
      type: "application/pdf",
    });
    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    await user.upload(input, file);

    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith(
        expect.objectContaining({ id: "s-2" })
      )
    );
    expect(uploadMock).toHaveBeenCalledWith(
      "doku.pdf",
      file,
      expect.objectContaining({
        handleUploadUrl: "/api/notebooks/nb-1/blob-upload-token",
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/notebooks/nb-1/sources",
      expect.objectContaining({
        body: JSON.stringify({
          type: "pdf",
          title: "doku.pdf",
          blobUrl: "https://blob.example/x.pdf",
        }),
      })
    );
  });

  it("lehnt eine zu große PDF-Datei sofort ab, ohne einen Upload zu starten", async () => {
    const oversized = new File(
      [new Uint8Array(16 * 1024 * 1024)],
      "riesig.pdf",
      { type: "application/pdf" }
    );
    const user = userEvent.setup();
    render(<SourceForm notebookId="nb-1" onCreated={vi.fn()} />);

    await user.selectOptions(screen.getByRole("combobox"), "pdf");
    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    await user.upload(input, oversized);

    expect(
      await screen.findByText(
        "PDF-Dateien dürfen höchstens 15 MB groß sein."
      )
    ).toBeInTheDocument();
    expect(uploadMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `npm test -- tests/components/source-form.test.tsx`
Expected: FAIL — `Cannot find module '@/components/workspace/SourceForm'`

- [ ] **Step 3: SourcesPanel-Typ vorab anlegen (wird von SourceForm importiert)**

`src/components/workspace/SourcesPanel.tsx` (zunächst nur der Typ-Export, der volle Inhalt kommt in Step 5):

```tsx
export type SourceListItem = {
  id: string;
  type: "pdf" | "text" | "url" | "youtube" | "audio";
  status: "pending" | "processing" | "ready" | "error";
  title: string;
  errorMessage: string | null;
};
```

- [ ] **Step 4: SourceForm implementieren**

`src/components/workspace/SourceForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { upload } from "@vercel/blob/client";
import { ActionButton } from "@/components/ui/ActionButton";
import { UPLOAD_MAX_SIZES } from "@/lib/ingestion/upload-limits";
import type { SourceListItem } from "./SourcesPanel";

const SIZE_ERROR: Record<"pdf" | "audio", string> = {
  pdf: "PDF-Dateien dürfen höchstens 15 MB groß sein.",
  audio: "Audio-Dateien dürfen höchstens 25 MB groß sein.",
};

export function SourceForm({
  notebookId,
  onCreated,
}: {
  notebookId: string;
  onCreated: (source: SourceListItem) => void;
}) {
  const [type, setType] = useState<SourceListItem["type"]>("text");
  const [textValue, setTextValue] = useState("");
  const [urlValue, setUrlValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitSource(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/sources`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(
          json.error ?? "Das hat nicht geklappt — bitte nochmal versuchen."
        );
        return;
      }
      const json = await res.json();
      onCreated(json.source);
    } catch {
      setError("Keine Verbindung — bitte nochmal versuchen.");
    } finally {
      setBusy(false);
    }
  }

  async function handleTextSubmit() {
    if (!textValue.trim()) return;
    await submitSource({ type: "text", content: textValue });
    setTextValue("");
  }

  async function handleUrlSubmit() {
    if (!urlValue.trim()) return;
    await submitSource({ type, originalUrl: urlValue });
    setUrlValue("");
  }

  async function handleFileSelect(file: File, fileType: "pdf" | "audio") {
    if (file.size > UPLOAD_MAX_SIZES[fileType]) {
      setError(SIZE_ERROR[fileType]);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: `/api/notebooks/${notebookId}/blob-upload-token`,
        clientPayload: JSON.stringify({ type: fileType }),
      });
      await submitSource({
        type: fileType,
        title: file.name,
        blobUrl: blob.url,
      });
    } catch {
      setError("Der Upload ist fehlgeschlagen — bitte nochmal versuchen.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-b-[1.5px] border-ink pb-3">
      <select
        value={type}
        onChange={(e) =>
          setType(e.target.value as SourceListItem["type"])
        }
        className="border-[1.5px] border-ink bg-paper px-2 py-1 text-sm"
      >
        <option value="text">Text</option>
        <option value="pdf">PDF</option>
        <option value="url">Website</option>
        <option value="youtube">YouTube</option>
        <option value="audio">Audio</option>
      </select>

      {type === "text" && (
        <>
          <textarea
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            placeholder="Text einfügen …"
            className="border-[1.5px] border-ink bg-paper px-2 py-1 text-sm"
            rows={3}
          />
          <ActionButton onClick={handleTextSubmit} disabled={busy}>
            Hinzufügen
          </ActionButton>
        </>
      )}

      {(type === "url" || type === "youtube") && (
        <>
          <input
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            placeholder={type === "youtube" ? "YouTube-URL …" : "Website-URL …"}
            className="border-[1.5px] border-ink bg-paper px-2 py-1 text-sm"
          />
          <ActionButton onClick={handleUrlSubmit} disabled={busy}>
            Hinzufügen
          </ActionButton>
        </>
      )}

      {(type === "pdf" || type === "audio") && (
        <input
          type="file"
          accept={type === "pdf" ? "application/pdf" : "audio/*"}
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileSelect(file, type);
            e.target.value = "";
          }}
          className="text-sm"
        />
      )}

      {error && (
        <p className="border-[1.5px] border-ink bg-paper px-2 py-1 text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Test laufen lassen — muss bestehen**

Run: `npm test -- tests/components/source-form.test.tsx`
Expected: PASS (4 Tests)

- [ ] **Step 6: Failing Test für SourcesPanel schreiben**

`tests/components/sources-panel.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SourcesPanel, type SourceListItem } from "@/components/workspace/SourcesPanel";

vi.mock("@vercel/blob/client", () => ({ upload: vi.fn() }));

const PENDING: SourceListItem = {
  id: "s-1",
  type: "url",
  status: "pending",
  title: "Warten …",
  errorMessage: null,
};

const READY: SourceListItem = {
  id: "s-1",
  type: "url",
  status: "ready",
  title: "Fertig",
  errorMessage: null,
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("SourcesPanel", () => {
  it("zeigt den Leer-Zustand ohne Quellen", () => {
    render(<SourcesPanel notebookId="nb-1" initialSources={[]} />);
    expect(screen.getByText(/noch keine quellen/i)).toBeInTheDocument();
  });

  it("zeigt den Status einer Quelle", () => {
    render(<SourcesPanel notebookId="nb-1" initialSources={[READY]} />);
    expect(screen.getByText("Fertig")).toBeInTheDocument();
    expect(screen.getByText("✓ Bereit")).toBeInTheDocument();
  });

  it("pollt, solange eine Quelle wartet, und stoppt, sobald alle fertig sind", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sources: [READY] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SourcesPanel notebookId="nb-1" initialSources={[PENDING]} />);
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("✓ Bereit")).toBeInTheDocument();

    // Weitere 2s: darf NICHT nochmal abfragen, da jetzt alles ready ist
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("löscht eine Quelle nach Bestätigung durch die API", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<SourcesPanel notebookId="nb-1" initialSources={[READY]} />);
    await user.click(screen.getByText("Löschen"));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/notebooks/nb-1/sources/s-1",
      expect.objectContaining({ method: "DELETE" })
    );
    expect(screen.queryByText("Fertig")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Test laufen lassen — muss fehlschlagen**

Run: `npm test -- tests/components/sources-panel.test.tsx`
Expected: FAIL — `SourcesPanel` ist noch keine Komponente, nur der Typ existiert

- [ ] **Step 8: SourcesPanel vollständig implementieren**

`src/components/workspace/SourcesPanel.tsx` (ersetzt den Inhalt aus Step 3 komplett):

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { SourceForm } from "./SourceForm";

export type SourceListItem = {
  id: string;
  type: "pdf" | "text" | "url" | "youtube" | "audio";
  status: "pending" | "processing" | "ready" | "error";
  title: string;
  errorMessage: string | null;
};

const TYPE_LABELS: Record<SourceListItem["type"], string> = {
  pdf: "PDF",
  text: "Text",
  url: "Website",
  youtube: "YouTube",
  audio: "Audio",
};

const STATUS_LABELS: Record<SourceListItem["status"], string> = {
  pending: "⏳ Warten …",
  processing: "⏳ Verarbeitung …",
  ready: "✓ Bereit",
  error: "⚠ Fehler",
};

export function SourcesPanel({
  notebookId,
  initialSources,
}: {
  notebookId: string;
  initialSources: SourceListItem[];
}) {
  const [sources, setSources] = useState(initialSources);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const hasPending = sources.some(
      (s) => s.status === "pending" || s.status === "processing"
    );

    if (!hasPending) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    if (intervalRef.current) return;

    intervalRef.current = setInterval(async () => {
      const res = await fetch(`/api/notebooks/${notebookId}/sources`);
      const json = await res.json();
      setSources(json.sources);
    }, 2000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [sources, notebookId]);

  async function handleRetry(sourceId: string) {
    const res = await fetch(
      `/api/notebooks/${notebookId}/sources/${sourceId}/retry`,
      { method: "POST" }
    );
    if (res.ok) {
      const json = await res.json();
      setSources((prev) =>
        prev.map((s) => (s.id === sourceId ? json.source : s))
      );
    }
  }

  async function handleDelete(sourceId: string) {
    const res = await fetch(
      `/api/notebooks/${notebookId}/sources/${sourceId}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      setSources((prev) => prev.filter((s) => s.id !== sourceId));
    }
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <SourceForm
        notebookId={notebookId}
        onCreated={(source) => setSources((prev) => [...prev, source])}
      />

      <ul className="flex flex-col gap-2 overflow-y-auto">
        {sources.length === 0 && (
          <li className="text-sm text-ink/60">
            Noch keine Quellen. PDF, Website, YouTube oder Audio hinzufügen.
          </li>
        )}
        {sources.map((s) => (
          <li
            key={s.id}
            className="border-[1.5px] border-ink bg-paper p-2 text-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate">{s.title}</span>
              <SectionLabel>{TYPE_LABELS[s.type]}</SectionLabel>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-ink/60">
              <span>{STATUS_LABELS[s.status]}</span>
              <div className="flex gap-2">
                {s.status === "error" && (
                  <button
                    onClick={() => handleRetry(s.id)}
                    className="underline"
                  >
                    Erneut versuchen
                  </button>
                )}
                <button
                  onClick={() => handleDelete(s.id)}
                  className="underline"
                >
                  Löschen
                </button>
              </div>
            </div>
            {s.status === "error" && s.errorMessage && (
              <p className="mt-1 text-xs text-ink/60">{s.errorMessage}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 9: Beide Tests laufen lassen — müssen bestehen**

Run: `npm test -- tests/components/source-form.test.tsx tests/components/sources-panel.test.tsx`
Expected: PASS (8 Tests)

- [ ] **Step 10: Commit**

```bash
git add src/components/workspace/SourceForm.tsx src/components/workspace/SourcesPanel.tsx tests/components/source-form.test.tsx tests/components/sources-panel.test.tsx
git commit -m "feat: Quellen-Formular und -Panel mit 2-Sekunden-Polling"
```

---

### Task 11: Verdrahtung in Workspace und Notebook-Seite

**Files:**
- Modify: `src/components/workspace/NotebookWorkspace.tsx`
- Modify: `src/app/notebook/[id]/page.tsx`
- Modify: `tests/components/workspace.test.tsx`

**Interfaces:**
- Consumes: `SourcesPanel`/`SourceListItem` (Task 10), `listSources` (Task 1)
- Produces: `NotebookWorkspace({ notebook, sources })` — `sources`-Prop ist jetzt Pflicht

- [ ] **Step 1: Bestehenden Workspace-Test um `sources`-Prop erweitern**

`tests/components/workspace.test.tsx` (kompletter Inhalt):

```tsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NotebookWorkspace } from "@/components/workspace/NotebookWorkspace";

const NB = { id: "id-1", title: "Kant", number: "004" };

describe("NotebookWorkspace", () => {
  afterEach(() => cleanup());

  it("zeigt Dossier-Nummer und Titel im Header", () => {
    render(<NotebookWorkspace notebook={NB} sources={[]} />);
    expect(screen.getByText(/DOSSIER 004/)).toBeInTheDocument();
    expect(screen.getByText(/KANT/)).toBeInTheDocument();
  });

  it("rendert die drei Panels", () => {
    render(<NotebookWorkspace notebook={NB} sources={[]} />);
    expect(screen.getByText("Quellen")).toBeInTheDocument();
    expect(screen.getByText("Chat")).toBeInTheDocument();
    expect(screen.getByText("Studio")).toBeInTheDocument();
  });

  it("zeigt die Platzhalter-Texte", () => {
    render(<NotebookWorkspace notebook={NB} sources={[]} />);
    expect(screen.getByText(/noch keine quellen/i)).toBeInTheDocument();
    expect(
      screen.getByText(/füge zuerst quellen hinzu/i)
    ).toBeInTheDocument();
  });

  it("zeigt eine übergebene Quelle mit Status", () => {
    render(
      <NotebookWorkspace
        notebook={NB}
        sources={[
          {
            id: "s-1",
            type: "pdf",
            status: "ready",
            title: "Kritik.pdf",
            errorMessage: null,
          },
        ]}
      />
    );
    expect(screen.getByText("Kritik.pdf")).toBeInTheDocument();
    expect(screen.getByText("✓ Bereit")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `npm test -- tests/components/workspace.test.tsx`
Expected: FAIL — `NotebookWorkspace` erwartet noch kein `sources`-Prop, Platzhaltertext im alten Wortlaut passt evtl. nicht mehr zusammen mit der neuen Quelle

- [ ] **Step 3: NotebookWorkspace anpassen**

`src/components/workspace/NotebookWorkspace.tsx` (kompletter Inhalt):

```tsx
import Link from "next/link";
import { Panel } from "@/components/ui/Panel";
import { SourcesPanel, type SourceListItem } from "./SourcesPanel";

export type WorkspaceNotebook = {
  id: string;
  title: string;
  /** Laufende Nummer des Besuchers, z. B. "004" */
  number: string;
};

export function NotebookWorkspace({
  notebook,
  sources,
}: {
  notebook: WorkspaceNotebook;
  sources: SourceListItem[];
}) {
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-baseline justify-between border-b-2 border-ink bg-paper px-4 py-2">
        <Link href="/" className="text-lg font-bold tracking-widest">
          EVERLAST
        </Link>
        <span className="label-caps">
          DOSSIER {notebook.number} / {notebook.title.toUpperCase()}
        </span>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 p-2 lg:grid-cols-[280px_1fr_280px]">
        <Panel label="Quellen" count={sources.length}>
          <SourcesPanel notebookId={notebook.id} initialSources={sources} />
        </Panel>

        <Panel label="Chat">
          <div className="flex h-full flex-col justify-end gap-3">
            <p className="text-sm text-ink/60">
              Füge zuerst Quellen hinzu, dann kannst du hier Fragen stellen —
              mit Zitaten direkt aus deinen Dokumenten.
            </p>
            <input
              disabled
              placeholder="Frag deine Quellen …"
              className="border-[1.5px] border-ink bg-paper px-3 py-2 text-sm disabled:opacity-40"
            />
          </div>
        </Panel>

        <Panel label="Studio">
          <ul className="flex flex-col gap-2 text-sm text-ink/60">
            <li className="border border-dashed border-ink p-2">
              ▶ Audio Overview
            </li>
            <li className="border border-dashed border-ink p-2">
              Study Guide
            </li>
            <li className="border border-dashed border-ink p-2">Mind Map</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Test laufen lassen — muss bestehen**

Run: `npm test -- tests/components/workspace.test.tsx`
Expected: PASS (4 Tests)

- [ ] **Step 5: Notebook-Seite anpassen**

`src/app/notebook/[id]/page.tsx` (kompletter Inhalt):

```tsx
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { readVisitorId, UUID_RE } from "@/lib/visitor";
import { getNotebook, listNotebooks } from "@/db/repo/notebooks";
import { listSources } from "@/db/repo/sources";
import { NotebookWorkspace } from "@/components/workspace/NotebookWorkspace";

export const dynamic = "force-dynamic";

export default async function NotebookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const visitorId = readVisitorId(await cookies());
  if (!visitorId || !UUID_RE.test(id)) notFound();

  const db = getDb();
  const nb = await getNotebook(db, visitorId, id);
  if (!nb) notFound();

  // Laufende Nummer = Position in der Liste des Besitzers
  const all = await listNotebooks(db, nb.visitorId);
  const position = all.findIndex((n) => n.id === nb.id) + 1;

  const sources = await listSources(db, nb.id);

  return (
    <NotebookWorkspace
      notebook={{
        id: nb.id,
        title: nb.title,
        number: String(position).padStart(3, "0"),
      }}
      sources={sources.map((s) => ({
        id: s.id,
        type: s.type,
        status: s.status,
        title: s.title,
        errorMessage: s.errorMessage,
      }))}
    />
  );
}
```

- [ ] **Step 6: Build prüfen**

Run: `npm run build`
Expected: Build erfolgreich (die Seite ist `force-dynamic`, keine DB-Verbindung zur Build-Zeit nötig)

- [ ] **Step 7: Commit**

```bash
git add src/components/workspace/NotebookWorkspace.tsx "src/app/notebook/[id]/page.tsx" tests/components/workspace.test.tsx
git commit -m "feat: Quellen-Panel in Workspace und Notebook-Seite verdrahtet"
```

---

### Task 12: Abschluss — Umgebungsvariablen, Gesamtlauf & Verifikation

**Files:**
- Modify: `.env.example`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: alles aus Tasks 1–11
- Produces: dokumentiertes, vollständig verifiziertes Phase-2-Feature

- [ ] **Step 1: .env.example um neue Variablen ergänzen**

`.env.example` (kompletter Inhalt):

```bash
# Neon Postgres (https://neon.tech — Free Tier reicht)
DATABASE_URL=postgresql://user:pass@host/dbname?sslmode=require

# Claude API (Tokenzählung für Quellen-Limits)
ANTHROPIC_API_KEY=

# OpenAI (nur für Whisper-Audiotranskription)
OPENAI_API_KEY=

# Vercel Blob (Datei-Uploads — im Vercel-Dashboard einen Blob-Store anlegen
# und den Token hierher kopieren; lokal nötig, auf Vercel selbst automatisch gesetzt)
BLOB_READ_WRITE_TOKEN=

# Limits (optional — Defaults siehe src/lib/limits.ts)
# LIMIT_NOTEBOOKS_PER_VISITOR=5
# LIMIT_SOURCES_PER_NOTEBOOK=8
# LIMIT_TOKENS_PER_NOTEBOOK=100000
# LIMIT_CHAT_PER_VISITOR_DAY=30
# LIMIT_ARTIFACTS_PER_VISITOR_DAY=10
```

- [ ] **Step 2: AGENTS.md und CLAUDE.md um Ingestion-Konvention ergänzen**

In `AGENTS.md` nach der Zeile `- Autorisierung im Repo-Layer: ...` einfügen:

```markdown
- Quellen-Ingestion: alle externen SDKs (`unpdf`, `@mozilla/readability`, `linkedom`,
  `youtubei.js`, `openai`, `@anthropic-ai/sdk`, `@vercel/blob/client`) werden in Tests
  immer mit `vi.mock` ersetzt — nie echte Netzwerk-/API-Aufrufe. Extraktions-Module
  werfen ausschließlich `IngestionError` (`src/lib/ingestion/errors.ts`) mit einer
  fertigen deutschen Meldung; der Orchestrator (`processSource`) normalisiert alle
  anderen Fehler zu einer generischen Meldung und wirft selbst niemals nach außen.
```

Denselben Absatz auch in `CLAUDE.md` an derselben Stelle einfügen (beide Dateien sind bewusste Duplikate).

- [ ] **Step 3: README um neue Setup-Schritte ergänzen**

In `README.md` den Abschnitt „## Setup (lokal)" ersetzen durch:

```markdown
## Setup (lokal)

1. `npm install`
2. Neon-Postgres anlegen (https://neon.tech, Free Tier) und `DATABASE_URL`
   in `.env.local` eintragen (Vorlage: `.env.example`)
3. Migrationen einspielen: `npx drizzle-kit migrate`
4. Für Quellen-Ingestion zusätzlich in `.env.local` eintragen:
   - `ANTHROPIC_API_KEY` (Claude API — Tokenzählung)
   - `OPENAI_API_KEY` (OpenAI — nur für Audio-Transkription)
   - `BLOB_READ_WRITE_TOKEN` (Vercel Blob — im Vercel-Dashboard einen Blob-Store
     anlegen und den Token kopieren)
5. `npm run dev` → http://localhost:3000
```

- [ ] **Step 4: Kompletten Test-Lauf ausführen**

Run: `npm test`
Expected: alle Tests aus Tasks 1–11 grün, keine Skips (deutlich über 41 Tests aus Phase 1 — Phase 2 fügt rund 45 weitere hinzu)

Run: `npx tsc --noEmit && npm run lint`
Expected: keine Fehler

Run: `npm run build`
Expected: Build erfolgreich, keine echte DB-/API-Verbindung nötig

- [ ] **Step 5: Manuelle Verifikations-Checkliste (dokumentieren, nicht ausführbar ohne echte Keys)**

Diese Checkliste braucht `DATABASE_URL`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` und `BLOB_READ_WRITE_TOKEN` in `.env.local` — nicht Teil des automatisierten Laufs:

1. Notebook öffnen → im Quellen-Panel einen Text einfügen → erscheint sofort mit „✓ Bereit"
2. Eine Website-URL eintragen → Status wechselt von „⏳ Warten …" über Polling zu „✓ Bereit" oder zeigt eine deutsche Fehlermeldung
3. Eine PDF-Datei hochladen → Fortschritt sichtbar, danach „✓ Bereit"
4. Eine YouTube-URL ohne Transkript eintragen → „⚠ Fehler" mit „Für dieses Video ist kein Transkript verfügbar." + „Erneut versuchen"-Button funktioniert
5. Neun Quellen in einem Notebook anlegen → die neunte liefert die Limit-Meldung
6. Eine Quelle löschen → verschwindet sofort aus der Liste

- [ ] **Step 6: Commit**

```bash
git add .env.example AGENTS.md CLAUDE.md README.md
git commit -m "docs: Env-Variablen und Setup-Schritte für Quellen-Ingestion"
```

---

## Ausblick

Phase 3 (Chat + Zitate) baut direkt auf `source.content` auf: alle `ready`-Quellen eines Notebooks werden als Dokument-Blöcke mit `citations: {enabled: true}` an die Claude API gegeben, mit Prompt Caching auf dem letzten Block. Die in Phase 2 gespeicherten `meta`-Felder (Seiten-Offsets, YouTube-Zeitstempel) werden dort für die Quellen-Viewer-Markierung gebraucht.
