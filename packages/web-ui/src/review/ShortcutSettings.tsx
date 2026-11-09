import { type Keymap, type KeymapError, remapKey, setSingleKeys } from "@beads-ui/core";
import { useState } from "react";

// The shortcut setting (web app design D-12, T-W1.4): single-key shortcuts on by default, a switch
// to turn them off (modified shortcuts such as Ctrl+K keep working), and a remap per command that
// refuses a key another command holds and names both commands.

export interface ShortcutSettingsProps {
  keymap: Keymap;
  onChange(keymap: Keymap): void;
}

export function ShortcutSettings({ keymap, onChange }: ShortcutSettingsProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<KeymapError | undefined>(undefined);

  const apply = (command: string) => {
    const key = drafts[command];
    if (key === undefined) return;
    const next = remapKey(keymap, command, key.trim());
    if (!next.ok) {
      setError(next.error);
      return;
    }
    setError(undefined);
    setDrafts((current) => {
      const { [command]: _done, ...rest } = current;
      return rest;
    });
    onChange(next.value);
  };

  return (
    <section className="bu-shortcut-settings" aria-label="Keyboard shortcuts">
      <label className="bu-field-inline">
        <input
          type="checkbox"
          checked={keymap.settings.singleKey}
          onChange={(event) => onChange(setSingleKeys(keymap, event.target.checked))}
        />{" "}
        Single-key shortcuts
      </label>
      <p className="bu-dim">
        With single-key shortcuts off, keys such as j and k do nothing; Ctrl and Cmd shortcuts still
        work.
      </p>
      <table className="bu-shortcut-table">
        <thead>
          <tr>
            <th scope="col">Command</th>
            <th scope="col">Key</th>
          </tr>
        </thead>
        <tbody>
          {keymap.bindings.map((binding) => (
            <tr key={binding.command}>
              <th scope="row">{binding.label}</th>
              <td>
                <input
                  className="bu-input"
                  aria-label={`Key for ${binding.label}`}
                  value={drafts[binding.command] ?? binding.key ?? ""}
                  onChange={(event) =>
                    setDrafts((current) => ({ ...current, [binding.command]: event.target.value }))
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") apply(binding.command);
                  }}
                />{" "}
                <button
                  type="button"
                  className="bu-button"
                  disabled={drafts[binding.command] === undefined}
                  onClick={() => apply(binding.command)}
                >
                  Set
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error !== undefined && (
        <p className="bu-read-error" role="alert">
          Not remapped: {error.message}
        </p>
      )}
    </section>
  );
}
