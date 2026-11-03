import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  Action,
  CardDefinition,
  Coord,
  Observation,
  ObservedPiece,
} from "../../game/types";
import { BattleHeader } from "./BattleHeader";
import { HandTray } from "./HandTray";
import { MobileBottomDrawer } from "./MobileBottomDrawer";
import { ResourceSummary } from "./ResourceSummary";
import { ChroniclePanel } from "./ChroniclePanel";
import {
  SelectionInspector,
  displayName,
  selectionHint,
} from "./SelectionInspector";
import { InfoDialog } from "./InfoDialog";
import { Card } from "../Card";
import { mapSizes } from "../../data/map-selection";
function useCompactLayout() {
  const [compact, setCompact] = useState(
    () => window.matchMedia("(max-width:900px)").matches,
  );
  useEffect(() => {
    const m = window.matchMedia("(max-width:900px)");
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
  const [handOpen, setHandOpen] = useState(false);
  const [info, setInfo] = useState<"reference" | "selection" | null>(null);
  const closeInfo = useCallback(() => setInfo(null), []);
  const compact = useCompactLayout();
  const root = useRef<HTMLElement>(null);
  const card = cardId ? cards[cardId] : undefined;
  const canAttack = legal.some(
    (a) =>
      a.type === "act" &&
      a.pieceId === selectedPiece?.instanceId &&
      a.targetId &&
      JSON.stringify(a.path) === JSON.stringify(path),
  );
  const hint = selectionHint(o, card, selectedPiece, path.length, canAttack);
  const selected = !!card || !!selectedPiece;
  useEffect(() => {
    function escape(e: KeyboardEvent) {
      if (
        e.key === "Escape" &&
        !e.defaultPrevented &&
        !document.querySelector('[role="dialog"]') &&
        handOpen
      ) {
        e.preventDefault();
        root.current
          ?.querySelector<HTMLButtonElement>(".drawer-handle,.tray-toggle")
          ?.focus({ preventScroll: true });
        setHandOpen(false);
      }
    }
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [handOpen]);
  const hand = (
    <HandTray
      observation={o}
      cards={cards}
      selected={cardId}
      interactive={interactive}
      onSelect={onSelectCard}
    />
  );
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
      className={`battle-layout ${selected ? "has-selection" : ""}`}
    >
      <BattleHeader
        observation={o}
        busy={busy}
        onHelp={onHelp}
        onHome={onHome}
        onReplay={onReplay}
        onInfo={() => setInfo("reference")}
      />
      <div className="battle-workspace">
        <section className="map-stage" aria-label="戦場">
          {children}
        </section>
      </div>
      {selected && (
        <section
          className={`selection-bar ${selectedPiece?.actedThisTurn ? "is-acted" : ""}`}
          aria-label="選択中の指示"
        >
          <div className="selection-summary">
            <strong>
              {card
                ? card.name.replace("（仮）", "")
                : displayName(selectedPiece!, cards)}
            </strong>
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
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={onClearPath}
                >
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
              aria-label={card ? "選択カードを拡大" : "選択部隊を確認"}
              onClick={() => setInfo("selection")}
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
          stage={handOpen ? 1 : 0}
          onStage={(stage) => setHandOpen(stage > 0)}
          count={o.self.hand.length}
          resource={o.self.resourceRemaining}
          total={o.self.resourceTotal}
          endButton={endButton}
        >
          {hand}
        </MobileBottomDrawer>
      ) : (
        <section className="desktop-tray" aria-label="手札トレイ">
          {handOpen && (
            <div className="desktop-hand-body" id="desktop-hand-content">
              {hand}
            </div>
          )}
          <div className="desktop-bottom-bar">
            <button
              className="tray-toggle secondary"
              aria-expanded={handOpen}
              aria-controls="desktop-hand-content"
              onClick={(e) => {
                e.currentTarget.focus({ preventScroll: true });
                setHandOpen(!handOpen);
              }}
            >
              手札 {o.self.hand.length}{" "}
              <span aria-hidden="true">{handOpen ? "⌄" : "⌃"}</span>
            </button>
            <div
              className="bar-resources"
              aria-label={`残り資源 ${o.self.resourceRemaining}、合計 ${o.self.resourceTotal}`}
            >
              <span>◆</span>
              <b>{o.self.resourceRemaining}</b>
              <small>/{o.self.resourceTotal}</small>
            </div>
            {endButton}
          </div>
        </section>
      )}
      {info && (
        <InfoDialog
          title={
            info === "reference"
              ? "対戦情報・記録"
              : card
                ? "カード詳細"
                : "部隊情報"
          }
          onClose={closeInfo}
        >
          {info === "reference" ? (
            <>
              <p>
                {o.mapName.replace("（仮）", "")} ·{" "}
                {mapSizes.find((s) => s.radius === o.radius)?.label}（
                {o.hexes.length}マス） · シード {o.seed}
              </p>
              <h3>資源</h3>
              <ResourceSummary observation={o} cards={cards} />
              <h3>戦況記録</h3>
              <ChroniclePanel events={o.events} />
              <p className="detail-muted">
                演出の短縮は端末の「動きを減らす」設定に従います。
              </p>
            </>
          ) : (
            <>
              {card && (
                <div className="enlarged-card">
                  <Card card={card} />
                </div>
              )}
              <SelectionInspector
                observation={o}
                card={card}
                piece={selectedPiece}
                cards={cards}
              />
            </>
          )}
        </InfoDialog>
      )}
    </main>
  );
}
