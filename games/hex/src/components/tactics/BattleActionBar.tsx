import type { CharacterGame } from "../../app/useCharacterGame";
import { stats } from "../../character/roster";
import { chargeBonus } from "../../character/abilities";
import { Icon, SoldierBadge } from "./Icons";
export function BattleActionBar({
  game: g,
  onInspect,
}: {
  game: CharacterGame;
  onInspect: () => void;
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
  const ownAfter =
    g.attackForecast?.attackerHpAfter ??
    (g.attacking ? Math.max(0, g.attacking.hp - g.expectedCounter) : undefined);
  const targetAfter =
    targetHp === undefined
      ? undefined
      : g.isHealing
        ? targetHp + g.expectedHeal
        : (g.attackForecast?.hitTargetHpAfter ??
          Math.max(0, targetHp - g.expectedHit));
  const redirectedCounter =
    g.attackForecast?.counterTargetId &&
    g.attackForecast.counterTargetId !== g.preview?.actorId;
  const aimNote = g.attackForecast?.uncertain
    ? "視野内の予測・命中先未確定"
    : redirectedCounter
      ? `反撃先：${g.counterRecipient?.character.displayName ?? "部隊"}（残HP ${g.attackForecast?.counterTargetHpAfter}）`
      : g.attackForecast?.directional
        ? `直突き｜指定：${g.requestedDefender?.character.displayName ?? "敵本城"}${g.attackForecast.hitTargetId !== g.preview?.targetId ? " → 手前に命中" : ""}`
        : undefined;
  const healing = unit?.character.classId === "medic";
  const chargeReady =
    unit &&
    chargeBonus(unit.character, o.pendingMovedHexes ?? 0) > 0 &&
    g.response?.legal?.some(
      (a) => a.type === "act" && a.targetId && !a.targetId.startsWith("hq_"),
    );
  return (
    <footer
      className="hx-actionbar"
      data-action-state={
        cpu
          ? "cpu"
          : g.busy
            ? "animating"
            : g.preview
              ? g.isHealing
                ? "heal"
                : "attack"
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
              : g.animation?.frame.kind === "heal"
                ? "回復"
                : g.animation?.frame.kind === "hit"
                  ? g.animation.frame.counter
                    ? "反撃"
                    : g.animation.frame.charge
                      ? "突撃"
                      : "攻撃"
                  : g.animation?.frame.kind === "destroy"
                    ? "戦闘不能"
                    : "行動中"}
            <small>戦場を確認できます</small>
          </div>
        ) : g.preview ? (
          <div
            className={`hx-target-summary ${aimNote ? "hx-target-noted" : ""}`}
          >
            <div>
              <strong>
                {g.attacking?.character.displayName}
                <span> → </span>
                {g.defending?.character.displayName ?? "敵本城"}
              </strong>
              {g.isHealing ? (
                <small className="hx-heal-text">
                  回復予定 <b>+{g.expectedHeal}</b>　HP {targetHp} →{" "}
                  {targetAfter}
                </small>
              ) : (
                <small>
                  与ダメージ <b>{g.expectedHit}</b>　反撃{" "}
                  <b className={g.expectedCounter ? "danger" : ""}>
                    {g.expectedCounter}
                  </b>
                  {targetAfter === 0 && <em>撃破可能</em>}
                  {(ownAfter === 0 ||
                    (redirectedCounter &&
                      g.attackForecast?.counterTargetHpAfter === 0)) && (
                    <em className="danger-text">戦死の危険</em>
                  )}
                  {!!g.expectedCharge && <em>突撃 +{g.expectedCharge}</em>}
                </small>
              )}
              {aimNote && <small className="hx-aim-note">{aimNote}</small>}
            </div>
            <div className="hx-after-hp">
              <small>{g.isHealing ? "回復後HP" : "予測HP 自 / 敵"}</small>
              <b>
                {g.attackForecast?.uncertain ? (
                  "?"
                ) : (
                  <>
                    {!g.isHealing && (
                      <>
                        {ownAfter} <span>／</span>{" "}
                      </>
                    )}
                    {targetAfter ?? "?"}
                  </>
                )}
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
                {stats(unit.character).range} · 移動{" "}
                {stats(unit.character).movement} · 機動{" "}
                {stats(unit.character).initiative}{" "}
                <span className="hx-hint">
                  {chargeReady
                    ? "突撃可能 +3"
                    : o.pendingActorId
                      ? healing
                        ? "回復対象を選択"
                        : "攻撃対象を選択"
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
              className="hx-button"
              onClick={() => g.setPreview(undefined)}
            >
              キャンセル
            </button>
            <button
              className={`hx-button primary ${g.isHealing ? "heal-action" : "danger-action"}`}
              onClick={() => g.command(g.preview!)}
            >
              <Icon name={g.isHealing ? "heart" : "sword"} />
              {g.isHealing ? "回復確定" : "攻撃確定"}
            </button>
          </>
        ) : g.movePreview ? (
          <>
            <button
              className="hx-button"
              onClick={() => g.setMovePreview(undefined)}
            >
              キャンセル
            </button>
            <button
              className="hx-button primary"
              onClick={() =>
                g.send({ type: "move", ...g.movePreview!, session: g.session })
              }
            >
              <Icon name="move" />
              移動確定
            </button>
          </>
        ) : unit ? (
          <>
            <button className="hx-button subtle" onClick={onInspect}>
              詳細
            </button>
            <span className="hx-ready-label">
              {o.pendingActorId
                ? healing
                  ? "味方をタップ"
                  : "敵をタップ"
                : healing
                  ? "移動先・味方をタップ"
                  : "移動先・敵をタップ"}
            </span>
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
