import { type RefCallback, useCallback, useEffect, useState } from "react";

export const OVERFLOW_ITEM = "data-overflow-item";

export function useOverflowItems(items: readonly string[]): {
  row: RefCallback<HTMLElement>;
  hidden: ReadonlySet<string>;
} {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const key = items.join("\n");
  useEffect(() => {
    if (element === null || key === "") return;
    const observer = new IntersectionObserver(
      (entries) =>
        setHidden((current) => {
          const next = new Set(current);
          for (const entry of entries) {
            const id = entry.target.getAttribute(OVERFLOW_ITEM);
            if (id === null) continue;
            if (entry.intersectionRatio >= 0.99) next.delete(id);
            else next.add(id);
          }
          return next.size === current.size && [...next].every((id) => current.has(id))
            ? current
            : next;
        }),
      { root: element, threshold: [0, 0.99, 1] },
    );
    for (const id of key.split("\n")) {
      const item = element.querySelector(`[${OVERFLOW_ITEM}="${CSS.escape(id)}"]`);
      if (item !== null) observer.observe(item);
    }
    return () => observer.disconnect();
  }, [element, key]);
  const row = useCallback((node: HTMLElement | null) => setElement(node), []);
  return { row, hidden };
}
