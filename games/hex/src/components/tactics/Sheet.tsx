import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./Icons";
export function Sheet({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null),
    close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close.current();
      }
      if (e.key === "Tab") {
        const items = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],summary,[tabindex="0"]',
          ) ?? [],
        ).filter((element) => element.getClientRects().length > 0);
        const first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <div
      className="hx-shade"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`hx-sheet ${wide ? "wide" : ""}`}
        ref={ref}
        id="hx-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="hx-sheet-handle" />
        <header>
          <h2>{title}</h2>
          <button className="hx-icon-btn" onClick={onClose} aria-label="閉じる">
            <Icon name="close" />
          </button>
        </header>
        <div className="hx-sheet-body">{children}</div>
      </div>
    </div>
  );
}
