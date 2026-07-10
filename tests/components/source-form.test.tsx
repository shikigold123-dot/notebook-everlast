import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SourceForm } from "@/components/workspace/SourceForm";

const uploadMock = vi.fn();
vi.mock("@vercel/blob/client", () => ({
  upload: (...args: unknown[]) => uploadMock(...args),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  uploadMock.mockReset();
});

describe("SourceForm", () => {
  it("sendet einen Text als neue Quelle und leert das Feld", async () => {
    const onCreated = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          source: {
            id: "s-1",
            type: "text",
            status: "ready",
            title: "Text",
            errorMessage: null,
          },
        }),
      })
    );
    const user = userEvent.setup();
    render(<SourceForm notebookId="nb-1" onCreated={onCreated} />);

    await user.click(screen.getByRole("button", { name: /Text einfügen/i }));

    await user.type(
      screen.getByPlaceholderText("Text hier einfügen …"),
      "Mein Text"
    );
    await user.click(screen.getByRole("button", { name: "Hinzufügen" }));

    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith(
        expect.objectContaining({ id: "s-1" })
      )
    );
    expect(screen.getByPlaceholderText("Text hier einfügen …")).toHaveValue("");
  });

  it("zeigt eine Fehlermeldung ohne Signalfarbe bei einer 429-Antwort", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Maximal 8 Quellen pro Notebook." }),
      })
    );
    const user = userEvent.setup();
    render(<SourceForm notebookId="nb-1" onCreated={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Text einfügen/i }));

    await user.type(screen.getByPlaceholderText("Text hier einfügen …"), "Text");
    await user.click(screen.getByRole("button", { name: "Hinzufügen" }));

    const banner = await screen.findByText("Maximal 8 Quellen pro Notebook.");
    expect(banner.className).toContain("bg-paper");
    expect(banner.className).not.toContain("bg-signal");
  });

  it("lädt eine PDF-Datei zu Blob hoch und legt danach die Quelle an", async () => {
    uploadMock.mockResolvedValue({ url: "https://blob.example/x.pdf" });
    const onCreated = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        source: {
          id: "s-2",
          type: "pdf",
          status: "pending",
          title: "doku.pdf",
          errorMessage: null,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<SourceForm notebookId="nb-1" onCreated={onCreated} />);

    await user.click(screen.getByRole("button", { name: /PDF-Dokument/i }));
    const file = new File(["%PDF-1.4"], "doku.pdf", {
      type: "application/pdf",
    });
    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    await user.upload(input, file);

    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith(
        expect.objectContaining({ id: "s-2" })
      )
    );
    expect(uploadMock).toHaveBeenCalledWith(
      "doku.pdf",
      file,
      expect.objectContaining({
        handleUploadUrl: "/api/notebooks/nb-1/blob-upload-token",
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/notebooks/nb-1/sources",
      expect.objectContaining({
        body: JSON.stringify({
          type: "pdf",
          title: "doku.pdf",
          blobUrl: "https://blob.example/x.pdf",
        }),
      })
    );
  });

  it("nutzt lokalen Upload-Fallback, wenn Vercel Blob nicht konfiguriert ist", async () => {
    uploadMock.mockRejectedValue(new Error("Blob fehlt"));
    const onCreated = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          url: "http://localhost:3001/uploads/nb-1/local.pdf",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          source: {
            id: "s-local",
            type: "pdf",
            status: "pending",
            title: "local.pdf",
            errorMessage: null,
          },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<SourceForm notebookId="nb-1" onCreated={onCreated} />);

    await user.click(screen.getByRole("button", { name: /PDF-Dokument/i }));
    const file = new File(["%PDF-1.4"], "local.pdf", {
      type: "application/pdf",
    });
    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    await user.upload(input, file);

    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith(
        expect.objectContaining({ id: "s-local" })
      )
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/notebooks/nb-1/local-upload",
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/notebooks/nb-1/sources",
      expect.objectContaining({
        body: JSON.stringify({
          type: "pdf",
          title: "local.pdf",
          blobUrl: "http://localhost:3001/uploads/nb-1/local.pdf",
        }),
      })
    );
  });

  it("sendet eine Recherchefrage als neue Quelle", async () => {
    const onCreated = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        source: {
          id: "s-3",
          type: "research",
          status: "pending",
          title: "Recherche: NotebookLM",
          errorMessage: null,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<SourceForm notebookId="nb-1" onCreated={onCreated} />);

    await user.click(screen.getByRole("button", { name: /Deep Research/i }));
    await user.type(
      screen.getByPlaceholderText("Was möchtest du recherchieren?"),
      "NotebookLM Deep Research"
    );
    await user.click(screen.getByRole("button", { name: "Recherchieren" }));

    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith(
        expect.objectContaining({ id: "s-3" })
      )
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/notebooks/nb-1/sources",
      expect.objectContaining({
        body: JSON.stringify({
          type: "research",
          query: "NotebookLM Deep Research",
        }),
      })
    );
    expect(
      screen.getByPlaceholderText("Was möchtest du recherchieren?")
    ).toHaveValue("");
  });

  it("lehnt eine zu große PDF-Datei sofort ab, ohne einen Upload zu starten", async () => {
    const oversized = new File(
      [new Uint8Array(16 * 1024 * 1024)],
      "riesig.pdf",
      { type: "application/pdf" }
    );
    const user = userEvent.setup();
    render(<SourceForm notebookId="nb-1" onCreated={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /PDF-Dokument/i }));
    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    await user.upload(input, oversized);

    expect(
      await screen.findByText(
        "PDF-Dateien dürfen höchstens 15 MB groß sein."
      )
    ).toBeInTheDocument();
    expect(uploadMock).not.toHaveBeenCalled();
  });
});
