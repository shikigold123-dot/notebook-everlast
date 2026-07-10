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
  it("nummeriert die Notebooks fortlaufend", () => {
    render(<NotebookList notebooks={NOTEBOOKS} />);
    expect(screen.getByText("DOSSIER 001")).toBeInTheDocument();
    expect(screen.getByText("DOSSIER 002")).toBeInTheDocument();
    expect(screen.getByText("Kant")).toBeInTheDocument();
  });

  it("zeigt den Anlegen-Button", () => {
    render(<NotebookList notebooks={[]} />);
    expect(
      screen.getByRole("button", { name: /neues notebook/i })
    ).toBeInTheDocument();
  });

  it("markiert Demo-Notebooks", () => {
    render(
      <NotebookList
        notebooks={[
          {
            id: "demo",
            title: "Everlast Demo",
            isDemo: true,
            createdAt: "2026-07-01T10:00:00Z",
          },
        ]}
      />
    );

    expect(screen.getByText("DEMO-DOSSIER")).toBeInTheDocument();
    expect(screen.getByText("Lesen")).toBeInTheDocument();
  });

  it("zeigt den Leer-Zustand ohne Notebooks", () => {
    render(<NotebookList notebooks={[]} />);
    expect(screen.getByText(/noch keine notebooks/i)).toBeInTheDocument();
  });

  it("zeigt bei Verbindungsfehler ein Banner und lässt erneut absenden zu", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down"))
    );
    render(<NotebookList notebooks={[]} />);
    await user.click(screen.getByRole("button", { name: /neues notebook/i }));
    const submit = screen.getByRole("button", { name: /^erstellen$/i });
    await user.click(submit);

    expect(
      await screen.findByText("Keine Verbindung — bitte nochmal versuchen.")
    ).toBeInTheDocument();
    expect(submit).not.toBeDisabled();
  });

  it("zeigt die Server-Meldung bei 429", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          error: "Maximal 5 Notebooks pro Besucher — lösch eins, um Platz zu schaffen.",
        }),
      })
    );
    render(<NotebookList notebooks={[]} />);
    await user.click(screen.getByRole("button", { name: /neues notebook/i }));
    await user.click(screen.getByRole("button", { name: /^erstellen$/i }));

    expect(
      await screen.findByText(
        "Maximal 5 Notebooks pro Besucher — lösch eins, um Platz zu schaffen."
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
    await user.click(screen.getByRole("button", { name: /neues notebook/i }));
    await user.click(screen.getByRole("button", { name: /^erstellen$/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/notebook/abc"));
  });

  it("übergibt den eingegebenen Titel beim Erstellen", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ notebook: { id: "abc" } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<NotebookList notebooks={[]} />);
    await user.click(screen.getByRole("button", { name: /neues notebook/i }));
    await user.type(
      screen.getByPlaceholderText(/ki-wettlauf/i),
      "Mein Thema"
    );
    await user.click(screen.getByRole("button", { name: /^erstellen$/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/notebook/abc"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/notebooks",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ title: "Mein Thema" }),
      })
    );
  });

  it("sendet ohne Titel einen leeren Body", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ notebook: { id: "abc" } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<NotebookList notebooks={[]} />);
    await user.click(screen.getByRole("button", { name: /neues notebook/i }));
    await user.click(screen.getByRole("button", { name: /^erstellen$/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/notebook/abc"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/notebooks",
      expect.objectContaining({ body: JSON.stringify({}) })
    );
  });
});
