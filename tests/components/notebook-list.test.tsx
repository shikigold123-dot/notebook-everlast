import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotebookList } from "@/components/dashboard/NotebookList";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

const NOTEBOOKS = [
  { id: "id-1", title: "Kant", createdAt: "2026-07-01T10:00:00Z" },
  { id: "id-2", title: "Nietzsche", createdAt: "2026-07-02T10:00:00Z" },
];

describe("NotebookList", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    push.mockClear();
  });
  it("nummeriert die Dossiers fortlaufend", () => {
    render(<NotebookList notebooks={NOTEBOOKS} />);
    expect(screen.getByText("DOSSIER 001")).toBeInTheDocument();
    expect(screen.getByText("DOSSIER 002")).toBeInTheDocument();
    expect(screen.getByText("Kant")).toBeInTheDocument();
  });

  it("zeigt den Anlegen-Button", () => {
    render(<NotebookList notebooks={[]} />);
    expect(
      screen.getByRole("button", { name: /neues dossier/i })
    ).toBeInTheDocument();
  });

  it("zeigt den Leer-Zustand ohne Notebooks", () => {
    render(<NotebookList notebooks={[]} />);
    expect(screen.getByText(/noch keine dossiers/i)).toBeInTheDocument();
  });

  it("zeigt bei Verbindungsfehler ein Banner und setzt den Button zurück", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down"))
    );
    render(<NotebookList notebooks={[]} />);
    const button = screen.getByRole("button", { name: /neues dossier/i });
    await user.click(button);

    expect(
      await screen.findByText("Keine Verbindung — bitte nochmal versuchen.")
    ).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it("zeigt die Server-Meldung bei 429", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          error: "Maximal 5 Dossiers pro Besucher — lösch eins, um Platz zu schaffen.",
        }),
      })
    );
    render(<NotebookList notebooks={[]} />);
    await user.click(screen.getByRole("button", { name: /neues dossier/i }));

    expect(
      await screen.findByText(
        "Maximal 5 Dossiers pro Besucher — lösch eins, um Platz zu schaffen."
      )
    ).toBeInTheDocument();
  });

  it("navigiert bei Erfolg zum neuen Notebook", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ notebook: { id: "abc" } }),
      })
    );
    render(<NotebookList notebooks={[]} />);
    await user.click(screen.getByRole("button", { name: /neues dossier/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/notebook/abc"));
  });
});
