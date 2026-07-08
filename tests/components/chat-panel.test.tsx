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
        headers: expect.objectContaining({ accept: "text/event-stream" }),
        body: JSON.stringify({ question: "Frage?" }),
      })
    );
  });

  it("liest gestreamte Antworten aus SSE-Deltas", async () => {
    const user = userEvent.setup();
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `event: user_message\ndata: ${JSON.stringify({
              id: "m-1",
              role: "user",
              content: "Frage?",
              citations: null,
            })}\n\n`
          )
        );
        controller.enqueue(
          encoder.encode(
            `event: delta\ndata: ${JSON.stringify({ text: "Gestreamt " })}\n\n`
          )
        );
        controller.enqueue(
          encoder.encode(
            `event: delta\ndata: ${JSON.stringify({ text: "[S-01]" })}\n\n`
          )
        );
        controller.enqueue(
          encoder.encode(
            `event: assistant_message\ndata: ${JSON.stringify({
              id: "m-2",
              role: "assistant",
              content: "Gestreamt [S-01]",
              citations: [{ sourceId: "s-1", label: "S-01", title: "Quelle" }],
            })}\n\n`
          )
        );
        controller.enqueue(encoder.encode("event: done\ndata: {}\n\n"));
        controller.close();
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(stream, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        })
      )
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

    expect(await screen.findByText(/Gestreamt/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "[S-01]" })).toBeInTheDocument();
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
    expect(onSelectSource).toHaveBeenCalledWith(
      "s-1",
      expect.objectContaining({ sourceId: "s-1", label: "S-01" })
    );
  });

  it("rendert Offset-Marker als Quellenchip", async () => {
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
            content: "Antwort [S-01#4-10]",
            citations: [
              {
                sourceId: "s-1",
                label: "S-01",
                title: "Quelle",
                marker: "[S-01#4-10]",
                start: 4,
                end: 10,
                citedText: "Beleg",
              },
            ],
          },
        ]}
      />
    );

    await user.click(screen.getByRole("button", { name: "[S-01]" }));
    expect(screen.getByText("Beleg")).toBeInTheDocument();
    expect(onSelectSource).toHaveBeenCalledWith(
      "s-1",
      expect.objectContaining({ marker: "[S-01#4-10]" })
    );
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
