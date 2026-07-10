import { describe, it, expect, afterEach, vi } from "vitest";
import { act, render, screen, cleanup, waitFor } from "@testing-library/react";
import { NotebookWorkspace } from "@/components/workspace/NotebookWorkspace";

const NB = { id: "id-1", title: "Kant", isDemo: false, number: "004" };

describe("NotebookWorkspace", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("zeigt Notebook-Nummer und Titel im Header", () => {
    render(
      <NotebookWorkspace
        notebook={NB}
        sources={[]}
        chatMessages={[]}
        artifacts={[]}
        audioOverviews={[]}
      />
    );
    expect(screen.getByText(/DOSSIER 004/)).toBeInTheDocument();
    expect(screen.getByText(/KANT/)).toBeInTheDocument();
  });

  it("rendert die drei Panels", () => {
    render(
      <NotebookWorkspace
        notebook={NB}
        sources={[]}
        chatMessages={[]}
        artifacts={[]}
        audioOverviews={[]}
      />
    );
    expect(screen.getByText("Quellen")).toBeInTheDocument();
    expect(screen.getByText("Chat")).toBeInTheDocument();
    expect(screen.getByText("Studio")).toBeInTheDocument();
  });

  it("kennzeichnet Demo-Notebooks", () => {
    render(
      <NotebookWorkspace
        notebook={{ ...NB, isDemo: true }}
        sources={[]}
        chatMessages={[]}
        artifacts={[]}
        audioOverviews={[]}
      />
    );
    expect(screen.getByText("DEMO")).toBeInTheDocument();
  });

  it("zeigt die Platzhalter-Texte", () => {
    render(
      <NotebookWorkspace
        notebook={NB}
        sources={[]}
        chatMessages={[]}
        artifacts={[]}
        audioOverviews={[]}
      />
    );
    expect(screen.getByText(/noch keine quellen/i)).toBeInTheDocument();
    expect(
      screen.getAllByText(/wähle zuerst eine bereite quelle oder notiz aus/i)
    ).toHaveLength(2);
    expect(
      screen.getByText(/noch keine outputs generiert/i)
    ).toBeInTheDocument();
  });

  it("zeigt eine übergebene Quelle mit Status", () => {
    render(
      <NotebookWorkspace
        notebook={NB}
        chatMessages={[]}
        artifacts={[]}
        audioOverviews={[]}
        sources={[
          {
            id: "s-1",
            type: "pdf",
            status: "ready",
            title: "Kritik.pdf",
            errorMessage: null,
            originalUrl: null,
          },
        ]}
      />
    );
    expect(screen.getByText("Kritik.pdf")).toBeInTheDocument();
    expect(screen.getByText("Bereit")).toBeInTheDocument();
  });

  it("aktiviert Chat und Studio, wenn eine gepollte Quelle bereit wird", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          sources: [
            {
              id: "s-1",
              type: "url",
              status: "ready",
              title: "Artikel",
              errorMessage: null,
            },
          ],
        }),
      })
    );

    render(
      <NotebookWorkspace
        notebook={NB}
        chatMessages={[]}
        artifacts={[]}
        audioOverviews={[]}
        sources={[
          {
            id: "s-1",
            type: "url",
            status: "processing",
            title: "Artikel",
            errorMessage: null,
            originalUrl: null,
          },
        ]}
      />
    );

    expect(
      screen.getByPlaceholderText(/wähle eine quelle oder notiz/i)
    ).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    await waitFor(() =>
      expect(screen.getByPlaceholderText(/ausgewählten kontext/i)).toBeEnabled()
    );
    expect(
      screen.getByRole("button", { name: /präsentation/i })
    ).toBeEnabled();
  });
});
