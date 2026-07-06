import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NotebookWorkspace } from "@/components/workspace/NotebookWorkspace";

const NB = { id: "id-1", title: "Kant", number: "004" };

describe("NotebookWorkspace", () => {
  afterEach(() => cleanup());

  it("zeigt Dossier-Nummer und Titel im Header", () => {
    render(<NotebookWorkspace notebook={NB} />);
    expect(screen.getByText(/DOSSIER 004/)).toBeInTheDocument();
    expect(screen.getByText(/KANT/)).toBeInTheDocument();
  });

  it("rendert die drei Panels", () => {
    render(<NotebookWorkspace notebook={NB} />);
    expect(screen.getByText("Quellen")).toBeInTheDocument();
    expect(screen.getByText("Chat")).toBeInTheDocument();
    expect(screen.getByText("Studio")).toBeInTheDocument();
  });

  it("zeigt die Platzhalter-Texte", () => {
    render(<NotebookWorkspace notebook={NB} />);
    expect(screen.getByText(/noch keine quellen/i)).toBeInTheDocument();
    expect(
      screen.getByText(/füge zuerst quellen hinzu/i)
    ).toBeInTheDocument();
  });
});
