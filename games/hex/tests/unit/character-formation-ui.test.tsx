import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  reconcileFormationDraft,
  type FormationDraft,
} from "../../src/app/formation";
import type { CharacterGame } from "../../src/app/useCharacterGame";
import { Formation } from "../../src/components/tactics/CampScreens";
import { DeploymentBar } from "../../src/components/tactics/DeploymentBar";
import {
  createInitialRoster,
  retire,
  stats,
  validateFormation,
} from "../../src/character/roster";
import {
  beginReward,
  commitVictory,
  promote,
} from "../../src/character/reward";
import type { BattleResult } from "../../src/character/types";

const initial = createInitialRoster(123);
const team = initial.roster.filter((_, i) => [0, 1, 3, 4, 6, 7].includes(i));
const draft: FormationDraft = {
  formation: team.map((c) => c.characterId),
  placements: Object.fromEntries(
    team.map((c, i) => [c.characterId, { q: i, r: 0 }]),
  ),
  pick: team[1].characterId,
};
const result: BattleResult = {
  id: "one-survivor",
  winner: "player",
  reason: "allUnitsKilled",
  participants: team.map((character, i) => ({
    character,
    owner: "player",
    coord: draft.placements[character.characterId],
    hp: i === 0 ? 1 : 0,
    alive: i === 0,
    killsThisBattle: i === 0 ? 2 : 0,
  })),
};
const committed = commitVictory(
  promote(beginReward(initial, result, 7), team[0].characterId),
);

describe("所持データ更新後の編成UI", () => {
  it("6名中5名が戦死した勝利後、人数・コスト・出撃枠・配置を生存者1名で一致させる", () => {
    const next = reconcileFormationDraft(draft, committed.roster);
    const chosen = next.formation.map((id) =>
      committed.roster.find((c) => c.characterId === id)!,
    );
    const cost = chosen.reduce((n, c) => n + stats(c).cost, 0);
    expect(next).toEqual({
      formation: [team[0].characterId],
      placements: {
        [team[0].characterId]: draft.placements[team[0].characterId],
      },
      pick: undefined,
    });
    expect(chosen).toHaveLength(1);
    expect(cost).toBe(2);
    expect(validateFormation(next.formation, committed.roster)).toBeUndefined();
    const game = {
      ...next,
      save: committed,
      chosen,
      cost,
      busy: false,
    } as CharacterGame;
    const html = renderToStaticMarkup(<Formation game={game} />);
    expect(html).toContain("出撃兵士 <b>1<small>/6</small>");
    expect(html).toContain("編成コスト <b>2<small>/10</small>");
    expect(html.match(/class="hx-empty-slot"/g) ?? []).toHaveLength(5);
    expect(renderToStaticMarkup(<DeploymentBar game={game} />)).toContain(
      " / 1名 配置済み",
    );
  });

  it("空いた枠へ控え兵を追加でき、死亡IDを再登録しない", () => {
    const next = reconcileFormationDraft(draft, committed.roster);
    const reserve = committed.roster.find(
      (c) => !next.formation.includes(c.characterId),
    )!;
    const formation = [...next.formation, reserve.characterId];
    expect(validateFormation(formation, committed.roster)).toBeUndefined();
    expect(formation).toHaveLength(2);
    expect(
      formation.some((id) =>
        committed.archive.some((c) => c.characterId === id),
      ),
    ).toBe(false);
  });

  it("除隊した兵士も枠・配置・配置選択から除き、生存者の並び順を保つ", () => {
    const save = retire(initial, team[1].characterId);
    const next = reconcileFormationDraft(draft, save.roster);
    expect(next.formation).toEqual(
      draft.formation.filter((id) => id !== team[1].characterId),
    );
    expect(next.placements).not.toHaveProperty(team[1].characterId);
    expect(next.pick).toBeUndefined();
    expect(next.placements[team[0].characterId]).toBe(
      draft.placements[team[0].characterId],
    );
  });

  it("名前変更・成長・敗北時の所持データでは編成と配置を変更しない", () => {
    const roster = initial.roster.map((c) => ({
      ...c,
      displayName: `改名${c.displayName}`,
    }));
    expect(reconcileFormationDraft(draft, roster)).toBe(draft);
    expect(reconcileFormationDraft(draft, initial.roster)).toBe(draft);
    expect(
      reconcileFormationDraft(
        { ...draft, pick: team[0].characterId },
        committed.roster,
      ).pick,
    ).toBe(team[0].characterId);
  });

  it("存在しないIDと重複を整理し、新加入兵は自動編成しない", () => {
    const input = {
      ...draft,
      formation: [team[0].characterId, "missing", team[0].characterId],
    };
    const next = reconcileFormationDraft(input, initial.roster);
    expect(next.formation).toEqual([team[0].characterId]);
    expect(Object.keys(next.placements)).toEqual(next.formation);
    expect(next.pick).toBeUndefined();
  });

  it("再適用しても変化せず、所持・アーカイブ・報酬の保存データを変更しない", () => {
    const before = JSON.stringify(committed);
    const next = reconcileFormationDraft(draft, committed.roster);
    expect(reconcileFormationDraft(next, committed.roster)).toBe(next);
    expect(JSON.stringify(committed)).toBe(before);
    expect(
      committed.roster.find((c) => c.characterId === team[0].characterId),
    ).toMatchObject({ level: 2, battlesParticipated: 1, kills: 2 });
    expect(committed.archive).toHaveLength(5);
    expect(committed.completedRewardIds).toContain(result.id);
  });
});
