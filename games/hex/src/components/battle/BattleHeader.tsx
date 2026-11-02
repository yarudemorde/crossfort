import { useEffect, useRef, useState } from "react";
import type { Observation } from "../../game/types";
export function BattleHeader({
  observation: o,
  busy,
  onHelp,
  onHome,
  onReplay,
}: {
  observation: Observation;
  busy: boolean;
  onHelp: () => void;
  onHome: () => void;
  onReplay: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menu) return;
    function outside(e: PointerEvent) {
      if (!root.current?.contains(e.target as Node)) setMenu(false);
    }
    function escape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setMenu(false);
        trigger.current?.focus();
      }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [menu]);
  const close = (action: () => void) => {
    setMenu(false);
    trigger.current?.focus();
    action();
  };
  const own = o.pieces.find((p) => p.instanceId === "hq_player")?.power ?? 0;
  const enemy =
    o.pieces.find((p) => p.instanceId === "hq_cpu")?.power ??
    (o.outcome?.winner === "player" ? 0 : "?");
  return (
    <header className="battle-header">
      <div className={`battle-turn ${o.activePlayer}`} role="status">
        <span className="turn-light" />
        <span>
          <b>TURN {o.self.ownTurnNumber || 1}</b>
          <small>
            {o.outcome
              ? "決着"
              : o.activePlayer === "cpu"
                ? "CPUのターン"
                : busy
                  ? "処理中"
                  : "自分のターン"}
          </small>
        </span>
      </div>
      <div
        className="hq-summary"
        aria-label={`自軍本城 ${own}/12、敵軍本城 ${enemy}/12`}
      >
        <span className="own-hq">
          自軍本城{" "}
          <b>
            {own}
            <small>/12</small>
          </b>
        </span>
        <span className="enemy-hq">
          敵軍本城{" "}
          <b>
            {enemy}
            <small>/12</small>
          </b>
        </span>
      </div>
      <div className="battle-menu" ref={root}>
        <button
          ref={trigger}
          className="icon-button"
          aria-label="対戦メニュー"
          aria-expanded={menu}
          aria-controls="battle-menu-content"
          onClick={() => setMenu(!menu)}
        >
          ☰
        </button>
        {menu && (
          <div
            className="battle-menu-content"
            id="battle-menu-content"
            role="region"
            aria-label="対戦メニュー"
          >
            <button onClick={() => close(onHelp)}>遊び方</button>
            <button onClick={() => close(onReplay)}>対戦記録を保存</button>
            <button onClick={() => close(onHome)}>タイトルへ戻る</button>
            <details>
              <summary>対戦情報・表示設定</summary>
              <p>
                {o.mapName.replace("（仮）", "")}
                <br />
                シード {o.seed}
                <br />
                プロトタイプ 1.0
              </p>
              <p>動きを減らす設定は端末の設定に従います。</p>
            </details>
          </div>
        )}
      </div>
    </header>
  );
}
