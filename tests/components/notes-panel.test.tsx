import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotesPanel } from "@/components/workspace/NotesPanel";

describe("NotesPanel", () => {
  it("legt eine Notiz an und nimmt sie direkt in den KI-Kontext auf", async () => {
    const user = userEvent.setup();
    const onSelection = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            note: {
              id: "n1",
              title: "These",
              content: "Eigene Erkenntnis",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          }),
          { status: 201, headers: { "content-type": "application/json" } }
        )
      )
    );

    render(
      <NotesPanel
        notebookId="nb1"
        initialNotes={[]}
        selectedNoteIds={[]}
        onSelectedNoteIdsChange={onSelection}
      />
    );

    await user.click(screen.getByRole("button", { name: "Notiz anlegen" }));
    await user.type(screen.getByLabelText("Titel"), "These");
    await user.type(screen.getByLabelText("Inhalt"), "Eigene Erkenntnis");
    await user.click(screen.getByRole("button", { name: "Notiz speichern" }));

    expect(await screen.findByText("Eigene Erkenntnis")).toBeInTheDocument();
    expect(onSelection).toHaveBeenCalledWith(["n1"]);
  });
});
