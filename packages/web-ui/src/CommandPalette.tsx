import { Dialog } from "@base-ui/react/dialog";
import { useEffect, useId, useMemo, useState } from "react";

export interface PaletteCommand {
  id: string;
  label: string;
  /** A second line, such as the card a Move to acts on. */
  detail?: string;
  run(): void;
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  commands: readonly PaletteCommand[];
  /** What the commands act on, shown above the list: the selected card, or that none is. */
  context?: string;
}

/** True for Ctrl+K, or Cmd+K on a Mac keyboard: the palette's chord. */
export function isPaletteChord(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey">,
) {
  return event.key.toLowerCase() === "k" && (event.ctrlKey || event.metaKey) && !event.altKey;
}

/** Opens the palette on Ctrl+K or Cmd+K anywhere in the page. */
export function usePaletteChord(onOpen: () => void): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!isPaletteChord(event)) return;
      event.preventDefault();
      onOpen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpen]);
}

const matches = (command: PaletteCommand, query: string): boolean => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const text = `${command.label} ${command.detail ?? ""}`.toLowerCase();
  return words.every((word) => text.includes(word));
};

/**
 * The command palette (D-10): a dialog with a filter field over the commands, the arrow keys to
 * pick one and Enter to run it. One component, so a Base UI combobox can take its place.
 */
export function CommandPalette({ open, onOpenChange, commands, context }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const shown = useMemo(
    () => commands.filter((command) => matches(command, query)),
    [commands, query],
  );
  const current = Math.min(active, Math.max(0, shown.length - 1));

  const run = (command: PaletteCommand | undefined) => {
    if (command === undefined) return;
    onOpenChange(false);
    command.run();
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setQuery("");
          setActive(0);
        }
        onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="bu-backdrop" />
        <Dialog.Popup className="bu-palette" aria-label="Command palette">
          <Dialog.Title className="bu-visually-hidden">Command palette</Dialog.Title>
          {context !== undefined && <p className="bu-palette-context">{context}</p>}
          <input
            className="bu-palette-input"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={shown.length === 0 ? undefined : `${listId}-${current}`}
            aria-label="Type a command"
            placeholder="Type a command"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((current + 1) % Math.max(1, shown.length));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((current - 1 + shown.length) % Math.max(1, shown.length));
              } else if (event.key === "Enter") {
                event.preventDefault();
                run(shown[current]);
              }
            }}
          />
          <div className="bu-palette-list" id={listId} role="listbox" aria-label="Commands">
            {shown.map((command, index) => (
              <div
                key={command.id}
                id={`${listId}-${index}`}
                role="option"
                tabIndex={-1}
                aria-selected={index === current}
                className="bu-palette-option"
                onMouseMove={() => setActive(index)}
                onClick={() => run(command)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") run(command);
                }}
              >
                <span>{command.label}</span>
                {command.detail !== undefined && (
                  <span className="bu-palette-detail">{command.detail}</span>
                )}
              </div>
            ))}
          </div>
          {shown.length === 0 && <p className="bu-palette-empty">No command matches</p>}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
