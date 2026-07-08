// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "../helpers/db";
import type { Db } from "@/db";
import { createNotebook } from "@/db/repo/notebooks";
import {
  createQueuedAudioOverview,
  estimateScriptDuration,
  getLatestAudioOverview,
  markAudioError,
  markAudioReady,
  markAudioScript,
  markAudioSynthesizing,
} from "@/db/repo/audio";

const VISITOR = "aaaaaaaa-0000-4000-8000-000000000001";

let db: Db;
let notebookId: string;

beforeEach(async () => {
  db = (await createTestDb()) as unknown as Db;
  const nb = await createNotebook(db, VISITOR, "Audio");
  notebookId = nb.id;
});

describe("Audio-Repository", () => {
  it("legt eine Queue-Zeile an und markiert das Skript", async () => {
    const created = await createQueuedAudioOverview(db, notebookId);
    expect(created.status).toBe("queued");

    const updated = await markAudioScript(db, created.id, [
      { speaker: "A", text: "Hallo" },
      { speaker: "B", text: "Eine Antwort mit einigen Worten" },
    ]);

    expect(updated?.status).toBe("script");
    expect(updated?.script).toEqual([
      { speaker: "A", text: "Hallo" },
      { speaker: "B", text: "Eine Antwort mit einigen Worten" },
    ]);
    expect(updated?.durationS).toBeGreaterThan(0);
  });

  it("liefert den neuesten Audio Overview", async () => {
    await createQueuedAudioOverview(db, notebookId);
    const second = await createQueuedAudioOverview(db, notebookId);

    const latest = await getLatestAudioOverview(db, notebookId);

    expect(latest?.id).toBe(second.id);
  });

  it("filtert optional nach Besucherzugriff", async () => {
    const created = await createQueuedAudioOverview(db, notebookId);

    expect((await getLatestAudioOverview(db, notebookId, VISITOR))?.id).toBe(
      created.id
    );
    expect(
      await getLatestAudioOverview(
        db,
        notebookId,
        "bbbbbbbb-0000-4000-8000-000000000002"
      )
    ).toBeNull();
  });

  it("speichert Fehler als deutsche Skriptzeile", async () => {
    const created = await createQueuedAudioOverview(db, notebookId);

    const updated = await markAudioError(db, created.id, "Kaputt");

    expect(updated?.status).toBe("error");
    expect(updated?.script).toEqual([{ speaker: "A", text: "Kaputt" }]);
  });

  it("setzt Synthese- und Ready-Status", async () => {
    const created = await createQueuedAudioOverview(db, notebookId);
    const synthesizing = await markAudioSynthesizing(db, created.id);
    expect(synthesizing?.status).toBe("synthesizing");

    const ready = await markAudioReady(db, created.id, {
      audioBlobUrl: "https://blob.example/audio.mp3",
      durationS: 120,
    });

    expect(ready?.status).toBe("ready");
    expect(ready?.audioBlobUrl).toBe("https://blob.example/audio.mp3");
    expect(ready?.durationS).toBe(120);
  });

  it("schätzt Dauer aus Wortanzahl", () => {
    expect(
      estimateScriptDuration([{ speaker: "A", text: "eins zwei drei vier" }])
    ).toBeGreaterThan(0);
  });
});
