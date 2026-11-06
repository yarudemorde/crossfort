import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { maps } from "../../src/game/data";
import { hexDistance, hexId, neighbors } from "../../src/game/rules/hex";
import { deploymentObservation } from "../../src/character/deployment";
import { headquartersFor } from "../../src/character/combat";
import { createInitialRoster, stats } from "../../src/character/roster";
import { BattleHUD } from "../../src/components/tactics/BattleHUD";
import { SoldierList } from "../../src/components/tactics/SoldierList";
import { SoldierBadge } from "../../src/components/tactics/Icons";
import { ResultsScreen } from "../../src/components/tactics/ResultsScreen";
import { beginReward } from "../../src/character/reward";
import type { CharacterGame } from "../../src/app/useCharacterGame";

const team = createInitialRoster(123).roster.filter((_, i) =>
  [0, 1, 3, 4, 6, 7].includes(i),
);
describe("配置画面の観測境界", () => {
  it.each(maps.map((m) => [m.id, m] as const))(
    "%s: 未探索地形・敵兵・敵本城HPを送らない",
    (_, map) => {
      const home = headquartersFor(map).player;
      const slots = neighbors(home);
      const placements = Object.fromEntries(
        team.map((c, i) => [c.characterId, slots[i]]),
      );
      const before = JSON.stringify({ team, placements });
      const view = deploymentObservation(map.id, team, placements);
      expect(view.hexes).toHaveLength(1 + 3 * map.radius * (map.radius + 1));
      expect(view.participants).toHaveLength(6);
      expect(view.participants.every((p) => p.owner === "player")).toBe(true);
      expect(view.headquarters.cpu.hp).toBeUndefined();
      for (const hex of view.hexes) {
        const visible =
          hexDistance(hex, home) <= 2 ||
          team.some(
            (c) =>
              hexDistance(hex, placements[c.characterId]) <= stats(c).vision,
          );
        expect(hex.visible).toBe(visible);
        expect(hex.explored).toBe(visible);
        expect(Object.hasOwn(hex, "terrain")).toBe(visible);
      }
      expect(JSON.stringify({ team, placements })).toBe(before);
    },
  );
  it("未配置・部分配置を表示し、重複や本城への配置を拒否する", () => {
    const map = maps[0],
      slots = neighbors(headquartersFor(map).player);
    const empty = deploymentObservation(map.id, team, {});
    const partial = deploymentObservation(map.id, team, {
      [team[0].characterId]: slots[0],
    });
    expect(empty.participants).toHaveLength(0);
    expect(partial.participants).toHaveLength(1);
    expect(new Set(partial.hexes.map(hexId)).size).toBe(partial.hexes.length);
    expect(() =>
      deploymentObservation(map.id, team, {
        [team[0].characterId]: slots[0],
        [team[1].characterId]: slots[0],
      }),
    ).toThrow();
    expect(() =>
      deploymentObservation(map.id, team, {
        [team[0].characterId]: headquartersFor(map).player,
      }),
    ).toThrow();
  });
});
describe("新しい戦術UIの公開情報", () => {
  it("敵全滅勝利や再開した報酬でも、味方・敵の生死一覧を最初に表示する", () => {
    const initial = createInitialRoster(123);
    const survivor = {
      character: initial.roster[0],
      owner: "player" as const,
      coord: { q: 0, r: 0 },
      hp: 2,
      alive: true,
      killsThisBattle: 1,
    };
    const fallen = {
      ...survivor,
      character: { ...initial.roster[3], characterId: "enemy" },
      owner: "cpu" as const,
      alive: false,
      hp: 0,
    };
    const save = beginReward(
      initial,
      {
        id: "results-ui",
        reason: "allUnitsKilled",
        winner: "player",
        participants: [survivor, fallen],
      },
      1,
    );
    const html = renderToStaticMarkup(
      <ResultsScreen
        game={
          { pending: save.pendingReward, save, busy: false } as CharacterGame
        }
        onDetail={() => {}}
      />,
    );
    expect(html).toContain("自軍");
    expect(html).toContain("敵軍");
    expect(html).toContain("生存");
    expect(html).toContain("戦死");
    expect(html).toContain("報酬へ進む");
    expect(html).not.toContain("降伏兵を迎える");
  });
  it("HUDは未発見の敵本城HPを?とし、メニューの開閉状態を公開する", () => {
    const view = deploymentObservation(maps[0].id, team, {});
    const hidden = renderToStaticMarkup(
      <BattleHUD view={view} onMenu={() => {}} />,
    );
    expect(hidden).toContain('class="enemy"');
    expect(hidden).toContain("<b>?</b>");
    expect(hidden).toContain('aria-expanded="false"');
    const visible = renderToStaticMarkup(
      <BattleHUD
        view={{
          ...view,
          headquarters: {
            ...view.headquarters,
            cpu: { ...view.headquarters.cpu, hp: 7 },
          },
        }}
        menuOpen
        onMenu={() => {}}
      />,
    );
    expect(visible).toContain("<b>7</b>");
    expect(visible).toContain('aria-expanded="true"');
  });
  it("15名の一覧で同職の固有名を区別し、職業アイコンを外部画像なしで描く", () => {
    const roster = Array.from({ length: 15 }, (_, i) => ({
      ...team[i % team.length],
      characterId: `id-${i}`,
      displayName: `兵士${i + 1}`,
    }));
    const html = renderToStaticMarkup(
      <SoldierList characters={roster} onSelect={() => {}} />,
    );
    expect((html.match(/class="hx-soldier-row/g) ?? []).length).toBe(15);
    expect(html).toContain("兵士15");
    for (const c of team) {
      const icon = renderToStaticMarkup(<SoldierBadge character={c} />);
      expect(icon).toContain("<svg");
      expect(icon).not.toMatch(/[♞♟♜♝♛]/);
      expect(icon).not.toContain("<img");
    }
  });
});
