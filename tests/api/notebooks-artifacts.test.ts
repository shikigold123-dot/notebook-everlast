// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../helpers/db";
import type { Db } from "@/db";
import { createNotebook } from "@/db/repo/notebooks";
import { createSource } from "@/db/repo/sources";
import { listArtifacts } from "@/db/repo/artifacts";
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

const generateArtifactContentMock = vi.fn();
vi.mock("@/lib/artifacts/openrouter", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/artifacts/openrouter")>();
  return {
    ...actual,
    generateArtifactContent: (...args: unknown[]) =>
      generateArtifactContentMock(...args),
  };
});

import { GET, POST } from "@/app/api/notebooks/[id]/artifacts/route";
import { ArtifactGenerationError } from "@/lib/artifacts/openrouter";

const VISITOR = "aaaaaaaa-0000-4000-8000-000000000001";
let notebookId: string;

beforeEach(async () => {
  testDb = (await createTestDb()) as unknown as Db;
  const nb = await createNotebook(testDb, VISITOR, "Studio");
  notebookId = nb.id;
  cookieValue = VISITOR;
  generateArtifactContentMock.mockReset().mockResolvedValue({
    items: [{ question: "Q", answer: "A" }],
  });
  delete process.env.LIMIT_ARTIFACTS_PER_VISITOR_DAY;
  delete process.env.DAILY_BUDGET_CENTS;
});

function ctx(id = notebookId) {
  return { params: Promise.resolve({ id }) };
}

