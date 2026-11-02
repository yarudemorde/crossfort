import { useRef, type ReactNode } from "react";
import { swipeStage, type DrawerStage } from "./panels";
export function MobileBottomDrawer({
  stage,
  onStage,
  count,
  resource,
  total,
  children,
  endButton,
}: {
  stage: DrawerStage;
  onStage: (stage: DrawerStage) => void;
  count: number;
  resource: number;
  total: number;
  children: ReactNode;
  endButton: ReactNode;
}) {
  const start = useRef<number | undefined>(undefined);
  const dragged = useRef(false);
  const root = useRef<HTMLElement>(null);
  const handle = useRef<HTMLButtonElement>(null);
  function change(next: DrawerStage) {
    if (next < stage && root.current?.contains(document.activeElement))
      handle.current?.focus();
    onStage(next);
  }
  return (
    <section
      className={`mobile-drawer stage-${stage}`}
      ref={root}
      aria-label="操作ドロワー"
      data-stage={stage}
    >
      <div className="drawer-bottom-bar">
        <button
          ref={handle}
          className="drawer-handle"
          aria-label={stage ? "手札ドロワーを閉じる" : "手札ドロワーを開く"}
          aria-expanded={stage > 0}
          aria-controls="mobile-drawer-content"
          onClick={() => {
            if (!dragged.current) change(stage ? 0 : 1);
            dragged.current = false;
          }}
          onPointerDown={(e) => {
            start.current = e.clientY;
            dragged.current = false;
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerUp={(e) => {
            if (start.current === undefined) return;
            const delta = e.clientY - start.current;
            dragged.current = Math.abs(delta) >= 32;
            if (dragged.current) change(swipeStage(stage, delta));
            start.current = undefined;
          }}
          onPointerCancel={() => {
            start.current = undefined;
            dragged.current = false;
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              change(swipeStage(stage, e.key === "ArrowUp" ? -50 : 50));
            }
          }}
        >
          <span className="handle-mark" aria-hidden="true" />
          <span>
            手札 <b>{count}</b>
          </span>
          <span aria-hidden="true">{stage ? "⌄" : "⌃"}</span>
        </button>
        <div
          className="bar-resources"
          aria-label={`残り資源 ${resource}、合計 ${total}`}
        >
          <span>◆</span> <b>{resource}</b>
          <small>/{total}</small>
        </div>
        {endButton}
      </div>
      {stage > 0 && (
        <div className="drawer-body" id="mobile-drawer-content">
          <div className="drawer-controls">
            <span>手札</span>
            <button
              className="icon-button"
              aria-label="手札を閉じる"
              onClick={() => change(0)}
            >
              ×
            </button>
          </div>
          {children}
        </div>
      )}
    </section>
  );
}
