import { Toast } from "@base-ui/react/toast";
import type { ReactNode } from "react";

/** How long a toast stays; a conflict needs time to read. */
export const TOAST_TIMEOUT_MS = 8000;

export type ToastKind = "conflict" | "error" | "info";

/** Wraps the app so any part of it can raise a toast through useNotify. */
export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <Toast.Provider timeout={TOAST_TIMEOUT_MS}>
      {children}
      <ToastRegion />
    </Toast.Provider>
  );
}

function ToastRegion() {
  const { toasts } = Toast.useToastManager();
  return (
    <Toast.Portal>
      <Toast.Viewport className="bu-toasts">
        {toasts.map((toast) => (
          <Toast.Root key={toast.id} toast={toast} className="bu-toast" data-kind={toast.type}>
            <Toast.Title className="bu-toast-title" />
            <Toast.Description className="bu-toast-description" />
            <Toast.Close className="bu-button bu-toast-close" aria-label="Dismiss">
              Dismiss
            </Toast.Close>
          </Toast.Root>
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  );
}

/** Raises a toast: a conflict when another actor's write won, an error, or a note. */
export function useNotify(): (kind: ToastKind, title: string, description: string) => void {
  const manager = Toast.useToastManager();
  return (kind, title, description) => {
    manager.add({ type: kind, title, description });
  };
}
