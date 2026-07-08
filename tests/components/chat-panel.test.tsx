import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatPanel } from "@/components/workspace/ChatPanel";

describe("ChatPanel", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("deaktiviert Eingabe ohne bereite Quellen", () => {
    render(
      <ChatPanel
        notebookId="nb-1"
        initialMessages={[]}
        readySourceCount={0}
      />
    );
    expect(screen.getByPlaceholderText(/warte auf eine bereite quelle/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /frage stellen/i })).toBeDisabled();
  });

  it("deaktiviert Eingabe im Demo-Modus", () => {
    render(
      <ChatPanel
        notebookId="nb-1"
        initialMessages={[]}
        readySourceCount={1}
        readOnly
      />
    );
    expect(
      screen.getByPlaceholderText(/demo-dossier ist schreibgeschützt/i)
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: /frage stellen/i })).toBeDisabled();
  });

  it("sendet eine Frage und zeigt die Antwort", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          userMessage: {
            id: "m-1",
            role: "user",
            content: "Frage?",
            citations: null,
          },
          assistantMessage: {
            id: "m-2",
            role: "assistant",
            content: "Antwort [S-01]",
            citations: [{ sourceId: "s-1", label: "S-01", title: "Quelle" }],
          },
        }),
      })
    );

    render(
      <ChatPanel
        notebookId="nb-1"
        initialMessages={[]}
        readySourceCount={1}
      />
    );

    await user.type(screen.getByPlaceholderText(/frag deine quellen/i), "Frage?");
    await user.click(screen.getByRole("button", { name: /frage stellen/i }));

    await screen.findByText(/Antwort/);
    expect(fetch).toHaveBeenCalledWith(
      "/api/notebooks/nb-1/chat",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ question: "Frage?" }),
      })
    );
  });

  it("macht Quellenchips anklickbar", async () => {
    const user = userEvent.setup();
    const onSelectSource = vi.fn();
    render(
      <ChatPanel
        notebookId="nb-1"
        readySourceCount={1}
        onSelectSource={onSelectSource}
        initialMessages={[
          {
            id: "m-1",
            role: "assistant",
            content: "Antwort [S-01]",
            citations: [{ sourceId: "s-1", label: "S-01", title: "Quelle" }],
          },
        ]}
      />
    );

    await user.click(screen.getByRole("button", { name: "[S-01]" }));
    expect(screen.getByText("S-01: Quelle")).toBeInTheDocument();
    expect(onSelectSource).toHaveBeenCalledWith("s-1");
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
      <ChatPanel
        notebookId="nb-1"
        initialMessages={[]}
        readySourceCount={1}
      />
    );

    await user.type(screen.getByPlaceholderText(/frag deine quellen/i), "Frage?");
    await user.click(screen.getByRole("button", { name: /frage stellen/i }));

    await waitFor(() => expect(screen.getByText("Kaputt")).toBeInTheDocument());
  });
});
