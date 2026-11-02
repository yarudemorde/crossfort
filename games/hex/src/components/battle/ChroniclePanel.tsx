import type { GameEvent } from "../../game/types";
export function ChroniclePanel({ events }: { events: GameEvent[] }) {
  return (
    <ol className="battle-chronicle" aria-label="戦況記録">
      {events
        .slice(-35)
        .reverse()
        .map((e) => (
          <li key={e.id} className={e.type}>
            {e.text}
          </li>
        ))}
    </ol>
  );
}
