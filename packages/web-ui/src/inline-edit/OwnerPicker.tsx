import { Menu } from "@base-ui/react/menu";

/** One session the picker offers, as the server's owner list names it. */
export interface OwnerChoice {
  name: string;
  /** The registry's state for it, such as `active`; absent when read from the store. */
  state?: string | undefined;
}

/** The sessions the fleet's handoff rules allow, and where that list came from. */
export interface OwnerChoices {
  candidates: readonly OwnerChoice[];
  /** `the work queue` or `the store's assignees`. */
  source: string;
  /** Why the registry could not be read, when the list fell back to the store's assignees. */
  note?: string | undefined;
}

export interface OwnerPickerProps {
  /** How the issue reads to a screen reader, such as its display id. */
  issueLabel: string;
  /** The issue's current owner (its assignee), or "" for none. */
  owner: string;
  /** Undefined until read; the picker asks for them when it opens. */
  choices?: OwnerChoices | undefined;
  /** Why the list could not be read at all. */
  error?: string | undefined;
  /** Called as the menu opens, so the list is read when it is needed. */
  onOpen?: (() => void) | undefined;
  onPick(name: string): void;
  disabled?: boolean | undefined;
}

/**
 * The owner picker on a card, a list row and an issue's detail: one button that opens a menu of
 * the sessions the handoff rules allow, by pointer, keyboard (Enter, Space, arrows) or touch.
 */
export function OwnerPicker(props: OwnerPickerProps) {
  const { choices } = props;
  return (
    <Menu.Root
      onOpenChange={(open) => {
        if (open) props.onOpen?.();
      }}
    >
      <Menu.Trigger
        className="bu-button bu-owner-trigger"
        aria-label={`Owner of ${props.issueLabel}: ${props.owner === "" ? "none" : props.owner}. Change owner`}
        disabled={props.disabled === true}
      >
        {props.owner === "" ? "Unassigned" : props.owner}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="bu-menu-positioner" sideOffset={4} align="start">
          <Menu.Popup className="bu-menu bu-owner-menu">
            {props.error !== undefined ? (
              <p className="bu-read-error bu-menu-note" role="alert">
                {props.error}
              </p>
            ) : choices === undefined ? (
              <p className="bu-dim bu-menu-note" aria-busy="true">
                Reading sessions
              </p>
            ) : (
              <>
                <p className="bu-dim bu-menu-note">From {choices.source}</p>
                {choices.note !== undefined && (
                  <p className="bu-dim bu-menu-note" role="status">
                    {choices.note}
                  </p>
                )}
                {choices.candidates.length === 0 && (
                  <p className="bu-dim bu-menu-note">No session the handoff rules allow</p>
                )}
                {choices.candidates.map((candidate) => (
                  <Menu.Item
                    key={candidate.name}
                    className="bu-menu-item"
                    disabled={candidate.name === props.owner}
                    onClick={() => props.onPick(candidate.name)}
                  >
                    {candidate.name}
                    {candidate.state !== undefined && (
                      <span className="bu-dim"> {candidate.state}</span>
                    )}
                  </Menu.Item>
                ))}
              </>
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
