import type { Character, Reward } from "../../character/types";
import { stats } from "../../character/roster";
export function GrowthResult({
  character,
  result,
}: {
  character: Character;
  result: NonNullable<Reward["promotionResult"]>;
}) {
  const before = stats(character),
    after = stats({
      ...character,
      level: result.toLevel,
      growthHistory: [...character.growthHistory, result.gain],
    });
  return (
    <section className="hx-growth-result" aria-label="確定した成長結果">
      <h2>
        {character.displayName}{" "}
        <small>
          Lv.{result.fromLevel} → {result.toLevel}
        </small>
      </h2>
      <dl>
        {(
          [
            ["体力", before.hp, after.hp, result.gain.hp],
            ["攻撃", before.attack, after.attack, result.gain.attack],
            [
              "機動",
              before.initiative,
              after.initiative,
              result.gain.initiative,
            ],
            [
              "反撃",
              `×${(before.counterTenths / 10).toFixed(1)}`,
              `×${(after.counterTenths / 10).toFixed(1)}`,
              (result.gain.counterTenths / 10).toFixed(1),
            ],
          ] as const
        ).map(([label, a, b, gain]) => (
          <div key={label} className={Number(gain) > 0 ? "improved" : ""}>
            <dt>{label}</dt>
            <dd>
              {a} <span>→</span> <b>{b}</b>
              <em>+{gain}</em>
            </dd>
          </div>
        ))}
      </dl>
      <p>成長結果は保存済みです。</p>
    </section>
  );
}
