import type { CharacterGame } from "../../app/useCharacterGame";
import { stats } from "../../character/roster";
import { Icon, SoldierBadge } from "./Icons";
export function BattleActionBar({
  game: g,
  onInspect,
  attackIntent,
  onMoveIntent,
  onAttackIntent,
}: {
  game: CharacterGame;
  onInspect: () => void;
  attackIntent: boolean;
  onMoveIntent: () => void;
  onAttackIntent: () => void;
}) {
  const o = g.view;
  if (!o)
    return (
      <footer className="hx-actionbar">
        <p className="hx-action-summary">戦場を読み込み中…</p>
      </footer>
    );
  const unit = o.participants.find(
      (p) => p.character.characterId === g.selection,
    ),
    cpu = o.activePlayer === "cpu",
    locked = g.busy || cpu;
  const targetHp = g.defending?.hp ?? o.headquarters.cpu.hp;
  const ownAfter = g.attacking
    ? Math.max(0, g.attacking.hp - g.expectedCounter)
    : undefined;
  const targetAfter =
    targetHp === undefined ? undefined : Math.max(0, targetHp - g.expectedHit);
  return (
    <footer
      className="hx-actionbar"
      data-action-state={
        cpu
          ? "cpu"
          : g.busy
            ? "animating"
            : g.preview
              ? "attack"
              : g.movePreview
                ? "move"
                : unit
                  ? "selected"
                  : "idle"
      }
    >
      <div className="hx-action-summary" aria-live="polite">
        {locked ? (
          <div className="hx-turn-status">
            <span className="hx-pulse" />
            {cpu
              ? "敵軍の行動中"
              : g.animation?.frame.kind === "hit"
                ? g.animation.frame.counter
                  ? "反撃"
                  : "攻撃"
                : g.animation?.frame.kind === "destroy"
                  ? "戦闘不能"
                  : "行動中"}
            <small>戦場を確認できます</small>
          </div>
        ) : g.preview ? (
          <div className="hx-target-summary">
            <div>
              <strong>
                {g.attacking?.character.displayName}
                <span> → </span>
                {g.defending?.character.displayName ?? "敵本城"}
              </strong>
              <small>
                与ダメージ <b>{g.expectedHit}</b>　反撃{" "}
                <b className={g.expectedCounter ? "danger" : ""}>
                  {g.expectedCounter}
                </b>
                {targetAfter === 0 && <em>撃破可能</em>}
              </small>
            </div>
            <div className="hx-after-hp">
              <small>予測HP 自 / 敵</small>
              <b>
                {ownAfter} <span>／</span> {targetAfter ?? "?"}
              </b>
            </div>
          </div>
        ) : g.movePreview ? (
          <div className="hx-target-summary">
            <div>
              <strong>{unit?.character.displayName}</strong>
              <small>
                移動経路 <b>{g.movePreview.path.length}</b> マス
              </small>
            </div>
            <Icon name="move" size={30} />
          </div>
        ) : unit ? (
          <button
            className="hx-selected-summary"
            onClick={onInspect}
            aria-label={`${unit.character.displayName}の詳細`}
          >
            <SoldierBadge character={unit.character} hp={unit.hp} selected />
            <span>
              <strong>
                {unit.character.displayName}
                <small>
                  ❤️ {unit.hp}/{stats(unit.character).hp}
                </small>
              </strong>
              <small>
                攻撃 {stats(unit.character).attack} · 射程{" "}
                {stats(unit.character).range} · 機動{" "}
                {stats(unit.character).movement}{" "}
                <span className="hx-hint">
                  {o.pendingActorId || attackIntent
                    ? "攻撃対象を選択"
                    : "移動先を選択"}
                </span>
              </small>
            </span>
            <Icon name="chevron" size={16} />
          </button>
        ) : (
          <div className="hx-unit-rail" aria-label="自軍兵士を選択">
            {o.participants
              .filter((p) => p.owner === "player")
              .map((p) => (
                <button
                  key={p.character.characterId}
                  aria-label={`${p.character.displayName}を選択 HP${p.hp}`}
                  onClick={() => g.hex(p.coord)}
                >
                  <SoldierBadge character={p.character} hp={p.hp} />
                  <small>{p.character.displayName}</small>
                </button>
              ))}
          </div>
        )}
      </div>
      <div className="hx-action-buttons">
        {locked ? (
          <>
            <span className="hx-lock-label">
              {cpu ? "敵軍の手番" : "演出中"}
            </span>
            <button disabled>
              <Icon name="shield" />
              待機
            </button>
          </>
        ) : g.preview ? (
          <>
            <button
              className="hx-button primary danger-action"
              onClick={() => g.command(g.preview!)}
            >
              <Icon name="sword" />
              攻撃を確定
            </button>
            <button
              className="hx-button"
              onClick={() => g.setPreview(undefined)}
            >
              取消
            </button>
          </>
        ) : g.movePreview ? (
          <>
            <button
              className="hx-button primary"
              onClick={() =>
                g.send({ type: "move", ...g.movePreview!, session: g.session })
              }
            >
              <Icon name="move" />
              移動を確定
            </button>
            <button
              className="hx-button"
              onClick={() => g.setMovePreview(undefined)}
            >
              取消
            </button>
          </>
        ) : unit ? (
          <>
            <button
              className="hx-button"
              disabled={!!o.pendingActorId}
              onClick={() => {
                g.setPreview(undefined);
                g.setMovePreview(undefined);
                onMoveIntent();
              }}
            >
              <Icon name="move" />
              移動先
            </button>
            <button className="hx-button" onClick={onAttackIntent}>
              <Icon name="sword" />
              その場で攻撃
            </button>
            <button
              className="hx-button primary"
              onClick={() => g.command({ type: "pass" })}
            >
              {o.pendingActorId ? "行動終了" : "待機"}
            </button>
          </>
        ) : (
          <>
            <button className="hx-button subtle" onClick={onInspect}>
              <Icon name="book" />
              戦況
            </button>
            <span className="hx-ready-label">兵士を選択</span>
            <button
              className="hx-button"
              onClick={() => g.command({ type: "pass" })}
            >
              <Icon name="shield" />
              待機
            </button>
          </>
        )}
      </div>
    </footer>
  );
}