function postRequest(body: unknown) {
  return new Request(`http://localhost/api/notebooks/${notebookId}/artifacts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/notebooks/[id]/artifacts", () => {
  it("generiert ein Artefakt aus ready-Quellen und persistiert es", async () => {
    const source = await createSource(testDb, notebookId, {
      type: "text",
      title: "Quelle",
      content: "Quellentext",
      tokenCount: 3,
    });

    const res = await POST(postRequest({ type: "faq" }), ctx());

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.artifact.type).toBe("faq");
    expect(json.artifact.content).toEqual({
      items: [{ question: "Q", answer: "A" }],
    });
    expect(generateArtifactContentMock).toHaveBeenCalledWith({
      type: "faq",
      sources: [
        {
          id: source.id,
          label: "S-01",
          title: "Quelle",
          content: "Quellentext",
        },
      ],
    });

    const rows = await listArtifacts(testDb, notebookId);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("ready");
  });

  it("respektiert eine explizit leere Quellenauswahl", async () => {
    await createSource(testDb, notebookId, {
      type: "text",
      title: "Quelle",
      content: "Quellentext",
      tokenCount: 3,
    });

    const res = await POST(postRequest({ type: "faq", sourceIds: [] }), ctx());

    expect(res.status).toBe(400);
    expect(generateArtifactContentMock).not.toHaveBeenCalled();
  });

  it("akzeptiert NotebookLM-ähnliche Studio-Typen", async () => {
    await createSource(testDb, notebookId, {
      type: "text",
      title: "Quelle",
      content: "Quellentext",
      tokenCount: 3,
    });
    generateArtifactContentMock.mockResolvedValue({
      title: "Quiz",
      questions: [],
    });

    const res = await POST(postRequest({ type: "quiz" }), ctx());

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.artifact.type).toBe("quiz");
    expect(generateArtifactContentMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "quiz" })
    );
  });

  it("akzeptiert Website als neuen Output-Typ", async () => {
    await createSource(testDb, notebookId, {
      type: "text",
      title: "Quelle",
      content: "Quellentext",
      tokenCount: 3,
    });
    generateArtifactContentMock.mockResolvedValue({
      title: "Website",
      html: "<!doctype html><html><body>Hallo</body></html>",
    });

    const res = await POST(postRequest({ type: "website" }), ctx());

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.artifact.type).toBe("website");
    expect(generateArtifactContentMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "website" })
    );
  });

  it("reicht Detailgrad, Freitext und visuellen Stil an die Generierung durch", async () => {
    await createSource(testDb, notebookId, {
      type: "text",
      title: "Quelle",
      content: "Quellentext",
      tokenCount: 3,
    });
    generateArtifactContentMock.mockResolvedValue({
      title: "Infografik",
      imageUrl: "https://example.com/bild.png",
    });

    const res = await POST(
      postRequest({
        type: "infographic",
        detailLevel: "detailed",
        customInstructions: "Fokus auf Kapitel 2",
        visualStyle: "sketchnote",
      }),
      ctx()
    );

    expect(res.status).toBe(201);
    expect(generateArtifactContentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "infographic",
        customization: {
          detailLevel: "detailed",
          customInstructions: "Fokus auf Kapitel 2",
          visualStyle: "sketchnote",
        },
      })
    );
  });

  it("ignoriert visuellen Stil außerhalb von Infografiken und unbekannte Werte", async () => {
    await createSource(testDb, notebookId, {
      type: "text",
      title: "Quelle",
      content: "Quellentext",
      tokenCount: 3,
    });

    await POST(
      postRequest({
        type: "faq",
        detailLevel: "nicht-echt",
        visualStyle: "sketchnote",
      }),
      ctx()
    );

    expect(generateArtifactContentMock).toHaveBeenCalledWith({
      type: "faq",
      sources: expect.any(Array),
    });
  });

  it("liefert 400 ohne bereite Quellen", async () => {
    const res = await POST(postRequest({ type: "faq" }), ctx());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Wähle mindestens eine bereite Quelle oder Notiz aus.");
  });

  it("liefert 400 bei unbekanntem Typ", async () => {
    const res = await POST(postRequest({ type: "karte" }), ctx());
    expect(res.status).toBe(400);
  });

  it("liefert 401 ohne Besucher-Cookie", async () => {
    cookieValue = undefined;
    const res = await POST(postRequest({ type: "faq" }), ctx());
    expect(res.status).toBe(401);
  });

  it("liefert 404 für ein fremdes Notebook", async () => {
    const res = await POST(postRequest({ type: "faq" }), {
      params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000000" }),
    });
    expect(res.status).toBe(404);
  });

  it("blockiert Schreibzugriff auf Demo-Notebooks", async () => {
    await testDb
      .update(notebook)
      .set({ isDemo: true })
      .where(eq(notebook.id, notebookId));

    const res = await POST(postRequest({ type: "faq" }), ctx());
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("Demo-Notebook ist schreibgeschützt.");
  });

  it("normalisiert OpenRouter-Fehler", async () => {
    await createSource(testDb, notebookId, {
      type: "text",
      title: "Quelle",
      content: "Quellentext",
      tokenCount: 3,
    });
    generateArtifactContentMock.mockRejectedValue(
      new ArtifactGenerationError("Kaputt")
    );

    const res = await POST(postRequest({ type: "faq" }), ctx());

    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toBe("Kaputt");
    expect(json.artifact.status).toBe("error");
    expect(json.artifact.content).toEqual({ message: "Kaputt" });

    const rows = await listArtifacts(testDb, notebookId);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("error");
  });

  it("liefert keinen Fehler 429 bei Überschreitung des Artefakt-Tageslimits", async () => {
    process.env.LIMIT_ARTIFACTS_PER_VISITOR_DAY = "1";
    await createSource(testDb, notebookId, {
      type: "text",
      title: "Quelle",
      content: "Quellentext",
      tokenCount: 3,
    });

    await POST(postRequest({ type: "faq" }), ctx());
    const res = await POST(postRequest({ type: "briefing" }), ctx());

    expect(res.status).toBe(201);
  });
});

describe("GET /api/notebooks/[id]/artifacts", () => {
  it("listet die Artefakte des Notebooks", async () => {
    await createSource(testDb, notebookId, {
      type: "text",
      title: "Quelle",
      content: "Quellentext",
      tokenCount: 3,
    });
    await POST(postRequest({ type: "faq" }), ctx());

    const res = await GET(new Request("http://localhost"), ctx());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.artifacts).toHaveLength(1);
  });

  it("liefert eine leere Liste ohne Cookie", async () => {
    cookieValue = undefined;
    const res = await GET(new Request("http://localhost"), ctx());
    const json = await res.json();
    expect(json.artifacts).toEqual([]);
  });
});
