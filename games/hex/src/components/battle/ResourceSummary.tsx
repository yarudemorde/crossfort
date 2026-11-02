import type { Observation, CardDefinition } from "../../game/types";
export function ResourceSummary({
  observation: o,
  cards,
}: {
  observation: Observation;
  cards: Record<string, CardDefinition>;
}) {
  return (
    <section className="resource-detail" aria-label="資源内訳">
      <p>
        残り <b>{o.self.resourceRemaining}</b> / 合計 {o.self.resourceTotal}
      </p>
      <ul>
        {o.self.resourceCards.map((id) => (
          <li key={id}>
            <span>{cards[id].name.replace("（仮）", "")}</span>
            <b>◆{cards[id].resource}</b>
          </li>
        ))}
      </ul>
      <p className="detail-muted">
        山札 {o.self.deckCount}枚 · 使用済 {o.self.playedCards.length}枚<br />
        公開資源 {o.self.resourceCards.length}枚 · 生存拠点{" "}
        {
          o.pieces.filter((p) => p.owner === o.owner && p.kind === "landmark")
            .length
        }
        基
      </p>
    </section>
  );
}
