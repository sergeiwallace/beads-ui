import { Dialog } from "@base-ui/react/dialog";
import type { OptionCard } from "@beads-ui/core";

// "Approve recommendations" over a selection (web app design D-1, D-3, T-W1.2): the confirm lists
// every selected decision and its recommended option, and nothing is written until it is
// confirmed.

export interface BulkItem {
  key: string;
  title: string;
  cards: OptionCard[];
}

export interface BulkApproveProps {
  open: boolean;
  items: readonly BulkItem[];
  onOpenChange(open: boolean): void;
  onConfirm(): void;
}

export function BulkApprove({ open, items, onOpenChange, onConfirm }: BulkApproveProps) {
  const decisions = items.reduce((sum, item) => sum + item.cards.length, 0);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="bu-palette-backdrop" />
        <Dialog.Popup className="bu-palette bu-bulk" aria-label="Approve recommendations">
          <Dialog.Title className="bu-bulk-title">
            Approve {decisions} recommendation{decisions === 1 ? "" : "s"} in {items.length} item
            {items.length === 1 ? "" : "s"}?
          </Dialog.Title>
          <ul className="bu-bulk-list">
            {items.map((item) => (
              <li key={item.key}>
                <span className="bu-bulk-item">{item.title}</span>
                <ul>
                  {item.cards.map((card) => {
                    const option = card.options.find((one) => one.key === card.recommended);
                    return (
                      <li key={card.id} data-decision={card.id}>
                        {card.id}: {card.title}: ({card.recommended}) {option?.label}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
          <div className="bu-bulk-actions">
            <button type="button" className="bu-button" onClick={onConfirm}>
              Approve all
            </button>
            <Dialog.Close className="bu-button">Cancel</Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
