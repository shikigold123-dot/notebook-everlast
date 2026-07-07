// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../helpers/db";
import {
  listNotebooks,
  listVisibleNotebooks,
  createNotebook,
  getNotebook,
  LimitExceededError,
} from "@/db/repo/notebooks";
import { notebook, visitor } from "@/db/schema";
import type { Db } from "@/db";

const VISITOR_A = "aaaaaaaa-0000-4000-8000-000000000001";
const VISITOR_B = "bbbbbbbb-0000-4000-8000-000000000002";

let db: Db;

beforeEach(async () => {
  db = (await createTestDb()) as unknown as Db;
});

afterEach(() => {
  delete process.env.LIMIT_NOTEBOOKS_PER_VISITOR;
});

describe("createNotebook", () => {
  it("legt Visitor lazy an und erstellt das Notebook", async () => {
    const nb = await createNotebook(db, VISITOR_A, "Kant");
    expect(nb.title).toBe("Kant");
    expect(nb.visitorId).toBe(VISITOR_A);
    const visitors = await db.select().from(visitor);
    expect(visitors).toHaveLength(1);
  });

  it("wirft LimitExceededError ab dem Limit", async () => {
    process.env.LIMIT_NOTEBOOKS_PER_VISITOR = "2";
    await createNotebook(db, VISITOR_A, "Eins");
    await createNotebook(db, VISITOR_A, "Zwei");
    await expect(createNotebook(db, VISITOR_A, "Drei")).rejects.toThrow(
      LimitExceededError
    );
  });
});

describe("listNotebooks", () => {
  it("liefert nur eigene Notebooks, älteste zuerst", async () => {
    await createNotebook(db, VISITOR_A, "Erstes");
    await createNotebook(db, VISITOR_A, "Zweites");
    await createNotebook(db, VISITOR_B, "Fremd");

    const rows = await listNotebooks(db, VISITOR_A);
    expect(rows.map((n) => n.title)).toEqual(["Erstes", "Zweites"]);
  });
});

describe("listVisibleNotebooks", () => {
  it("liefert eigene Notebooks plus Demo-Dossiers, Demo zuerst", async () => {
    await createNotebook(db, VISITOR_A, "Eigen");
    await createNotebook(db, VISITOR_B, "Fremd");
    const demo = await createNotebook(db, VISITOR_B, "Demo");
    await db
      .update(notebook)
      .set({ isDemo: true })
      .where(eq(notebook.id, demo.id));

    const rows = await listVisibleNotebooks(db, VISITOR_A);
    expect(rows.map((n) => n.title)).toEqual(["Demo", "Eigen"]);
  });
});

describe("getNotebook", () => {
  it("liefert das eigene Notebook", async () => {
    const created = await createNotebook(db, VISITOR_A, "Meins");
    const found = await getNotebook(db, VISITOR_A, created.id);
    expect(found?.id).toBe(created.id);
  });

  it("liefert null für fremde Notebooks", async () => {
    const created = await createNotebook(db, VISITOR_A, "Meins");
    const found = await getNotebook(db, VISITOR_B, created.id);
    expect(found).toBeNull();
  });

  it("liefert Demo-Notebooks für jeden", async () => {
    const created = await createNotebook(db, VISITOR_A, "Demo");
    await db
      .update(notebook)
      .set({ isDemo: true })
      .where(eq(notebook.id, created.id));
    const found = await getNotebook(db, VISITOR_B, created.id);
    expect(found?.isDemo).toBe(true);
  });
});
