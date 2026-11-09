import { Menu } from "@base-ui/react/menu";

/** A sprint or the backlog a card can move to: `backlog` or `sprint:<name>`, and its label. */
export interface SprintTarget {
  to: string;
  label: string;
}

export interface MoveToMenuProps {
  /** How the card reads to a screen reader, such as its display id. */
  cardLabel: string;
  /** Every status but the card's own, in column order. */
  targets: readonly string[];
  onMove(to: string): void;
  /** Present under views.rank: a reorder without a drag, one place up or down. */
  onStep?: (delta: -1 | 1) => void;
  /** The backlog and every open sprint the card is not in (D-5 of the beads-ui design). */
  sprintTargets?: readonly SprintTarget[] | undefined;
  onSprint?: ((to: string) => void) | undefined;
  disabled?: boolean;
}

/**
 * The single-pointer path to every drag (WCAG 2.2, 2.5.7): one button on every card opens a menu
 * of the other statuses, the sprints and the backlog, and, under rank, one place up or down.
 */
export function MoveToMenu({
  cardLabel,
  targets,
  onMove,
  onStep,
  sprintTargets,
  onSprint,
  disabled,
}: MoveToMenuProps) {
  return (
    <Menu.Root>
      <Menu.Trigger
        className="bu-button bu-move-trigger"
        aria-label={`Move ${cardLabel} to`}
        disabled={disabled === true}
      >
        Move to
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="bu-menu-positioner" sideOffset={4} align="end">
          <Menu.Popup className="bu-menu">
            {targets.map((status) => (
              <Menu.Item key={status} className="bu-menu-item" onClick={() => onMove(status)}>
                {status}
              </Menu.Item>
            ))}
            {onSprint !== undefined && sprintTargets !== undefined && sprintTargets.length > 0 && (
              <>
                <Menu.Separator className="bu-menu-separator" />
                {sprintTargets.map((target) => (
                  <Menu.Item
                    key={target.to}
                    className="bu-menu-item"
                    onClick={() => onSprint(target.to)}
                  >
                    {target.label}
                  </Menu.Item>
                ))}
              </>
            )}
            {onStep !== undefined && (
              <>
                <Menu.Separator className="bu-menu-separator" />
                <Menu.Item className="bu-menu-item" onClick={() => onStep(-1)}>
                  Up one place
                </Menu.Item>
                <Menu.Item className="bu-menu-item" onClick={() => onStep(1)}>
                  Down one place
                </Menu.Item>
              </>
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
