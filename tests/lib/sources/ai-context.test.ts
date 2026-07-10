// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db/repo/sources", () => ({ listSources: vi.fn() }));
vi.mock("@/db/repo/notes", () => ({ listNotes: vi.fn() }));

import { listSources } from "@/db/repo/sources";
import { listNotes } from "@/db/repo/notes";
import { buildNotebookAiContext } from "@/lib/sources/ai-context";

beforeEach(() => {
  vi.mocked(listSources).mockResolvedValue([
    { id: "s1", title: "Quelle 1", content: "A", status: "ready", meta: null },
    { id: "s2", title: "Quelle 2", content: "B", status: "ready", meta: null },
  ] as never);
  vi.mocked(listNotes).mockResolvedValue([
    { id: "n1", title: "Gedanke", content: "C" },
  ] as never);
});

describe("buildNotebookAiContext", () => {
  it("respektiert leere Quellenauswahl und ergänzt ausgewählte Notizen", async () => {
    const context = await buildNotebookAiContext({
      db: {} as never,
      notebookId: "nb",
      visitorId: "visitor",
      sourceIds: [],
      noteIds: ["n1"],
    });
    expect(context).toEqual([
      { id: "n1", label: "N-01", title: "Notiz: Gedanke", content: "C" },
    ]);
  });

  it("behält ohne explizite Auswahl die rückwärtskompatible Quellenauswahl", async () => {
    const context = await buildNotebookAiContext({
      db: {} as never,
      notebookId: "nb",
      visitorId: "visitor",
    });
    expect(context.map((item) => item.label)).toEqual(["S-01", "S-02"]);
  });
});
