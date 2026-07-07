import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StudioPanel } from "@/components/workspace/StudioPanel";

describe("StudioPanel", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("deaktiviert Generierung ohne bereite Quellen", () => {
    render(
      <StudioPanel
        notebookId="nb-1"
        initialArtifacts={[]}
        initialAudioOverview={null}
        readySourceCount={0}
      />
    );

    expect(screen.getByRole("button", { name: /lernleitfaden/i })).toBeDisabled();
    expect(
      screen.getByText(/füge zuerst eine bereite quelle hinzu/i)
    ).toBeInTheDocument();
  });

  it("sendet den Artefakt-Typ und zeigt das Ergebnis", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          artifact: {
            id: "a-1",
            type: "faq",
            status: "ready",
            createdAt: "2026-07-08T10:00:00.000Z",
            content: {
              items: [{ question: "Was ist Everlast?", answer: "Ein Dossier." }],
            },
          },
        }),
      })
    );

    render(
      <StudioPanel
        notebookId="nb-1"
        initialArtifacts={[]}
        initialAudioOverview={null}
        readySourceCount={1}
      />
    );

    await user.click(screen.getByRole("button", { name: /fragen & antworten/i }));

    await screen.findByText("Was ist Everlast?");
    expect(screen.getByText("Ein Dossier.")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/notebooks/nb-1/artifacts",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ type: "faq" }),
      })
    );
  });

  it("rendert initiale Mind-Map-Daten", () => {
    render(
      <StudioPanel
        notebookId="nb-1"
        readySourceCount={1}
        initialAudioOverview={null}
        initialArtifacts={[
          {
            id: "a-1",
            type: "mindmap",
            status: "ready",
            createdAt: "2026-07-08T10:00:00.000Z",
            content: {
              label: "Root",
              children: [{ label: "Ast", children: [] }],
            },
          },
        ]}
      />
    );

    expect(screen.getByText("Root")).toBeInTheDocument();
    expect(screen.getByText("Ast")).toBeInTheDocument();
  });

  it("zeigt Serverfehler", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Kaputt" }),
      })
    );

    render(
      <StudioPanel
        notebookId="nb-1"
        initialArtifacts={[]}
        initialAudioOverview={null}
        readySourceCount={1}
      />
    );

    await user.click(screen.getByRole("button", { name: /briefing/i }));

    await waitFor(() => expect(screen.getByText("Kaputt")).toBeInTheDocument());
  });

  it("bereitet Audio Overview vor und zeigt das Skript", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          audioOverview: {
            id: "o-1",
            status: "script",
            createdAt: "2026-07-08T10:00:00.000Z",
            audioBlobUrl: null,
            durationS: 42,
            script: [
              { speaker: "A", text: "Worum geht es?" },
              { speaker: "B", text: "Um die Quellen." },
            ],
          },
        }),
      })
    );

    render(
      <StudioPanel
        notebookId="nb-1"
        initialArtifacts={[]}
        initialAudioOverview={null}
        readySourceCount={1}
      />
    );

    await user.click(screen.getByRole("button", { name: /audio vorbereiten/i }));

    await screen.findByText("Worum geht es?");
    expect(screen.getByText("Um die Quellen.")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/notebooks/nb-1/audio", {
      method: "POST",
    });
  });

  it("rendert ein initiales Audio-Skript", () => {
    render(
      <StudioPanel
        notebookId="nb-1"
        readySourceCount={1}
        initialArtifacts={[]}
        initialAudioOverview={{
          id: "o-1",
          status: "script",
          createdAt: "2026-07-08T10:00:00.000Z",
          audioBlobUrl: null,
          durationS: 61,
          script: [{ speaker: "A", text: "Willkommen im Dossier." }],
        }}
      />
    );

    expect(screen.getByText("Skript bereit")).toBeInTheDocument();
    expect(screen.getByText("Willkommen im Dossier.")).toBeInTheDocument();
    expect(screen.getByText(/Dauer ca. 1:01/i)).toBeInTheDocument();
  });
});
