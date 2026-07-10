import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotebookWorkspace } from "@/components/workspace/NotebookWorkspace";

vi.mock("@vercel/blob/client", () => ({ upload: vi.fn() }));

function sseResponse() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          `event: user_message\ndata: ${JSON.stringify({
            id: "m-user",
            role: "user",
            content: "Was ist wichtig?",
            citations: null,
          })}\n\n`
        )
      );
      controller.enqueue(
        encoder.encode(
          `event: delta\ndata: ${JSON.stringify({
            text: "Beta ist wichtig [S-01#6-10]",
          })}\n\n`
        )
      );
      controller.enqueue(
        encoder.encode(
          `event: assistant_message\ndata: ${JSON.stringify({
            id: "m-assistant",
            role: "assistant",
            content: "Beta ist wichtig [S-01#6-10]",
            citations: [
              {
                sourceId: "s-1",
                label: "S-01",
                title: "Notiz",
                marker: "[S-01#6-10]",
                start: 6,
                end: 10,
                citedText: "Beta",
              },
            ],
          })}\n\n`
        )
      );
      controller.enqueue(encoder.encode("event: done\ndata: {}\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

describe("Notebook-Smoke-Flow", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("führt Quelle, Chat, Zitat und Quellenmarkierung zusammen", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/api/notebooks/nb-1/sources")) {
        return new Response(
          JSON.stringify({
            source: {
              id: "s-1",
              type: "text",
              status: "ready",
              title: "Notiz",
              errorMessage: null,
            },
          }),
          { status: 201, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/api/notebooks/nb-1/chat")) {
        return sseResponse();
      }

      if (url.endsWith("/api/notebooks/nb-1/sources/s-1")) {
        return new Response(
          JSON.stringify({
            source: {
              id: "s-1",
              type: "text",
              status: "ready",
              title: "Notiz",
              errorMessage: null,
              content: "Alpha Beta Gamma",
              tokenCount: 3,
              originalUrl: null,
              blobUrl: null,
              createdAt: "2026-07-08T10:00:00.000Z",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      return new Response("Nicht gefunden", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <NotebookWorkspace
        notebook={{ id: "nb-1", title: "Smoke", isDemo: false, number: "001" }}
        sources={[]}
        chatMessages={[]}
        artifacts={[]}
        audioOverviews={[]}
      />
    );

    await user.click(screen.getByRole("button", { name: "Quellen hinzufügen" }));
    await user.click(screen.getByRole("button", { name: /Text einfügen/i }));
    await user.type(screen.getByPlaceholderText("Text hier einfügen …"), "Alpha Beta Gamma");
    await user.click(screen.getByRole("button", { name: "Hinzufügen" }));

    expect(await screen.findByText("Notiz")).toBeInTheDocument();
    const chatInput = await screen.findByPlaceholderText(/ausgewählten kontext/i);
    await user.type(chatInput, "Was ist wichtig?");
    await user.click(screen.getByRole("button", { name: /frage stellen/i }));

    await screen.findByText(/Beta ist wichtig/);
    await user.click(screen.getByRole("button", { name: "[S-01]" }));

    const betaMatches = await screen.findAllByText("Beta");
    expect(betaMatches.some((node) => node.tagName === "MARK")).toBe(true);
  });
});
