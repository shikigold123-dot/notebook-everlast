import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MindMapCanvas } from "@/components/workspace/MindMapCanvas";

describe("MindMapCanvas", () => {
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

  it("rendert Mind-Map-Knoten", () => {
    render(
      <MindMapCanvas
        tree={{
          label: "Root",
          children: [{ label: "Ast", children: [] }],
        }}
      />
    );

    expect(screen.getByText("Root")).toBeInTheDocument();
    expect(screen.getByText("Ast")).toBeInTheDocument();
  });

  it("zeigt Fallback bei ungültigen Daten", () => {
    render(<MindMapCanvas tree={{ children: [] }} />);

    expect(
      screen.getByText("Mind Map konnte nicht gelesen werden.")
    ).toBeInTheDocument();
  });
});
