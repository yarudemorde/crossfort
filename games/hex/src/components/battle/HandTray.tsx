import type { Observation, CardDefinition } from "../../game/types";
import { Card } from "../Card";
export function HandTray({
  observation: o,
  cards,
  selected,
  interactive,
  onSelect,
}: {
  observation: Observation;
  cards: Record<string, CardDefinition>;
  selected?: string;
  interactive: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="hand-tray" aria-label="手札">
      <div className="hand-cards">
        {o.self.hand.map((id) => (
          <Card
            key={id}
            card={cards[id]}
            selected={id === selected}
            disabled={!interactive || cards[id].cost > o.self.resourceRemaining}
            onClick={() => {
              if (interactive) onSelect(id);
            }}
            tray
          />
        ))}
        {!o.self.hand.length && (
          <p className="empty-tray">
            {o.outcome
              ? "戦闘終了"
              : o.activePlayer === "cpu"
                ? "次のターンを待っています"
                : "手札なし"}
          </p>
        )}
      </div>
    </section>
  );
}
