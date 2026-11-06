import type { BattleObservation } from "../../character/battle";
import { Icon } from "./Icons";
export function BattleHUD({
  view,
  title,
  onMenu,
  onBack,
  menuOpen = false,
}: {
  view?: BattleObservation;
  title?: string;
  onMenu: () => void;
  menuOpen?: boolean;
  onBack?: () => void;
}) {
  return (
    <header className="hx-hud">
      {onBack ? (
        <button className="hx-icon-btn" onClick={onBack} aria-label="戻る">
          <Icon name="back" />
        </button>
      ) : (
        <span className="hx-logo" aria-label="CROSSFORT HEX">
          CF<span>HEX</span>
        </span>
      )}
      <div className="hx-hud-heading">
        {view ? (
          <>
            <strong>
              {view.activePlayer === "player" ? "自軍の手番" : "敵軍の手番"}
            </strong>
            <small>ROUND {view.roundNumber}</small>
          </>
        ) : (
          <strong>{title ?? "本陣"}</strong>
        )}
      </div>
      {view && (
        <div className="hx-fortress-hp">
          <span aria-label={`自軍本城 HP${view.headquarters.player.hp}`}>
            <Icon name="castle" size={18} />
            <b>{view.headquarters.player.hp}</b>
          </span>
          <i />
          <span
            className="enemy"
            aria-label={`敵本城 HP${view.headquarters.cpu.hp ?? "?"}`}
          >
            <Icon name="castle" size={18} />
            <b>{view.headquarters.cpu.hp ?? "?"}</b>
          </span>
        </div>
      )}
      <button
        className="hx-icon-btn"
        onClick={onMenu}
        aria-label="メニュー"
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? "hx-sheet" : undefined}
      >
        <Icon name="menu" />
      </button>
    </header>
  );
}
