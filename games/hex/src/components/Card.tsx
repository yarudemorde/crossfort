import type { CardDefinition } from "../game/types";
import { Sigil, typeNames } from "./Icons";
export function effectText(c: CardDefinition) {
  const e = c.effects?.[0];
  return !e
    ? ""
    : e.effectId === "heal"
      ? `味方の累積ダメージを${e.amount}回復。`
      : e.effectId === "directDamage"
        ? `視野内の敵1体に${e.amount}ダメージ。反撃なし。`
        : e.effectId === "reveal"
          ? `視野内の地点から半径${e.radius}の地形を探索。`
          : `味方ユニットの戦力 +${e.amount}。ターン終了まで。`;
}
export function Card({
  card,
  selected = false,
  disabled = false,
  onClick,
  compact = false,
}: {
  card: CardDefinition;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  compact?: boolean;
}) {
  return (
    <button
      className={`game-card ${card.type} ${selected ? "selected" : ""} ${disabled ? "unaffordable" : ""} ${compact ? "compact" : ""}`}
      onClick={onClick}
      aria-label={`${card.name} コスト${card.cost} 資源${card.resource}`}
      aria-pressed={selected}
    >
      <div className="card-top">
        <span className="cost">{card.cost}</span>
        <span>{typeNames[card.type]}</span>
        <span className="card-index">
          {card.id.split("_")[0] === "unit"
            ? "I"
            : card.type === "landmark"
              ? "II"
              : "III"}
        </span>
      </div>
      <div className="card-art">
        <div className="sigil-ring" />
        <Sigil kind={card.type} variant={card.id} />
      </div>
      <strong>{card.name.replace("（仮）", "")}</strong>
      <div className="card-stats">
        {card.type === "spell" ? (
          <span>{effectText(card)}</span>
        ) : (
          <>
            <span>⚔ {card.power}</span>
            <span>◉ {card.vision}</span>
            {card.type === "unit" ? (
              <>
                <span>➶ {card.range}</span>
                <span>↟ {card.movement}</span>
              </>
            ) : (
              <span>⬡ {card.territory}</span>
            )}
          </>
        )}
      </div>
      <div className="card-foot">
        <span>PROTOTYPE</span>
        <span>◆ {card.resource}</span>
      </div>
    </button>
  );
}
