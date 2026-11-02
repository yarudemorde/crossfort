import { useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import type {
  Action,
  CardDefinition,
  Coord,
  Observation,
  ObservedPiece,
} from "../../game/types";
import { BattleHeader } from "./BattleHeader";
import { HandTray } from "./HandTray";
import { DesktopSidebar } from "./DesktopSidebar";
import { MobileBottomDrawer } from "./MobileBottomDrawer";
import { DetailPanels } from "./DetailPanels";
import { ResourceSummary } from "./ResourceSummary";
import { ChroniclePanel } from "./ChroniclePanel";
import {
  SelectionInspector,
  displayName,
  selectionHint,
} from "./SelectionInspector";
import { panelsReducer, initialPanels, type DetailPanel } from "./panels";
function useCompactLayout() {
  const [compact, setCompact] = useState(
    () => window.matchMedia("(max-width: 900px)").matches,
  );
  useEffect(() => {
    const m = window.matchMedia("(max-width: 900px)");
    const update = () => setCompact(m.matches);
    m.addEventListener("change", update);
    return () => m.removeEventListener("change", update);
  }, []);
  return compact;
}
export function BattleLayout({
  observation: o,
  cards,
  cardId,
  selectedPiece,
  path,
  legal,
  busy,
  interactive,
  onSelectCard,
  onClear,
  onClearPath,
  onMove,
  onExchange,
  onEndTurn,
  onHelp,
  onHome,
  onReplay,
  children,
}: {
  observation: Observation;
  cards: Record<string, CardDefinition>;
  cardId?: string;
  selectedPiece?: ObservedPiece;
  path: Coord[];
  legal: Action[];
  busy: boolean;
  interactive: boolean;
  onSelectCard: (id: string) => void;
  onClear: () => void;
  onClearPath: () => void;
  onMove: () => void;
  onExchange: () => void;
  onEndTurn: () => void;
  onHelp: () => void;
  onHome: () => void;
  onReplay: () => void;
  children: ReactNode;
}) {
  const [panels, dispatch] = useReducer(panelsReducer, initialPanels);
  const compact = useCompactLayout();
  const root = useRef<HTMLElement>(null);
  const sidebarToggle = useRef<HTMLButtonElement>(null);
  const trayToggle = useRef<HTMLButtonElement>(null);
  const card = cardId ? cards[cardId] : undefined;
  const selected = !!card || !!selectedPiece;
  const canAttack = legal.some(
    (a) =>
      a.type === "act" &&
      a.pieceId === selectedPiece?.instanceId &&
      a.targetId &&
      JSON.stringify(a.path) === JSON.stringify(path),
  );
  const hint = selectionHint(o, card, selectedPiece, path.length, canAttack);
  const selectionName = card
    ? card.name.replace("（仮）", "")
    : selectedPiece
      ? displayName(selectedPiece, cards)
      : "";
  function closeSidebar() {
    sidebarToggle.current?.focus();
    dispatch({ type: "sidebar" });
  }
  function setPanel(panel: DetailPanel) {
    const active = document.activeElement as HTMLElement;
    if (panels.panel === panel && active.closest(".accordion-content"))
      root.current
        ?.querySelector<HTMLButtonElement>(
          `#${compact ? "mobile" : "desktop"}-${panel}-toggle`,
        )
        ?.focus();
    dispatch({ type: "panel", panel });
  }
  useEffect(() => {
    function escape(e: KeyboardEvent) {
      if (
        e.key !== "Escape" ||
        e.defaultPrevented ||
        document.querySelector('[role="dialog"]')
      )
        return;
      if (panels.drawer || panels.tray || panels.sidebar) {
        e.preventDefault();
        root.current
          ?.querySelector<HTMLButtonElement>(
            compact
              ? ".drawer-handle"
              : panels.sidebar
                ? ".sidebar-toggle"
                : ".tray-toggle",
          )
          ?.focus();
        dispatch({ type: "close" });
      }
    }
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [panels, compact]);
  const hand = (
    <HandTray
      observation={o}
      cards={cards}
      selected={cardId}
      interactive={interactive}
      onSelect={onSelectCard}
    />
  );
  const content = {
    resources: <ResourceSummary observation={o} cards={cards} />,
    selection: (
      <SelectionInspector
        observation={o}
        card={card}
        piece={selectedPiece}
        cards={cards}
      />
    ),
    chronicle: <ChroniclePanel events={o.events} />,
  };
  const endButton = (
    <button
      className="primary battle-end-turn"
      disabled={!interactive}
      onClick={onEndTurn}
    >
      {o.outcome
        ? "戦闘終了"
        : o.activePlayer === "cpu"
          ? "CPUの行動中"
          : busy
            ? "処理中"
            : "ターン終了"}
      <span aria-hidden="true"> →</span>
    </button>
  );
  return (
    <main
      ref={root}
      className={`battle-layout ${panels.sidebar && !compact ? "sidebar-open" : ""} ${selected ? "has-selection" : ""}`}
    >
      <BattleHeader
        observation={o}
        busy={busy}
        onHelp={onHelp}
        onHome={onHome}
        onReplay={onReplay}
      />
      <div
        className="battle-workspace"
        onPointerDownCapture={(e) => {
          if (
            compact &&
            panels.drawer === 2 &&
            !selected &&
            (e.target as Element).closest(".battlefield")
          )
            dispatch({ type: "drawer", stage: 0 });
        }}
      >
        <section className="map-stage" aria-label="戦場">
          {children}
          {!compact && (
            <button
              ref={sidebarToggle}
              className="sidebar-toggle"
              aria-label={
                panels.sidebar ? "サイドパネルを閉じる" : "サイドパネルを開く"
              }
              aria-expanded={panels.sidebar}
              aria-controls="desktop-sidebar"
              onClick={() => {
                if (panels.sidebar) closeSidebar();
                else dispatch({ type: "sidebar" });
              }}
            >
              {panels.sidebar ? "詳細 ›" : "‹ 詳細"}
            </button>
          )}
        </section>
        {!compact && panels.sidebar && (
          <DesktopSidebar onClose={closeSidebar}>
            <DetailPanels
              panel={panels.panel}
              onPanel={setPanel}
              content={content}
              id="desktop"
            />
          </DesktopSidebar>
        )}
      </div>
      {selected && (
        <section
          className={`selection-bar ${selectedPiece?.actedThisTurn ? "is-acted" : ""}`}
          aria-label="選択中の指示"
        >
          <div className="selection-summary">
            <strong>{selectionName}</strong>
            {selectedPiece && (
              <span
                className="quick-stats"
                aria-label={`戦力${selectedPiece.power} 視野${selectedPiece.vision} 射程${selectedPiece.range} 移動${selectedPiece.movement}`}
              >
                ⚔{selectedPiece.power}　◉{selectedPiece.vision}　➶
                {selectedPiece.range}　↟{selectedPiece.movement}
              </span>
            )}
            {card && <span className="quick-stats">◆ {card.cost}</span>}
            <small role="status">{hint}</small>
          </div>
          <div className="selection-actions">
            {card && (
              <button
                className="secondary"
                disabled={!interactive || o.self.exchangedThisTurn}
                onClick={onExchange}
              >
                {o.self.exchangedThisTurn ? "交換済" : "交換"}
              </button>
            )}
            {path.length > 0 && (
              <>
                <button className="secondary" onClick={onClearPath}>
                  経路解除
                </button>
                <button
                  className="primary"
                  disabled={!interactive}
                  onClick={onMove}
                >
                  移動を確定
                </button>
              </>
            )}
            <button
              className="icon-button"
              aria-label="選択の詳細を表示"
              onClick={() => {
                if (compact) dispatch({ type: "drawer", stage: 2 });
                else if (!panels.sidebar) dispatch({ type: "sidebar" });
                if (panels.panel !== "selection")
                  dispatch({ type: "panel", panel: "selection" });
              }}
            >
              ⓘ
            </button>
            <button
              className="icon-button"
              aria-label="選択を解除"
              onClick={onClear}
            >
              ×
            </button>
          </div>
        </section>
      )}
      {compact ? (
        <MobileBottomDrawer
          stage={panels.drawer}
          onStage={(stage) => dispatch({ type: "drawer", stage })}
          count={o.self.hand.length}
          resource={o.self.resourceRemaining}
          total={o.self.resourceTotal}
          endButton={endButton}
        >
          {hand}
          {panels.drawer === 2 && (
            <DetailPanels
              panel={panels.panel}
              onPanel={setPanel}
              content={content}
              id="mobile"
            />
          )}
        </MobileBottomDrawer>
      ) : (
        <section className="desktop-tray" aria-label="手札トレイ">
          {panels.tray && (
            <div className="desktop-hand-body" id="desktop-hand-content">
              {hand}
            </div>
          )}
          <div className="desktop-bottom-bar">
            <button
              className="tray-toggle secondary"
              ref={trayToggle}
              aria-expanded={panels.tray}
              aria-controls="desktop-hand-content"
              onClick={() => {
                if (panels.tray) trayToggle.current?.focus();
                dispatch({ type: "tray" });
              }}
            >
              手札 {o.self.hand.length}
              <span aria-hidden="true"> {panels.tray ? "⌄" : "⌃"}</span>
            </button>
            <div
              className="bar-resources"
              aria-label={`残り資源 ${o.self.resourceRemaining}、合計 ${o.self.resourceTotal}`}
            >
              <span>◆</span> <b>{o.self.resourceRemaining}</b>
              <small>/{o.self.resourceTotal}</small>
            </div>
            {endButton}
          </div>
        </section>
      )}
    </main>
  );
}
