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
};

const READY: SourceListItem = {
  id: "s-1",
  type: "url",
  status: "ready",
  title: "Fertig",
  errorMessage: null,
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
    expect(screen.getByText("✓ Bereit")).toBeInTheDocument();
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
    expect(screen.getByText("✓ Bereit")).toBeInTheDocument();

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
});
