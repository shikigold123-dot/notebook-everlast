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
  delete process.env.LIMIT_TOKENS_PER_NOTEBOOK;
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

  it("wirft LimitExceededError, wenn Text die Dossier-Token-Summe überschreitet", async () => {
    process.env.LIMIT_TOKENS_PER_NOTEBOOK = "10";
    await createSource(db, notebookId, {
      type: "text",
      title: "Eins",
      content: "A",
      tokenCount: 6,
    });

    await expect(
      createSource(db, notebookId, {
        type: "text",
        title: "Zwei",
        content: "B",
        tokenCount: 5,
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
