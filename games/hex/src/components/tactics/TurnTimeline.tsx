import { useEffect, useRef } from "react";
import type { BattleObservation } from "../../character/battle";
import type { Character } from "../../character/types";
import { stats } from "../../character/roster";
import { SoldierBadge } from "./Icons";
/** Receives only the Worker-filtered, relative order. No hidden slots or absolute indices. */
export function TurnTimeline({
  view,
  onInspect,
}: {
  view: BattleObservation;
  onInspect: (c: Character) => void;
}) {
  const rail = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rail.current,
      current = el?.querySelector<HTMLElement>('[aria-current="step"]');
    if (el && current)
      el.scrollTo({
        left: current.offsetLeft - el.clientWidth / 2 + current.clientWidth / 2,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
  }, [view.currentActorId, view.roundNumber]);
  return (
    <nav
      className="hx-timeline"
      aria-label="現在視認できる部隊の行動順。視野外の敵は表示しません。"
    >
      <div className="hx-timeline-label">
        <span>行動順</span>
        {view.activePlayer === "cpu" && !view.currentActorId && (
          <small>敵軍行動中</small>
        )}
      </div>
      <div className="hx-timeline-rail" ref={rail}>
        {view.timeline.map((entry) => {
          const p = view.participants.find(
            (p) => p.character.characterId === entry.characterId,
          );
          if (!p) return null;
          return (
            <button
              key={entry.characterId}
              aria-label={`${p.owner === "player" ? "自軍" : "敵軍"} ${p.character.displayName} 機動${stats(p.character).initiative} ${entry.current ? "行動中" : entry.acted ? "行動済み" : "未行動"}`}
              aria-current={entry.current ? "step" : undefined}
              className={`${entry.current ? "current" : ""} ${entry.acted ? "acted" : ""}`}
              onClick={() => onInspect(p.character)}
            >
              <SoldierBadge
                character={p.character}
                hp={p.hp}
                enemy={p.owner === "cpu"}
                selected={entry.current}
              />
              <span>{p.character.displayName}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
