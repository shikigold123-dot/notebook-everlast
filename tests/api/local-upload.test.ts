// @vitest-environment node
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../helpers/db";
import type { Db } from "@/db";
import { createNotebook } from "@/db/repo/notebooks";
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

import { POST } from "@/app/api/notebooks/[id]/local-upload/route";

const VISITOR = "aaaaaaaa-0000-4000-8000-000000000001";
let notebookId: string;

beforeEach(async () => {
  testDb = (await createTestDb()) as unknown as Db;
  const nb = await createNotebook(testDb, VISITOR, "Upload");
  notebookId = nb.id;
  cookieValue = VISITOR;
});

afterEach(async () => {
  await rm(path.join(process.cwd(), "public", "uploads", notebookId), {
    recursive: true,
    force: true,
  });
});

function ctx(id = notebookId) {
  return { params: Promise.resolve({ id }) };
}

function uploadRequest(file: File, type: "pdf" | "audio" = "pdf") {
  const form = new FormData();
  form.set("type", type);
  form.set("file", file);
  return new Request(`http://localhost/api/notebooks/${notebookId}/local-upload`, {
    method: "POST",
    body: form,
  });
}

describe("POST /api/notebooks/[id]/local-upload", () => {
  it("speichert eine PDF lokal und liefert eine abrufbare URL", async () => {
    await mkdir(path.join(process.cwd(), "public", "uploads"), {
      recursive: true,
    });
    const file = new File(["%PDF-1.4"], "doku.pdf", {
      type: "application/pdf",
    });

    const res = await POST(uploadRequest(file), ctx());

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.url).toMatch(
      /^http:\/\/localhost\/uploads\/.+\/.+\.pdf$/
    );
    expect(json.pathname).toMatch(/^\/uploads\/.+\/.+\.pdf$/);
  });

  it("ignoriert eine bösartige Dateiendung im Namen und speichert trotzdem als .pdf", async () => {
    await mkdir(path.join(process.cwd(), "public", "uploads"), {
      recursive: true,
    });
    // Angreifer gibt application/pdf als MIME-Type vor, nennt die Datei aber
    // "evil.html" — die gespeicherte Endung darf trotzdem nicht ".html" sein
    // (Stored-XSS via same-origin HTML-Ausgabe unter /uploads).
    const file = new File(["<script>alert(1)</script>"], "evil.html", {
      type: "application/pdf",
    });

    const res = await POST(uploadRequest(file), ctx());

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.pathname).toMatch(/\.pdf$/);
    expect(json.pathname).not.toMatch(/\.html$/);
  });

  it("leitet die Audio-Endung aus dem validierten MIME-Type ab, nicht aus dem Dateinamen", async () => {
    await mkdir(path.join(process.cwd(), "public", "uploads"), {
      recursive: true,
    });
    const file = new File(["RIFF"], "evil.svg", { type: "audio/wav" });

    const res = await POST(uploadRequest(file, "audio"), ctx());

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.pathname).toMatch(/\.wav$/);
  });

  it("blockiert Demo-Dossiers", async () => {
    await testDb
      .update(notebook)
      .set({ isDemo: true })
      .where(eq(notebook.id, notebookId));

    const res = await POST(
      uploadRequest(new File(["%PDF-1.4"], "doku.pdf", { type: "application/pdf" })),
      ctx()
    );

    expect(res.status).toBe(403);
  });
});
