import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandPalette, type PaletteCommand, usePaletteChord } from "../src/index.ts";

afterEach(cleanup);

function Page({ commands }: { commands: PaletteCommand[] }) {
  const [open, setOpen] = useState(false);
  usePaletteChord(() => setOpen(true));
  return (
    <CommandPalette
      open={open}
      onOpenChange={setOpen}
      commands={commands}
      context="Selected: t-1 A card"
    />
  );
}

describe("CommandPalette", () => {
  it("should open on Ctrl+K and on Cmd+K", async () => {
    render(<Page commands={[]} />);
    expect(screen.queryByRole("dialog")).toBeNull();

    await userEvent.keyboard("{Control>}k{/Control}");
    expect(await screen.findByRole("dialog", { name: "Command palette" })).toBeTruthy();

    await userEvent.keyboard("{Escape}");
    await userEvent.keyboard("{Meta>}k{/Meta}");
    expect(await screen.findByRole("dialog", { name: "Command palette" })).toBeTruthy();
  });

  it("should run the command the filter leaves first when Enter is pressed", async () => {
    const toWork = vi.fn();
    const toDone = vi.fn();
    render(
      <Page
        commands={[
          { id: "move:in_progress", label: "Move to in_progress", run: toWork },
          { id: "move:closed", label: "Move to closed", run: toDone },
        ]}
      />,
    );
    await userEvent.keyboard("{Control>}k{/Control}");

    await userEvent.type(await screen.findByRole("combobox"), "closed");
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Move to closed",
    ]);
    await userEvent.keyboard("{Enter}");

    expect(toDone).toHaveBeenCalledOnce();
    expect(toWork).not.toHaveBeenCalled();
  });

  it("should say so when no command matches, and run nothing on Enter", async () => {
    const run = vi.fn();
    render(<Page commands={[{ id: "a", label: "Go to Board", run }]} />);
    await userEvent.keyboard("{Control>}k{/Control}");

    await userEvent.type(await screen.findByRole("combobox"), "zzz");
    await userEvent.keyboard("{Enter}");

    expect(screen.getByText("No command matches")).toBeTruthy();
    expect(run).not.toHaveBeenCalled();
  });
});
