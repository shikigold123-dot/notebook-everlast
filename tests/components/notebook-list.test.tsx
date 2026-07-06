import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NotebookList } from "@/components/dashboard/NotebookList";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const NOTEBOOKS = [
  { id: "id-1", title: "Kant", createdAt: "2026-07-01T10:00:00Z" },
  { id: "id-2", title: "Nietzsche", createdAt: "2026-07-02T10:00:00Z" },
];

describe("NotebookList", () => {
  afterEach(() => cleanup());
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
});
