import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatPanel } from "@/components/workspace/ChatPanel";
import { DEFAULT_CHAT_MODEL } from "@/lib/openrouter/chat-models";

describe("ChatPanel", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
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
    expect(screen.getByPlaceholderText(/wähle eine quelle oder notiz/i)).toBeDisabled();
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
      screen.getByPlaceholderText(/demo-notebook ist schreibgeschützt/i)
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: /frage stellen/i })).toBeDisabled();
  });

  it("aktiviert den Chat mit einer ausgewählten Notiz ohne Quelle", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          userMessage: { id: "m-1", role: "user", content: "Frage?", citations: null },
          assistantMessage: { id: "m-2", role: "assistant", content: "Antwort", citations: null },
        }),
      })
    );
    render(
      <ChatPanel
        notebookId="nb-1"
        initialMessages={[]}
        readySourceCount={0}
        selectedSourceIds={[]}
        selectedNoteIds={["n-1"]}
      />
    );

    const input = screen.getByPlaceholderText(/ausgewählten kontext/i);
    expect(input).toBeEnabled();
    await user.type(input, "Frage?");
    await user.click(screen.getByRole("button", { name: /frage stellen/i }));
    await screen.findByText("Antwort");
    expect(fetch).toHaveBeenCalledWith(
      "/api/notebooks/nb-1/chat",
      expect.objectContaining({
        body: JSON.stringify({
          question: "Frage?",
          sourceIds: [],
          noteIds: ["n-1"],
          model: DEFAULT_CHAT_MODEL,
        }),
      })
    );
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

    await user.type(screen.getByPlaceholderText(/ausgewählten kontext/i), "Frage?");
    await user.click(screen.getByRole("button", { name: /frage stellen/i }));

    await screen.findByText(/Antwort/);
    expect(fetch).toHaveBeenCalledWith(
      "/api/notebooks/nb-1/chat",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ accept: "text/event-stream" }),
        body: JSON.stringify({
          question: "Frage?",
          model: DEFAULT_CHAT_MODEL,
        }),
      })
    );
  });

  it("sendet per Enter und behält Shift+Enter als Zeilenumbruch", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          userMessage: {
            id: "m-1",
            role: "user",
            content: "Erste Zeile\nzweite Zeile",
            citations: null,
          },
          assistantMessage: {
            id: "m-2",
            role: "assistant",
            content: "Antwort",
            citations: null,
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

    const input = screen.getByPlaceholderText(/ausgewählten kontext/i);
    await user.type(input, "Erste Zeile{Shift>}{Enter}{/Shift}zweite Zeile");
    expect(input).toHaveValue("Erste Zeile\nzweite Zeile");
    await user.keyboard("{Enter}");

    await screen.findByText("Antwort");
    expect(fetch).toHaveBeenCalledWith(
      "/api/notebooks/nb-1/chat",
      expect.objectContaining({
        body: JSON.stringify({
          question: "Erste Zeile\nzweite Zeile",
          model: DEFAULT_CHAT_MODEL,
        }),
      })
    );
  });

  it("sendet ausgewählte Quellen nur bei echter Auswahl", async () => {
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
            content: "Antwort",
            citations: null,
          },
        }),
      })
    );

    render(
      <ChatPanel
        notebookId="nb-1"
        initialMessages={[]}
        readySourceCount={1}
        selectedSourceIds={["s-1"]}
      />
    );

    await user.type(screen.getByPlaceholderText(/ausgewählten kontext/i), "Frage?");
    await user.click(screen.getByRole("button", { name: /frage stellen/i }));

    await screen.findByText("Antwort");
    expect(fetch).toHaveBeenCalledWith(
      "/api/notebooks/nb-1/chat",
      expect.objectContaining({
        body: JSON.stringify({
          question: "Frage?",
          sourceIds: ["s-1"],
          model: DEFAULT_CHAT_MODEL,
        }),
      })
    );
  });

  it("sendet eine Systemanweisung mit der Frage und speichert sie pro Notebook", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          userMessage: { id: "m-1", role: "user", content: "Frage?", citations: null },
          assistantMessage: { id: "m-2", role: "assistant", content: "Antwort", citations: null },
        }),
      })
    );

    render(
      <ChatPanel notebookId="nb-1" initialMessages={[]} readySourceCount={1} />
    );

    await user.click(screen.getByRole("button", { name: /systemanweisung bearbeiten/i }));
    await user.type(
      screen.getByRole("textbox", { name: "Systemanweisung" }),
      "Erkläre Fachbegriffe einfach."
    );
    await user.type(screen.getByPlaceholderText(/ausgewählten kontext/i), "Frage?");
    await user.click(screen.getByRole("button", { name: /frage stellen/i }));

    expect(window.localStorage.getItem("everlast_chat_system_message:nb-1")).toBe(
      "Erkläre Fachbegriffe einfach."
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/notebooks/nb-1/chat",
      expect.objectContaining({
        body: JSON.stringify({
          question: "Frage?",
          systemMessage: "Erkläre Fachbegriffe einfach.",
          model: DEFAULT_CHAT_MODEL,
        }),
      })
    );
  });

  it("sendet ein kuratiertes OpenRouter-Modell", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn((url) => {
        if (String(url).includes("/api/openrouter/models")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              models: [
                { id: DEFAULT_CHAT_MODEL, name: "Default" },
                { id: "deepseek/deepseek-v4-flash", name: "DeepSeek V4 Flash" },
              ],
            }),
          });
        }
        return Promise.resolve({
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
              content: "Antwort",
              citations: null,
            },
          }),
        });
      })
    );

    render(
      <ChatPanel
        notebookId="nb-1"
        initialMessages={[]}
        readySourceCount={1}
      />
    );

    await user.click(screen.getByRole("button", { name: /modell auswählen/i }));
    await user.click(screen.getByRole("button", { name: /deepseek v4 flash/i }));
    await user.type(screen.getByPlaceholderText(/ausgewählten kontext/i), "Frage?");
    await user.click(screen.getByRole("button", { name: /frage stellen/i }));

    await screen.findByText("Antwort");
    expect(fetch).toHaveBeenCalledWith(
      "/api/notebooks/nb-1/chat",
      expect.objectContaining({
        body: JSON.stringify({
          question: "Frage?",
          model: "deepseek/deepseek-v4-flash",
        }),
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
      vi.fn((url) => {
        if (String(url).includes("/api/openrouter/models")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              models: [{ id: DEFAULT_CHAT_MODEL, name: "Default" }],
            }),
          });
        }
        return Promise.resolve(
          new Response(stream, {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          })
        );
      })
    );

    render(
      <ChatPanel
        notebookId="nb-1"
        initialMessages={[]}
        readySourceCount={1}
      />
    );

    await user.type(screen.getByPlaceholderText(/ausgewählten kontext/i), "Frage?");
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

  it("rendert Markdown mit Überschrift, Fettdruck und Liste", () => {
    render(
      <ChatPanel
        notebookId="nb-1"
        readySourceCount={1}
        initialMessages={[
          {
            id: "m-1",
            role: "assistant",
            content: "## Einordnung\n\nDas ist **wichtig**.\n\n- Erster Punkt\n- Zweiter Punkt",
            citations: null,
          },
        ]}
      />
    );

    expect(screen.getByRole("heading", { name: "Einordnung" })).toBeInTheDocument();
    expect(screen.getByText("wichtig").closest("strong")).not.toBeNull();
    expect(screen.getAllByRole("list")).toHaveLength(2);
    expect(screen.getByText("Zweiter Punkt")).toBeInTheDocument();
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

    await user.type(screen.getByPlaceholderText(/ausgewählten kontext/i), "Frage?");
    await user.click(screen.getByRole("button", { name: /frage stellen/i }));

    await waitFor(() => expect(screen.getByText("Kaputt")).toBeInTheDocument());
  });

  it("leert den Chatverlauf bei Klick auf den Mülleimer-Button", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      })
    );

    render(
      <ChatPanel
        notebookId="nb-1"
        readySourceCount={1}
        initialMessages={[
          {
            id: "m-1",
            role: "user",
            content: "Meine Frage",
            citations: null,
          },
        ]}
      />
    );

    expect(screen.getByText("Meine Frage")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /chat leeren/i }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/notebooks/nb-1/chat",
      expect.objectContaining({ method: "DELETE" })
    );
    await waitFor(() => {
      expect(screen.queryByText("Meine Frage")).not.toBeInTheDocument();
    });
  });
});
