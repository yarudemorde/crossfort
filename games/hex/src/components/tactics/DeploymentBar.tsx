import { useRef, useState, type PointerEvent } from "react";
import type { CharacterGame } from "../../app/useCharacterGame";
import { SoldierBadge, Icon } from "./Icons";
export function DeploymentBar({ game: g }: { game: CharacterGame }) {
  const drag = useRef<
    { id: string; x: number; y: number; moving: boolean } | undefined
  >(undefined);
  const dragged = useRef(false);
  const [ghost, setGhost] = useState<{ id: string; x: number; y: number }>();
  function down(e: PointerEvent<HTMLButtonElement>, id: string) {
    if (e.button !== 0) return;
    dragged.current = false;
    drag.current = { id, x: e.clientX, y: e.clientY, moving: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10) d.moving = true;
    if (d.moving) {
      e.preventDefault();
      setGhost({ id: d.id, x: e.clientX, y: e.clientY });
    }
  }
  function up(e: PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    drag.current = undefined;
    setGhost(undefined);
    if (!d?.moving) return;
    dragged.current = true;
    const tile = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest("[data-hex]");
    const value = tile?.getAttribute("data-hex")?.split(",").map(Number);
    if (value?.length === 2 && value.every(Number.isFinite))
      g.chooseSlot({ q: value[0], r: value[1] }, d.id);
  }
  const placed = Object.keys(g.placements).filter((id) =>
    g.formation.includes(id),
  ).length;
  return (
    <footer className="hx-deployment-bar">
      <div className="hx-lineup-label">
        <strong>
          {placed}
          <small> / {g.formation.length}名 配置済み</small>
        </strong>
        <button
          className="hx-icon-btn"
          aria-label="選択した兵士の配置を戻す"
          disabled={!g.pick || !g.placements[g.pick]}
          onClick={() =>
            g.setPlacements((p) =>
              Object.fromEntries(
                Object.entries(p).filter(([id]) => id !== g.pick),
              ),
            )
          }
        >
          <Icon name="back" />
        </button>
      </div>
      <div className="hx-deployment-rail">
        {g.chosen.map((c) => (
          <button
            key={c.characterId}
            className={g.pick === c.characterId ? "selected" : ""}
            aria-label={`${c.displayName} ${g.placements[c.characterId] ? "配置済み" : "未配置"}`}
            onClick={() => {
              if (dragged.current) {
                dragged.current = false;
                return;
              }
              g.setPick((p) =>
                p === c.characterId ? undefined : c.characterId,
              );
            }}
            onPointerDown={(e) => down(e, c.characterId)}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={() => {
              drag.current = undefined;
              setGhost(undefined);
            }}
          >
            <SoldierBadge character={c} selected={g.pick === c.characterId} />
            <small>{c.displayName}</small>
            {g.placements[c.characterId] && (
              <span className="hx-deployed-check">
                <Icon name="check" size={12} />
              </span>
            )}
          </button>
        ))}
      </div>
      <button
        className="hx-button primary hx-wide"
        disabled={g.busy || placed !== g.formation.length || !placed}
        onClick={g.start}
      >
        <Icon name="flag" />
        戦闘開始
      </button>
      {ghost && (
        <div className="hx-drag-ghost" style={{ left: ghost.x, top: ghost.y }}>
          <SoldierBadge
            character={g.chosen.find((c) => c.characterId === ghost.id)!}
          />
        </div>
      )}
    </footer>
  );
}
