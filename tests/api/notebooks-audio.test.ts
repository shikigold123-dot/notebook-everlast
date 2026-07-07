// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../helpers/db";
import type { Db } from "@/db";
import { getLatestAudioOverview } from "@/db/repo/audio";
import { createNotebook } from "@/db/repo/notebooks";
import { createSource } from "@/db/repo/sources";
import { notebook } from "@/db/schema";

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

const generateAudioScriptMock = vi.fn();
vi.mock("@/lib/audio/openrouter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audio/openrouter")>();
  return {
    ...actual,
    generateAudioScript: (...args: unknown[]) => generateAudioScriptMock(...args),
  };
});

const isAudioTtsConfiguredMock = vi.fn();
const synthesizeAudioOverviewMock = vi.fn();
vi.mock("@/lib/audio/tts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audio/tts")>();
  return {
    ...actual,
    isAudioTtsConfigured: () => isAudioTtsConfiguredMock(),
    synthesizeAudioOverview: (...args: unknown[]) =>
      synthesizeAudioOverviewMock(...args),
  };
});

import { GET, POST } from "@/app/api/notebooks/[id]/audio/route";
import { AudioGenerationError } from "@/lib/audio/openrouter";
import { AudioSynthesisError } from "@/lib/audio/tts";

const VISITOR = "aaaaaaaa-0000-4000-8000-000000000001";
let notebookId: string;

beforeEach(async () => {
  testDb = (await createTestDb()) as unknown as Db;
  const nb = await createNotebook(testDb, VISITOR, "Audio");
  notebookId = nb.id;
  cookieValue = VISITOR;
  generateAudioScriptMock.mockReset().mockResolvedValue([
    { speaker: "A", text: "Frage" },
    { speaker: "B", text: "Antwort" },
  ]);
  isAudioTtsConfiguredMock.mockReset().mockReturnValue(false);
  synthesizeAudioOverviewMock.mockReset().mockResolvedValue({
    audioBlobUrl: "https://blob.example/audio.mp3",
    durationS: 42,
  });
  delete process.env.LIMIT_AUDIO_PER_VISITOR_DAY;
  delete process.env.LIMIT_AUDIO_GLOBAL_DAY;
  delete process.env.DAILY_BUDGET_CENTS;
});

function ctx(id = notebookId) {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/notebooks/[id]/audio", () => {
  it("generiert und persistiert ein Audio-Skript aus ready-Quellen", async () => {
    const source = await createSource(testDb, notebookId, {
      type: "text",
      title: "Quelle",
      content: "Quellentext",
      tokenCount: 3,
    });

    const res = await POST(new Request("http://localhost"), ctx());

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.audioOverview.status).toBe("script");
    expect(json.audioOverview.script).toEqual([
      { speaker: "A", text: "Frage" },
      { speaker: "B", text: "Antwort" },
    ]);
    expect(generateAudioScriptMock).toHaveBeenCalledWith({
      sources: [
        {
          id: source.id,
          label: "S-01",
          title: "Quelle",
          content: "Quellentext",
        },
      ],
    });

    const latest = await getLatestAudioOverview(testDb, notebookId);
    expect(latest?.status).toBe("script");
  });

  it("liefert 400 ohne bereite Quellen", async () => {
    const res = await POST(new Request("http://localhost"), ctx());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Füge zuerst eine bereite Quelle hinzu.");
  });

  it("liefert 401 ohne Besucher-Cookie", async () => {
    cookieValue = undefined;
    const res = await POST(new Request("http://localhost"), ctx());
    expect(res.status).toBe(401);
  });

  it("liefert 404 für ein fremdes Dossier", async () => {
    const res = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000000" }),
    });
    expect(res.status).toBe(404);
  });

  it("blockiert Schreibzugriff auf Demo-Dossiers", async () => {
    await testDb
      .update(notebook)
      .set({ isDemo: true })
      .where(eq(notebook.id, notebookId));

    const res = await POST(new Request("http://localhost"), ctx());
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("Demo-Dossier ist schreibgeschützt.");
  });

  it("verhindert ein zweites Audio Overview", async () => {
    await createSource(testDb, notebookId, {
      type: "text",
      title: "Quelle",
      content: "Quellentext",
      tokenCount: 3,
    });
    await POST(new Request("http://localhost"), ctx());

    const res = await POST(new Request("http://localhost"), ctx());

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("Audio Overview existiert bereits.");
  });

  it("speichert OpenRouter-Fehler in der Audio-Zeile", async () => {
    await createSource(testDb, notebookId, {
      type: "text",
      title: "Quelle",
      content: "Quellentext",
      tokenCount: 3,
    });
    generateAudioScriptMock.mockRejectedValue(
      new AudioGenerationError("Kaputt")
    );

    const res = await POST(new Request("http://localhost"), ctx());

    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toBe("Kaputt");
    expect(json.audioOverview.status).toBe("error");
  });

  it("erzeugt eine MP3, wenn TTS konfiguriert ist", async () => {
    isAudioTtsConfiguredMock.mockReturnValue(true);
    await createSource(testDb, notebookId, {
      type: "text",
      title: "Quelle",
      content: "Quellentext",
      tokenCount: 3,
    });

    const res = await POST(new Request("http://localhost"), ctx());

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.audioOverview.status).toBe("ready");
    expect(json.audioOverview.audioBlobUrl).toBe(
      "https://blob.example/audio.mp3"
    );
    expect(synthesizeAudioOverviewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        notebookId,
        script: [
          { speaker: "A", text: "Frage" },
          { speaker: "B", text: "Antwort" },
        ],
      })
    );
  });

  it("bewahrt das Skript, wenn TTS fehlschlägt", async () => {
    isAudioTtsConfiguredMock.mockReturnValue(true);
    synthesizeAudioOverviewMock.mockRejectedValue(
      new AudioSynthesisError("TTS kaputt")
    );
    await createSource(testDb, notebookId, {
      type: "text",
      title: "Quelle",
      content: "Quellentext",
      tokenCount: 3,
    });

    const res = await POST(new Request("http://localhost"), ctx());

    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toBe("TTS kaputt");
    expect(json.audioOverview.status).toBe("error");
    expect(json.audioOverview.script).toEqual([
      { speaker: "A", text: "Frage" },
      { speaker: "B", text: "Antwort" },
    ]);
  });

  it("liefert 429 ab dem Audio-Tageslimit", async () => {
    process.env.LIMIT_AUDIO_PER_VISITOR_DAY = "1";
    await createSource(testDb, notebookId, {
      type: "text",
      title: "Quelle",
      content: "Quellentext",
      tokenCount: 3,
    });

    await POST(new Request("http://localhost"), ctx());

    const other = await createNotebook(testDb, VISITOR, "Audio zwei");
    await createSource(testDb, other.id, {
      type: "text",
      title: "Quelle",
      content: "Quellentext",
      tokenCount: 3,
    });
    const res = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ id: other.id }),
    });

    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toContain("Tageslimit erreicht");
  });
});

describe("GET /api/notebooks/[id]/audio", () => {
  it("liefert den aktuellen Audio Overview", async () => {
    await createSource(testDb, notebookId, {
      type: "text",
      title: "Quelle",
      content: "Quellentext",
      tokenCount: 3,
    });
    await POST(new Request("http://localhost"), ctx());

    const res = await GET(new Request("http://localhost"), ctx());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.audioOverview.status).toBe("script");
  });

  it("liefert null ohne Cookie", async () => {
    cookieValue = undefined;
    const res = await GET(new Request("http://localhost"), ctx());
    const json = await res.json();
    expect(json.audioOverview).toBeNull();
  });
});
