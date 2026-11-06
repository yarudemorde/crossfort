import type { CharacterGame } from "../../app/useCharacterGame";
import { mapTypes, mapSizes, type MapSizeId } from "../../data/map-selection";
import { Icon } from "./Icons";
export function SettingsPanel({ game: g }: { game: CharacterGame }) {
  const locked =
    g.screen === "battle" || g.screen === "reward" || g.screen === "defeat";
  return (
    <div className="hx-settings">
      <p className="hx-muted">
        {locked
          ? "現在の対戦中は戦場の設定を変更できません。"
          : "次の出撃で使用する戦場"}
      </p>
      <fieldset disabled={locked}>
        <legend>戦場</legend>
        <div className="hx-setting-options">
          {mapTypes.map((m) => (
            <button
              key={m.id}
              aria-pressed={g.mapType === m.id}
              onClick={() => {
                g.setMapType(m.id);
                g.setPlacements({});
              }}
            >
              <Icon name={m.id === "crossing" ? "move" : "shield"} />
              {m.name.replace("（仮）", "")}
            </button>
          ))}
        </div>
        <h3>マップサイズ</h3>
        <div className="hx-setting-options">
          {mapSizes.map((s) => (
            <button
              key={s.id}
              aria-pressed={g.mapSize === s.id}
              onClick={() => {
                g.setMapSize(s.id as MapSizeId);
                g.setPlacements({});
              }}
            >
              <strong>{s.label}</strong>
              <small>{s.hexCount}マス</small>
            </button>
          ))}
        </div>
        <details>
          <summary>詳細設定</summary>
          <label className="hx-seed-input">
            乱数シード
            <input
              type="number"
              value={g.battleSeed}
              onChange={(e) => g.setBattleSeed(Number(e.target.value) >>> 0)}
            />
          </label>
        </details>
      </fieldset>
      {g.save?.migrationNotice && (
        <p className="hx-muted" role="status">
          {g.save.migrationNotice}
        </p>
      )}
      <p className="hx-muted">
        演出の軽減は端末の「視差効果を減らす」設定に従います。所持・戦闘・報酬はこのブラウザに自動保存されます。
      </p>
    </div>
  );
}
