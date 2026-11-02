import { useRef, type ReactNode } from "react";
export function DesktopSidebar({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}) {
  const root = useRef<HTMLElement>(null);
  return (
    <aside
      id="desktop-sidebar"
      className="desktop-sidebar"
      ref={root}
      aria-label="対戦詳細"
    >
      <div className="sidebar-heading">
        <b>対戦詳細</b>
        <button
          className="icon-button"
          aria-label="サイドパネルを閉じる"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {children}
    </aside>
  );
}
