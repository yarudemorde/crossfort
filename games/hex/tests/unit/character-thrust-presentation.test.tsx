import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { thrustBattle } from "../thrust-helpers";
import { observation } from "../../src/character/battle";
import { forecastAttack } from "../../src/character/forecast";
import { BattleActionBar } from "../../src/components/tactics/BattleActionBar";
import { CharacterBoard } from "../../src/components/character/CharacterBoard";
import type { CharacterGame } from "../../src/app/useCharacterGame";
import { specialtySession } from "../class-session-helpers";
import { CharacterSession } from "../../src/character/session";
import { advanceSpecialty } from "../new-class-helpers";

const uiGame = (value: Partial<CharacterGame>): CharacterGame =>
  value as CharacterGame;

it("指定先と実命中先を区別し、金の方向線と赤い実対象を表示する", () => {
  const b = thrustBattle(),
    view = observation(b, "player"),
    preview = {
      type: "act" as const,
      actorId: "actor",
      path: [],
      targetId: "other-enemy",
    };
  const forecast = forecastAttack(view, preview)!;
  const game = uiGame({
    view,
    preview,
    attackForecast: forecast,
    attacking: view.participants.find(
      (p) => p.character.characterId === "actor",
    ),
    defending: view.participants.find(
      (p) => p.character.characterId === forecast.hitTargetId,
    ),
    requestedDefender: view.participants.find(
      (p) => p.character.characterId === "other-enemy",
    ),
    expectedHit: 9,
    expectedCounter: 12,
    isHealing: false,
    busy: false,
  });
  const html = renderToStaticMarkup(
    <BattleActionBar game={game} onInspect={() => {}} />,
  );
  expect(html).toContain("指定：other-enemy → 手前に命中");
  expect(html).toContain("actor");
  expect(html).toContain("enemy");
  expect(html.indexOf("キャンセル")).toBeLessThan(html.indexOf("攻撃確定"));
  const board = renderToStaticMarkup(
    <CharacterBoard
      view={view}
      legal={[]}
      selected="actor"
      onHex={() => {}}
      attackPreview={preview}
      forecast={forecast}
    />,
  );
  expect(board).toContain('data-hit-target="enemy"');
  expect(board).toContain("#D2B576");
  expect(board).toContain("cx=");
});
it("反撃先が別人なら、元の攻撃者HPを減らさず実際の反撃対象の残HPを表示", () => {
  const b = thrustBattle(true),
    view = observation(b, "player"),
    preview = {
      type: "act" as const,
      actorId: "actor",
      path: [],
      targetId: "enemy",
    };
  const forecast = forecastAttack(view, preview)!;
  const game = uiGame({
    view,
    preview,
    attackForecast: forecast,
    attacking: view.participants.find(
      (p) => p.character.characterId === "actor",
    ),
    defending: view.participants.find(
      (p) => p.character.characterId === "enemy",
    ),
    counterRecipient: view.participants.find(
      (p) => p.character.characterId === "ally",
    ),
    expectedHit: 9,
    expectedCounter: 12,
    isHealing: false,
    busy: false,
  });
  const html = renderToStaticMarkup(
    <BattleActionBar game={game} onInspect={() => {}} />,
  );
  expect(html).toContain("反撃先：ally（残HP 18）");
  expect(html).toContain("22");
  const board = renderToStaticMarkup(
    <CharacterBoard
      view={view}
      legal={[]}
      selected="actor"
      onHex={() => {}}
      attackPreview={preview}
      forecast={forecast}
    />,
  );
  expect(board).toContain('data-counter-target="ally"');
});
it("未確認マス上の敵の有無を予測へ漏らさず、不確定として扱う", () => {
  const state = thrustBattle(),
    full = observation(state, "player");
  const o = {
    ...full,
    participants: full.participants.filter(
      (p) => p.character.characterId !== "enemy",
    ),
    hexes: full.hexes.map((h) =>
      h.q === 1 && h.r === 0 ? { ...h, visible: false } : h,
    ),
  };
  const action = {
    type: "act" as const,
    actorId: "actor",
    path: [],
    targetId: "other-enemy",
  };
  const before = forecastAttack(o, action)!;
  expect(before.uncertain).toBe(true);
  expect(before.hitTargetId).toBe("other-enemy");
  state.participants.find((p) => p.character.characterId === "enemy")!.hp = 1;
  expect(forecastAttack(o, action)).toEqual(before);
  expect(JSON.stringify(before)).not.toContain('"enemy"');
  const game = uiGame({
    view: o,
    preview: action,
    attackForecast: before,
    attacking: o.participants[0],
    defending: o.participants.find(
      (p) => p.character.characterId === "other-enemy",
    ),
    expectedHit: 9,
    expectedCounter: 12,
    isHealing: false,
    busy: false,
  });
  expect(
    renderToStaticMarkup(<BattleActionBar game={game} onInspect={() => {}} />),
  ).toContain("命中先未確定");
  expect(forecastAttack(o, { ...action, targetId: "enemy" })).toBeUndefined();
});
it("セッションの演出・ログ・再開は実際の第三者への反撃を使い、反撃を連鎖させない", () => {
  const game = specialtySession("archer"),
    snapshot = game.snapshot();
  const b = snapshot.battle,
    own = b.participants.filter((p) => p.owner === "player"),
    cpu = b.participants.filter((p) => p.owner === "cpu");
  const defender = cpu.find((p) => p.character.classId === "spearman")!;
  own[0].coord = { q: 2, r: 0 };
  own[1].coord = { q: 1, r: 0 };
  own[1].hp = 1;
  defender.coord = { q: 0, r: 0 };
  cpu
    .filter((p) => p !== defender)
    .forEach((p, i) => (p.coord = { q: 4, r: i - 3 }));
  snapshot.battle = advanceSpecialty(b, "actor");
  const resumed = CharacterSession.restore(
    JSON.parse(JSON.stringify(snapshot)),
  );
  const action = {
    type: "act" as const,
    actorId: "actor",
    path: [],
    targetId: defender.character.characterId,
  };
  const forecast = forecastAttack(resumed.view().observation, action)!;
  const r = resumed.act(action);
  const hits = r.frames.filter((f) => f.kind === "hit");
  expect(hits).toHaveLength(2);
  expect(hits[0].targetId).toBe(defender.character.characterId);
  expect(hits[1]).toMatchObject({ counter: true, targetId: "ally", amount: 1 });
  expect(
    r.frames.some((f) => f.kind === "destroy" && f.targetId === "ally"),
  ).toBe(true);
  expect(
    r.observation.participants.find((p) => p.character.characterId === "actor")
      ?.hp,
  ).toBe(forecast.attackerHpAfter);
  expect(r.chronicle.at(-1)).toContain("→ 自軍 ally");
  expect(
    resumed
      .snapshot()
      .battle.participants.find(
        (p) => p.character.characterId === defender.character.characterId,
      )?.killsThisBattle,
  ).toBe(1);
  expect(
    CharacterSession.restore(
      JSON.parse(JSON.stringify(resumed.snapshot())),
    ).view(),
  ).toEqual(resumed.view());
});
