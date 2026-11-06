import type { Character } from "../../character/types";
import { stats } from "../../character/roster";
import { SoldierBadge, classNames, Icon } from "./Icons";
export function SoldierList({
  characters,
  selected = [],
  onSelect,
  disabled = false,
}: {
  characters: Character[];
  selected?: string[];
  onSelect: (c: Character) => void;
  disabled?: boolean;
}) {
  return (
    <div className="hx-soldier-list">
      {characters.map((c) => {
        const s = stats(c),
          active = selected.includes(c.characterId);
        return (
          <button
            key={c.characterId}
            className={`hx-soldier-row ${active ? "selected" : ""}`}
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onSelect(c)}
          >
            <SoldierBadge character={c} selected={active} />
            <span className="hx-soldier-name">
              <strong>{c.displayName}</strong>
              <small>
                {classNames[c.classId]} <b>Lv.{c.level}</b>
              </small>
            </span>
            <span className="hx-row-stats">
              <span>
                <Icon name="heart" size={13} />
                {s.hp}
              </span>
              <span>
                <Icon name="sword" size={13} />
                {s.attack}
              </span>
            </span>
            <span className="hx-row-tail">
              {active ? (
                <Icon name="check" size={18} />
              ) : (
                <Icon name="chevron" size={16} />
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
