import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SourcesPanel, type SourceListItem } from "@/components/workspace/SourcesPanel";

vi.mock("@vercel/blob/client", () => ({ upload: vi.fn() }));

const PENDING: SourceListItem = {
  id: "s-1",
  type: "url",
  status: "pending",
  title: "Warten …",
  errorMessage: null,
  originalUrl: null,
};

const READY: SourceListItem = {
  id: "s-1",
  type: "url",
  status: "ready",
  title: "Fertig",
  errorMessage: null,
  originalUrl: null,
};

beforeEach(() => {
  // shouldAdvanceTime: true lässt reale Mikrotasks/Timer-Ketten voranschreiten,
  // die userEvent intern nutzt (z. B. in wait()/pointer-Interaktionen) — ohne das
  // hängt user.click(...) unter vi.useFakeTimers() unendlich, weil die von
  // userEvent registrierten Zero-Delay-Timeouts nie ausgelöst werden.
  // vi.advanceTimersByTimeAsync bleibt für die gezielte Polling-Prüfung nutzbar.
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("SourcesPanel", () => {
  it("zeigt den Leer-Zustand ohne Quellen", () => {
    render(<SourcesPanel notebookId="nb-1" initialSources={[]} />);
    expect(screen.getByText(/noch keine quellen/i)).toBeInTheDocument();
  });

  it("zeigt den Status einer Quelle", () => {
    render(<SourcesPanel notebookId="nb-1" initialSources={[READY]} />);
    expect(screen.getByText("Fertig")).toBeInTheDocument();
    expect(screen.getByText("Bereit")).toBeInTheDocument();
  });

  it("blendet Schreibaktionen im Demo-Modus aus", () => {
    render(
      <SourcesPanel notebookId="nb-1" initialSources={[READY]} readOnly />
    );

    expect(
      screen.getByText("Demo-Notebook ist schreibgeschützt.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByText("Löschen")).not.toBeInTheDocument();
  });

  it("öffnet eine Quelle im Viewer", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        source: {
          ...READY,
          content: "Das ist der Quellentext.",
          tokenCount: 5,
          originalUrl: "https://example.com/artikel",
          blobUrl: null,
          createdAt: "2026-07-08T10:00:00.000Z",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const onSelectSource = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <SourcesPanel
        notebookId="nb-1"
        initialSources={[READY]}
        selectedSourceId="s-1"
        onSelectSource={onSelectSource}
      />
    );

    expect(await screen.findByText("Das ist der Quellentext.")).toBeInTheDocument();
    expect(screen.getByText(/5 Tokens/i)).toBeInTheDocument();

    await user.click(screen.getByText("Schließen"));
    expect(onSelectSource).toHaveBeenCalledWith(null);
  });

  it("markiert die zitierte Textstelle im Viewer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          source: {
            ...READY,
            content: "Alpha Beta Gamma",
            tokenCount: 3,
            originalUrl: null,
            blobUrl: null,
            createdAt: "2026-07-08T10:00:00.000Z",
          },
        }),
      })
    );

    render(
      <SourcesPanel
        notebookId="nb-1"
        initialSources={[READY]}
        selectedSourceId="s-1"
        selectedCitation={{
          sourceId: "s-1",
          label: "S-01",
          title: "Fertig",
          marker: "[S-01#6-10]",
          start: 6,
          end: 10,
          citedText: "Beta",
        }}
      />
    );

    const mark = await screen.findByText("Beta");
    expect(mark.tagName).toBe("MARK");
  });

  it("zeigt bei gefundenen Web-Quellen den Titel statt nur den Link", async () => {
    const RESEARCH_READY: SourceListItem = {
      id: "s-1",
      type: "research",
      status: "ready",
      title: "Recherche: KI-Trends",
      errorMessage: null,
      originalUrl: null,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          source: {
            ...RESEARCH_READY,
            content: "Recherchebericht …",
            tokenCount: 42,
            originalUrl: null,
            blobUrl: null,
            createdAt: "2026-07-08T10:00:00.000Z",
            meta: {
              query: "KI-Trends 2026",
              citations: ["https://example.com/artikel-ueber-ki"],
              foundSources: [
                {
                  url: "https://example.com/artikel-ueber-ki",
                  title: "Der große KI-Trendreport 2026",
                },
              ],
            },
          },
        }),
      })
    );

    render(
      <SourcesPanel
        notebookId="nb-1"
        initialSources={[RESEARCH_READY]}
        selectedSourceId="s-1"
      />
    );

    expect(
      await screen.findByText("Der große KI-Trendreport 2026")
    ).toBeInTheDocument();
    expect(
      screen.getByText("https://example.com/artikel-ueber-ki")
    ).toBeInTheDocument();
  });

  it("fällt bei älteren Recherche-Quellen ohne Titel auf den Link zurück", async () => {
    const RESEARCH_READY: SourceListItem = {
      id: "s-1",
      type: "research",
      status: "ready",
      title: "Recherche: KI-Trends",
      errorMessage: null,
      originalUrl: null,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          source: {
            ...RESEARCH_READY,
            content: "Recherchebericht …",
            tokenCount: 42,
            originalUrl: null,
            blobUrl: null,
            createdAt: "2026-07-08T10:00:00.000Z",
            meta: {
              query: "KI-Trends 2026",
              citations: ["https://example.com/ohne-titel"],
            },
          },
        }),
      })
    );

    render(
      <SourcesPanel
        notebookId="nb-1"
        initialSources={[RESEARCH_READY]}
        selectedSourceId="s-1"
      />
    );

    expect(
      await screen.findByText("https://example.com/ohne-titel")
    ).toBeInTheDocument();
  });

  it("meldet eine Quellen-Auswahl an den Workspace", async () => {
    const onSelectSource = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <SourcesPanel
        notebookId="nb-1"
        initialSources={[READY]}
        onSelectSource={onSelectSource}
      />
    );

    await user.click(screen.getByRole("button", { name: "Fertig" }));
    expect(onSelectSource).toHaveBeenCalledWith("s-1");
  });

  it("pollt, solange eine Quelle wartet, und stoppt, sobald alle fertig sind", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sources: [READY] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SourcesPanel notebookId="nb-1" initialSources={[PENDING]} />);
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Bereit")).toBeInTheDocument();

    // Weitere 2s: darf NICHT nochmal abfragen, da jetzt alles ready ist
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("löscht eine Quelle nach Bestätigung durch die API", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    // Kein advanceTimers-Override: shouldAdvanceTime im Fake-Timer-Setup
    // reicht aus, damit userEvent.click unter fake timers nicht blockiert.
    const user = userEvent.setup();

    render(<SourcesPanel notebookId="nb-1" initialSources={[READY]} />);
    await user.click(screen.getByText("Löschen"));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/notebooks/nb-1/sources/s-1",
      expect.objectContaining({ method: "DELETE" })
    );
    expect(screen.queryByText("Fertig")).not.toBeInTheDocument();
  });

  it("zeigt eine Fehlermeldung, wenn Löschen fehlschlägt", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<SourcesPanel notebookId="nb-1" initialSources={[READY]} />);
    await user.click(screen.getByText("Löschen"));

    expect(
      await screen.findByText(
        "Löschen ist fehlgeschlagen — bitte später nochmal probieren."
      )
    ).toBeInTheDocument();
    // Quelle bleibt erhalten, da das Löschen fehlgeschlagen ist
    expect(screen.getByText("Fertig")).toBeInTheDocument();
  });

  it("zeigt eine Fehlermeldung, wenn Erneut-versuchen fehlschlägt", async () => {
    const ERROR_SOURCE: SourceListItem = {
      id: "s-1",
      type: "url",
      status: "error",
      title: "Kaputt",
      errorMessage: "Diese Website konnte nicht gelesen werden.",
      originalUrl: null,
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<SourcesPanel notebookId="nb-1" initialSources={[ERROR_SOURCE]} />);
    await user.click(screen.getByText("Erneut versuchen"));

    expect(
      await screen.findByText(
        "Erneut versuchen ist fehlgeschlagen — bitte später nochmal probieren."
      )
    ).toBeInTheDocument();
  });
});
