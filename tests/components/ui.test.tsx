import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { ActionButton } from "@/components/ui/ActionButton";
import { Panel } from "@/components/ui/Panel";

describe("SectionLabel", () => {
  afterEach(() => cleanup());

  it("rendert den Text als Versalien-Label", () => {
    render(<SectionLabel>Quellen</SectionLabel>);
    const el = screen.getByText("Quellen");
    expect(el).toHaveClass("label-caps");
  });

  it("zeigt den Zähler in eckigen Klammern", () => {
    render(<SectionLabel count={3}>Quellen</SectionLabel>);
    expect(screen.getByText("[3]")).toBeInTheDocument();
  });

  it("zeigt ohne count keinen Zähler", () => {
    render(<SectionLabel>Quellen</SectionLabel>);
    expect(screen.queryByText(/\[\d+\]/)).not.toBeInTheDocument();
  });
});

describe("ActionButton", () => {
  afterEach(() => cleanup());

  it("rendert primary mit Signalfarbe", () => {
    render(<ActionButton variant="primary">Anlegen</ActionButton>);
    const btn = screen.getByRole("button", { name: "Anlegen" });
    expect(btn.className).toContain("bg-signal");
  });

  it("rendert outline mit Rahmen ohne Signalfläche", () => {
    render(<ActionButton variant="outline">Abbrechen</ActionButton>);
    const btn = screen.getByRole("button", { name: "Abbrechen" });
    expect(btn.className).toContain("border-ink");
    expect(btn.className).not.toContain("bg-signal");
  });

  it("reicht native Props durch (disabled)", () => {
    render(<ActionButton disabled>Warten</ActionButton>);
    expect(screen.getByRole("button", { name: "Warten" })).toBeDisabled();
  });
});

describe("Panel", () => {
  afterEach(() => cleanup());

  it("rendert Label-Kopf und Inhalt", () => {
    render(
      <Panel label="Studio">
        <p>Inhalt</p>
      </Panel>
    );
    expect(screen.getByText("Studio")).toBeInTheDocument();
    expect(screen.getByText("Inhalt")).toBeInTheDocument();
  });
});
