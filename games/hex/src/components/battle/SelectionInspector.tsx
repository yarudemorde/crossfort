import type {
  CardDefinition,
  ObservedPiece,
  Observation,
} from "../../game/types";
import { effectText } from "../Card";
import { typeNames } from "../Icons";
export const displayName = (
  p: ObservedPiece,
  cards: Record<string, CardDefinition>,
) =>
  p.kind === "headquarters"
    ? "本城"
    : (cards[p.definitionId]?.name.replace("（仮）", "") ?? p.kind);
export function selectionHint(
  o: Observation,
  card?: CardDefinition,
  piece?: ObservedPiece,
  pathLength = 0,
  canAttack = false,
) {
  if (card)
    return card.cost > o.self.resourceRemaining
      ? "資源不足"
      : card.type === "spell"
        ? "対象を選択"
        : "配置先を選択";
  if (!piece) return "";
  if (piece.owner !== o.owner) return "敵軍";
  if (piece.summonedOnOwnTurn >= o.self.ownTurnNumber)
    return "このターンは行動不可";
  if (piece.actedThisTurn) return "行動済み";
  return pathLength
    ? canAttack
      ? "攻撃対象を選択 / 移動を確定"
      : "移動を確定"
    : canAttack
      ? "移動先・攻撃対象を選択"
      : "移動先を選択";
}
export function SelectionInspector({
  observation: o,
  card,
  piece,
  cards,
}: {
  observation: Observation;
  card?: CardDefinition;
  piece?: ObservedPiece;
  cards: Record<string, CardDefinition>;
}) {
  if (!card && !piece)
    return <p className="detail-muted">選択中のカード・部隊はありません。</p>;
  return (
    <div className="selection-detail">
      <h3>
        {card ? card.name.replace("（仮）", "") : displayName(piece!, cards)}
      </h3>
      {card ? (
        <>
          <p>
            {typeNames[card.type]} · コスト {card.cost} · 資源 {card.resource}
          </p>
          {card.type === "spell" ? (
            <p>{effectText(card)}</p>
          ) : (
            <p>
              戦力 {card.power} · 視野 {card.vision} · 射程 {card.range ?? 0}
              <br />
              {card.type === "unit"
                ? `移動 ${card.movement}`
                : `領土 ${card.territory}`}
            </p>
          )}
        </>
      ) : (
        <>
          <p>
            戦力 {piece!.power} · 視野 {piece!.vision} · 射程 {piece!.range}
            <br />
            {piece!.kind === "unit"
              ? `移動 ${piece!.movement}`
              : `領土 ${piece!.territory}`}
          </p>
          <p>{selectionHint(o, undefined, piece)}</p>
        </>
      )}
    </div>
  );
}
