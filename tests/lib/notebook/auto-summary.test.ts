// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../helpers/db";
import type { Db } from "@/db";
import { createNotebook } from "@/db/repo/notebooks";
import { createSource } from "@/db/repo/sources";
import { listChatMessages } from "@/db/repo/chat";
import { source as sourceTable } from "@/db/schema";
import {
  buildSummarySources,
  writeNotebookAutoSummary,
} from "@/lib/notebook/auto-summary";

const VISITOR = "aaaaaaaa-0000-4000-8000-000000000001";

let db: Db;
let notebookId: string;

beforeEach(async () => {
  db = (await createTestDb()) as unknown as Db;
  const notebook = await createNotebook(db, VISITOR, "Summary");
  notebookId = notebook.id;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_MODEL;
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_MODEL;
});

describe("buildSummarySources", () => {
  it("nutzt nur bereite verwertbare Quellen", async () => {
    const textSource = await createSource(db, notebookId, {
      type: "text",
      title: "Text",
      content: "Ein verwertbarer Quellentext.",
      tokenCount: 4,
    });
    const metadataOnly = await createSource(db, notebookId, {
      type: "youtube",
      title: "Video ohne Transkript",
      content:
        "YouTube-Metadaten: Für dieses Video ist kein Transkript verfügbar.",
      tokenCount: 8,
      meta: { transcriptAvailable: false },
    });
    await db
      .update(sourceTable)
      .set({ status: "ready" })
      .where(eq(sourceTable.id, metadataOnly.id));

    const sources = buildSummarySources([
      textSource,
      {
        ...metadataOnly,
        status: "ready",
      },
    ]);

    expect(sources).toEqual([
      {
        label: "S-01",
        title: "Text",
        type: "text",
        content: "Ein verwertbarer Quellentext.",
      },
    ]);
  });
});

describe("writeNotebookAutoSummary", () => {
  it("überspringt die Zusammenfassung ohne OpenRouter-Key", async () => {
    await createSource(db, notebookId, {
      type: "text",
      title: "Quelle",
      content: "Quellentext",
      tokenCount: 3,
    });

    const result = await writeNotebookAutoSummary(db, notebookId);

    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(await listChatMessages(db, notebookId)).toHaveLength(0);
  });

  it("schreibt eine automatische Assistant-Zusammenfassung", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.OPENROUTER_MODEL = "test/model";
    await createSource(db, notebookId, {
      type: "text",
      title: "Quelle",
      content: "Quellentext",
      tokenCount: 3,
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "Das Notebook handelt von X." } }],
        }),
        { status: 200 }
      )
    );

    const result = await writeNotebookAutoSummary(db, notebookId);

    expect(result?.role).toBe("assistant");
    expect(result?.content).toBe(
      "Automatische Notebook-Zusammenfassung\n\nDas Notebook handelt von X."
    );
    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    expect(body.model).toBe("test/model");
    expect(body.messages[1].content).toContain("Quellentext");
    expect(await listChatMessages(db, notebookId)).toHaveLength(1);
  });
});
