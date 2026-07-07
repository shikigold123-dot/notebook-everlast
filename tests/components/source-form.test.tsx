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

    await user.type(
      screen.getByPlaceholderText("Text einfügen …"),
      "Mein Text"
    );
    await user.click(screen.getByRole("button", { name: "Hinzufügen" }));

    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith(
        expect.objectContaining({ id: "s-1" })
      )
    );
    expect(screen.getByPlaceholderText("Text einfügen …")).toHaveValue("");
  });

  it("zeigt eine Fehlermeldung ohne Signalfarbe bei einer 429-Antwort", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Maximal 8 Quellen pro Dossier." }),
      })
    );
    const user = userEvent.setup();
    render(<SourceForm notebookId="nb-1" onCreated={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("Text einfügen …"), "Text");
    await user.click(screen.getByRole("button", { name: "Hinzufügen" }));

    const banner = await screen.findByText("Maximal 8 Quellen pro Dossier.");
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

    await user.selectOptions(screen.getByRole("combobox"), "pdf");
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

  it("lehnt eine zu große PDF-Datei sofort ab, ohne einen Upload zu starten", async () => {
    const oversized = new File(
      [new Uint8Array(16 * 1024 * 1024)],
      "riesig.pdf",
      { type: "application/pdf" }
    );
    const user = userEvent.setup();
    render(<SourceForm notebookId="nb-1" onCreated={vi.fn()} />);

    await user.selectOptions(screen.getByRole("combobox"), "pdf");
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
