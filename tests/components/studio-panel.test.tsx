import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StudioPanel } from "@/components/workspace/StudioPanel";

/** Liest den JSON-Body des letzten fetch-Aufrufs an `url` — robust gegenüber
 * zusätzlichen Feldern (z. B. sourceIds/noteIds), die hier nicht geprüft werden. */
function lastRequestBody(url: string): Record<string, unknown> | undefined {
  const call = vi
    .mocked(fetch)
    .mock.calls.find(([calledUrl]) => calledUrl === url);
  const body = (call?.[1] as RequestInit | undefined)?.body;
  return body ? JSON.parse(String(body)) : undefined;
}

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
        initialAudioOverviews={[]}
        readySourceCount={0}
      />
    );

    expect(screen.getByRole("button", { name: /präsentation/i })).toBeDisabled();
    expect(
      screen.getByText(/wähle zuerst eine bereite quelle oder notiz aus/i)
    ).toBeInTheDocument();
  });

  it("bietet alle unterstützten Output-Typen als Studio-Aktionen an", () => {
    render(
      <StudioPanel
        notebookId="nb-1"
        initialArtifacts={[]}
        initialAudioOverviews={[]}
        readySourceCount={1}
      />
    );

    for (const label of [
      "Audio",
      "Präsentation",
      "Landingpage",
      "Mindmap",
      "Bericht",
      "Karteikarten",
      "Quiz",
      "Infografik",
      "Datentabelle",
    ]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${label}$`, "i") }))
        .toBeInTheDocument();
    }
    // Video wurde aus dem Studio entfernt
    expect(
      screen.queryByRole("button", { name: /^video$/i })
    ).not.toBeInTheDocument();
  });

  it("deaktiviert Generierung im Demo-Modus", () => {
    render(
      <StudioPanel
        notebookId="nb-1"
        initialArtifacts={[]}
        initialAudioOverviews={[]}
        readySourceCount={1}
        readOnly
      />
    );

    expect(screen.getByRole("button", { name: /präsentation/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /audio/i })).toBeDisabled();
    expect(
      screen.getByText(/demo-notebook ist schreibgeschützt/i)
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
            type: "presentation",
            status: "ready",
            createdAt: "2026-07-08T10:00:00.000Z",
            content: {
              title: "Quellen-Präsentation",
              slides: [
                {
                  title: "Folie 1 Titel",
                  bullets: ["Bullet 1"]
                }
              ]
            },
          },
        }),
      })
    );

    render(
      <StudioPanel
        notebookId="nb-1"
        initialArtifacts={[]}
        initialAudioOverviews={[]}
        readySourceCount={1}
      />
    );

    await user.click(screen.getByRole("button", { name: /^präsentation$/i }));
    await user.click(screen.getByRole("button", { name: "Erstellen" }));

    // Öffne das Modal durch Klick auf das neue Feed-Element
    await user.click(screen.getByText("Notebook"));

    await screen.findByText("Quellen-Präsentation");
    expect(screen.getByText("Folie 1 Titel")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/notebooks/nb-1/artifacts",
      expect.objectContaining({ method: "POST" })
    );
    expect(lastRequestBody("/api/notebooks/nb-1/artifacts")).toEqual(
      expect.objectContaining({ type: "presentation" })
    );
  });

  it("öffnet ein Anpassen-Fenster und sendet Detailgrad, Stil und Anweisung mit", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          artifact: {
            id: "a-2",
            type: "infographic",
            status: "ready",
            createdAt: "2026-07-08T10:00:00.000Z",
            content: { title: "Infografik" },
          },
        }),
      })
    );

    render(
      <StudioPanel
        notebookId="nb-1"
        initialArtifacts={[]}
        initialAudioOverviews={[]}
        readySourceCount={1}
      />
    );

    await user.click(screen.getByRole("button", { name: /^infografik$/i }));
    expect(screen.getByText("Infografik anpassen")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /detailliert/i }));
    await user.click(screen.getByRole("button", { name: /sketchnote/i }));
    await user.type(
      screen.getByPlaceholderText(/blaues farbschema/i),
      "Fokus auf Kapitel 2"
    );
    await user.click(screen.getByRole("button", { name: "Erstellen" }));

    expect(lastRequestBody("/api/notebooks/nb-1/artifacts")).toEqual(
      expect.objectContaining({
        type: "infographic",
        detailLevel: "detailed",
        customInstructions: "Fokus auf Kapitel 2",
        visualStyle: "sketchnote",
      })
    );
    // Anpassen-Fenster ist nach dem Absenden geschlossen
    expect(screen.queryByText("Infografik anpassen")).not.toBeInTheDocument();
  });

  it("sendet Sprecherrollen und Länge für den Podcast mit", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          audioOverview: {
            id: "o-2",
            status: "script",
            createdAt: "2026-07-08T10:00:00.000Z",
            audioBlobUrl: null,
            durationS: null,
            script: [{ speaker: "A", text: "Hallo" }],
          },
        }),
      })
    );

    render(
      <StudioPanel
        notebookId="nb-1"
        initialArtifacts={[]}
        initialAudioOverviews={[]}
        readySourceCount={1}
      />
    );

    await user.click(screen.getByRole("button", { name: /^audio$/i }));
    await user.click(screen.getByRole("button", { name: /kurz · ~3 min/i }));
    await user.type(screen.getByPlaceholderText(/moderatorin/i), "Skeptikerin");
    await user.type(screen.getByPlaceholderText(/experte/i), "Enthusiast");
    await user.click(screen.getByRole("button", { name: "Erstellen" }));

    expect(lastRequestBody("/api/notebooks/nb-1/audio")).toEqual(
      expect.objectContaining({
        detailLevel: "brief",
        speakerA: "Skeptikerin",
        speakerB: "Enthusiast",
      })
    );
  });

  it("sendet ausgewählte Quellen nur bei echter Auswahl", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          artifact: {
            id: "a-1",
            type: "briefing",
            status: "ready",
            createdAt: "2026-07-08T10:00:00.000Z",
            content: { summary: "Kurz." },
          },
        }),
      })
    );

    render(
      <StudioPanel
        notebookId="nb-1"
        initialArtifacts={[]}
        initialAudioOverviews={[]}
        readySourceCount={1}
        selectedSourceIds={["s-1"]}
      />
    );

    await user.click(screen.getByRole("button", { name: /^bericht$/i }));
    await user.click(screen.getByRole("button", { name: "Erstellen" }));

    expect(lastRequestBody("/api/notebooks/nb-1/artifacts")).toEqual(
      expect.objectContaining({ type: "briefing", sourceIds: ["s-1"] })
    );
  });

  it("rendert initiale Mind-Map-Daten", async () => {
    const user = userEvent.setup();
    render(
      <StudioPanel
        notebookId="nb-1"
        readySourceCount={1}
        initialAudioOverviews={[]}
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

    // Klick auf das Element im Feed, um das Detail-Modal zu öffnen
    await user.click(screen.getByText("Notebook"));

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
        initialAudioOverviews={[]}
        readySourceCount={1}
      />
    );

    await user.click(screen.getByRole("button", { name: /^bericht$/i }));
    await user.click(screen.getByRole("button", { name: "Erstellen" }));

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
        initialAudioOverviews={[]}
        readySourceCount={1}
      />
    );

    await user.click(screen.getByRole("button", { name: /^audio$/i }));
    await user.click(screen.getByRole("button", { name: "Erstellen" }));

    // Öffne das Modal durch Klick auf das neue Feed-Element
    await user.click(screen.getByText("Notebook"));

    await screen.findByText("Worum geht es?");
    expect(screen.getByText("Um die Quellen.")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/notebooks/nb-1/audio",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("rendert ein initiales Audio-Skript", async () => {
    const user = userEvent.setup();
    render(
      <StudioPanel
        notebookId="nb-1"
        readySourceCount={1}
        initialArtifacts={[]}
        initialAudioOverviews={[{
          id: "o-1",
          status: "script",
          createdAt: "2026-07-08T10:00:00.000Z",
          audioBlobUrl: null,
          durationS: 61,
          script: [{ speaker: "A", text: "Willkommen im Notebook." }],
        }]}
      />
    );

    // Klick auf das Element im Feed, um das Modal zu öffnen
    await user.click(screen.getByText("Notebook"));
    expect(screen.getByText("Willkommen im Notebook.")).toBeInTheDocument();
  });

  it("bietet TTS-Erzeugung für ein vorhandenes Skript ohne Audiodatei an", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          audioOverview: {
            id: "o-1",
            status: "ready",
            createdAt: "2026-07-08T10:00:00.000Z",
            audioBlobUrl: "https://blob.example/audio.mp3",
            durationS: 61,
            script: [{ speaker: "A", text: "Willkommen im Notebook." }],
          },
        }),
      })
    );

    render(
      <StudioPanel
        notebookId="nb-1"
        readySourceCount={1}
        initialArtifacts={[]}
        initialAudioOverviews={[{
          id: "o-1",
          status: "script",
          createdAt: "2026-07-08T10:00:00.000Z",
          audioBlobUrl: null,
          durationS: 61,
          script: [{ speaker: "A", text: "Willkommen im Notebook." }],
        }]}
      />
    );

    await user.click(screen.getByRole("button", { name: /^audio$/i }));
    await user.click(screen.getByRole("button", { name: "Erstellen" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/notebooks/nb-1/audio",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("zeigt fehlgeschlagene Artefakte aus der API-Liste an", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          error: "Kaputt",
          artifact: {
            id: "a-1",
            type: "briefing",
            status: "error",
            createdAt: "2026-07-08T10:00:00.000Z",
            content: { message: "Kaputt" },
          },
        }),
      })
    );

    render(
      <StudioPanel
        notebookId="nb-1"
        initialArtifacts={[]}
        initialAudioOverviews={[]}
        readySourceCount={1}
      />
    );

    await user.click(screen.getByRole("button", { name: /^bericht$/i }));
    await user.click(screen.getByRole("button", { name: "Erstellen" }));

    await waitFor(() => expect(screen.getAllByText("Kaputt").length).toBe(1));
  });

  it("Karteikarten sind interaktiv: umdrehen, navigieren, als gewusst markieren", async () => {
    const user = userEvent.setup();
    render(
      <StudioPanel
        notebookId="nb-1"
        readySourceCount={1}
        initialAudioOverviews={[]}
        initialArtifacts={[
          {
            id: "a-1",
            type: "flashcards",
            status: "ready",
            createdAt: "2026-07-08T10:00:00.000Z",
            content: {
              cards: [
                { front: "Frage 1", back: "Antwort 1", difficulty: "leicht" },
                { front: "Frage 2", back: "Antwort 2", difficulty: "schwer" },
              ],
            },
          },
        ]}
      />
    );

    await user.click(screen.getByText("Notebook"));

    expect(screen.getByText("Frage 1")).toBeInTheDocument();
    expect(screen.getByText("Karte 1 / 2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /frage, zum umdrehen klicken/i }));
    expect(screen.getByText("Antwort 1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Weiß ich" }));
    expect(screen.getByText("Karte 2 / 2")).toBeInTheDocument();
    expect(screen.getByText("1 gewusst")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Zurück" }));
    expect(screen.getByText("Karte 1 / 2")).toBeInTheDocument();
    expect(screen.getByText("Frage 1")).toBeInTheDocument();
  });

  it("Quiz ist interaktiv: Antwort auswählen zeigt Feedback und Score am Ende", async () => {
    const user = userEvent.setup();
    render(
      <StudioPanel
        notebookId="nb-1"
        readySourceCount={1}
        initialAudioOverviews={[]}
        initialArtifacts={[
          {
            id: "a-1",
            type: "quiz",
            status: "ready",
            createdAt: "2026-07-08T10:00:00.000Z",
            content: {
              title: "Mini-Quiz",
              questions: [
                {
                  question: "Was ist 1+1?",
                  choices: ["1", "2", "3"],
                  answer_index: 1,
                  explanation: "1+1=2",
                },
                {
                  question: "Was ist die Hauptstadt von Deutschland?",
                  choices: ["München", "Berlin"],
                  answer_index: 1,
                  explanation: "Berlin ist die Hauptstadt.",
                },
              ],
            },
          },
        ]}
      />
    );

    await user.click(screen.getByText("Notebook"));

    expect(screen.getByText("Was ist 1+1?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Antwort B: 2" }));
    expect(screen.getByText("Richtig!")).toBeInTheDocument();
    expect(screen.getByText("1+1=2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Weiter" }));
    expect(screen.getByText("Was ist die Hauptstadt von Deutschland?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Antwort A: München" }));
    expect(screen.getByText("Nicht ganz.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ergebnis anzeigen" }));
    expect(screen.getByText("1 von 2 richtig")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Neu starten" }));
    expect(screen.getByText("Was ist 1+1?")).toBeInTheDocument();
  });

  it("zeigt den Quellen-Umfang-Umschalter nur bei teilweiser Auswahl und sendet bei 'Alle' keine sourceIds", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          artifact: {
            id: "a-3",
            type: "briefing",
            status: "ready",
            createdAt: "2026-07-08T10:00:00.000Z",
            content: { summary: "Kurz." },
          },
        }),
      })
    );

    render(
      <StudioPanel
        notebookId="nb-1"
        initialArtifacts={[]}
        initialAudioOverviews={[]}
        readySourceCount={3}
        selectedSourceIds={["s-1"]}
      />
    );

    await user.click(screen.getByRole("button", { name: /^bericht$/i }));
    expect(screen.getByText(/quellen-umfang/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /alle quellen \(3\)/i })
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /alle quellen \(3\)/i }));
    await user.click(screen.getByRole("button", { name: "Erstellen" }));

    const body = lastRequestBody("/api/notebooks/nb-1/artifacts");
    expect(body).not.toHaveProperty("sourceIds");
  });

  it("blendet den Quellen-Umfang-Umschalter aus, wenn bereits alle Quellen ausgewählt sind", async () => {
    const user = userEvent.setup();
    render(
      <StudioPanel
        notebookId="nb-1"
        initialArtifacts={[]}
        initialAudioOverviews={[]}
        readySourceCount={1}
        selectedSourceIds={["s-1"]}
      />
    );

    await user.click(screen.getByRole("button", { name: /^bericht$/i }));
    expect(screen.queryByText(/quellen-umfang/i)).not.toBeInTheDocument();
  });

  it("bietet bei der Datentabelle einen Excel-Export an", async () => {
    const user = userEvent.setup();
    render(
      <StudioPanel
        notebookId="nb-1"
        readySourceCount={1}
        initialAudioOverviews={[]}
        initialArtifacts={[
          {
            id: "a-1",
            type: "data_table",
            status: "ready",
            createdAt: "2026-07-08T10:00:00.000Z",
            content: {
              title: "Vergleich",
              columns: ["Name", "Wert"],
              rows: [["Alpha", "1"]],
            },
          },
        ]}
      />
    );

    await user.click(screen.getByText("Notebook"));
    expect(screen.getByText("Vergleich")).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /excel/i })
    ).toBeInTheDocument();
  });

  it("generiert eine Landingpage als website-Artefakt", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          artifact: {
            id: "a-1",
            type: "website",
            status: "ready",
            createdAt: "2026-07-08T10:00:00.000Z",
            content: { title: "Landingpage", html: "<!doctype html><html></html>" },
          },
        }),
      })
    );

    render(
      <StudioPanel
        notebookId="nb-1"
        initialArtifacts={[]}
        initialAudioOverviews={[]}
        readySourceCount={1}
      />
    );

    await user.click(screen.getByRole("button", { name: /^landingpage$/i }));
    await user.click(screen.getByRole("button", { name: "Erstellen" }));

    const body = lastRequestBody("/api/notebooks/nb-1/artifacts");
    expect(body).toEqual(expect.objectContaining({ type: "website" }));
  });
});
