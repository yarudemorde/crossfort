import { directActionAt } from "../../src/app/battle-target";
import { CharacterSession } from "../../src/character/session";
import { advanceSpecialty } from "../new-class-helpers";
import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { specialtySession } from "../class-session-helpers";
import { BattleActionBar } from "../../src/components/tactics/BattleActionBar";
import { CharacterBoard } from "../../src/components/character/CharacterBoard";
import {
  ClassFilter,
  SoldierDetails,
} from "../../src/components/tactics/CampScreens";
import { classNames, SoldierBadge } from "../../src/components/tactics/Icons";
import { newCharacter } from "../new-class-helpers";
import type { CharacterGame } from "../../src/app/useCharacterGame";

it("6職業のアイコン・絞込・能力説明を描画する", () => {
  const filter = renderToStaticMarkup(
    <ClassFilter value="all" onChange={() => {}} />,
  );
  for (const cls of [
    "knight",
    "archer",
    "scout",
    "spearman",
    "medic",
    "cavalry",
  ] as const) {
    expect(filter).toContain(classNames[cls]);
    expect(
      renderToStaticMarkup(<SoldierBadge character={newCharacter(cls)} />),
    ).toContain("<svg");
  }
  const medic = renderToStaticMarkup(
    <SoldierDetails character={newCharacter("medic")} busy={false} />,
  );
  expect(medic).toContain("現在の回復量：10");
  expect(medic).toContain("反撃なし");
  expect(
    renderToStaticMarkup(
      <SoldierDetails character={newCharacter("cavalry")} busy={false} />,
    ),
  ).toContain("突撃");
});
it("回復予測・確定ボタンと緑の+10を表示し、順序は取消→確定", () => {
  const game = specialtySession("medic");
  const v = game.view();
  const action = v.legal.find(
    (a) => a.type === "act" && a.effect === "heal" && !a.path.length,
  )!;
  const actor = v.observation.participants.find(
    (p) => p.character.characterId === "actor",
  )!;
  const target = v.observation.participants.find(
    (p) => p.character.characterId === "ally",
  )!;
  const g = {
    view: v.observation,
    selection: "actor",
    preview: action,
    attacking: actor,
    defending: target,
    isHealing: true,
    expectedHeal: 10,
    expectedHit: 0,
    expectedCounter: 0,
    busy: false,
    response: v,
  } as CharacterGame;
  const html = renderToStaticMarkup(
    <BattleActionBar game={g} onInspect={() => {}} />,
  );
  expect(html).toContain("回復予定");
  expect(html).toContain("+10");
  expect(html).toContain("回復確定");
  expect(html).not.toContain("攻撃確定");
  expect(html.indexOf("キャンセル")).toBeLessThan(html.indexOf("回復確定"));
  const data = game.act(action);
  const f = data.frames.find((f) => f.kind === "heal")!;
  expect(f.amount).toBe(10);
  expect(
    f.after.participants.find((p) => p.character.characterId === "ally")?.hp,
  ).toBe(15);
  expect(data.chronicle.join(" ")).toContain("回復");
  const board = renderToStaticMarkup(
    <CharacterBoard
      view={f.after}
      legal={[]}
      onHex={() => {}}
      animation={{ frame: f, impact: true, serial: 1 }}
    />,
  );
  expect(board).toContain("+10");
  expect(board).toContain("#91dfaa");
});
it("突撃エフェクトは実移動後の攻撃だけ。再開しても+3が一致", () => {
  const game = specialtySession("cavalry");
  game.move("actor", [
    { q: -1, r: 0 },
    { q: 0, r: 0 },
    { q: 1, r: 0 },
  ]);
  const snapshot = game.snapshot();
  const restored =
    game.constructor as typeof import("../../src/character/session").CharacterSession;
  const resumed = restored.restore(JSON.parse(JSON.stringify(snapshot)));
  expect(resumed.view().observation.pendingMovedHexes).toBe(3);
  const action = resumed
    .view()
    .legal.find(
      (a) => a.type === "act" && a.targetId && !a.targetId.startsWith("hq_"),
    )!;
  const data = resumed.act(action);
  const hit = data.frames.find((f) => f.kind === "hit" && !f.counter)!;
  expect(hit.charge).toBe(true);
  expect(hit.amount).toBe(18);
  expect(
    data.frames
      .filter((f) => f.kind === "hit" && f.counter)
      .every((f) => !f.charge),
  ).toBe(true);
  expect(data.observation.pendingMovedHexes).toBeUndefined();
  expect(game.view().observation.currentActorId).toBe("actor");
  const board = renderToStaticMarkup(
    <CharacterBoard
      view={hit.before}
      legal={[]}
      onHex={() => {}}
      animation={{ frame: hit, impact: true, serial: 1 }}
    />,
  );
  expect(board).toContain("突撃");
  expect(board).toContain("hx-charging");
});

it("視野外のCPU回復を内部処理し、演出・記録・回復対象IDを公開しない", () => {
  const game = specialtySession("medic", 7),
    snapshot = game.snapshot();
  const own = snapshot.battle.participants.filter((p) => p.owner === "player");
  own[0].coord = { q: -4, r: 1 };
  own[1].coord = { q: -5, r: 0 };
  const cpu = snapshot.battle.participants.filter((p) => p.owner === "cpu");
  const healer = cpu.find((p) => p.character.classId === "medic");
  expect(healer).toBeDefined();
  const target = cpu.find((p) => p !== healer)!;
  healer!.coord = { q: 3, r: -1 };
  target.coord = { q: 3, r: 0 };
  target.hp = 1;
  for (const [i, p] of cpu
    .filter((p) => p !== healer && p !== target)
    .entries())
    p.coord = { q: 4, r: i - 3 };
  snapshot.battle = advanceSpecialty(
    snapshot.battle,
    healer!.character.characterId,
  );
  const resumed = CharacterSession.restore(snapshot);
  const result = resumed.cpu();
  expect(resumed.snapshot().battle.events.some((e) => e.type === "heal")).toBe(
    true,
  );
  expect(result.frames.some((f) => f.kind === "heal")).toBe(false);
  expect(result.chronicle.join(" ")).not.toContain("回復");
  expect(JSON.stringify(result.observation)).not.toContain(
    healer!.character.characterId,
  );
  expect(JSON.stringify(result.observation)).not.toContain(
    target.character.characterId,
  );
});

it("味方への回復タップは詳細表示に奪われず、通常攻撃と共通の合法手ルーティングへ渡る", () => {
  const game = specialtySession("medic"),
    v = game.view();
  const ally = v.observation.participants.find(
    (p) => p.character.characterId === "ally",
  )!;
  expect(directActionAt(v.observation, v.legal, ally.coord)?.effect).toBe(
    "heal",
  );
  expect(directActionAt(v.observation, v.legal, v.observation.headquarters.cpu.coord)).toBeUndefined();
  expect(directActionAt(v.observation, [], ally.coord)).toBeUndefined();
  expect(
    directActionAt(
      v.observation,
      v.legal,
      v.observation.participants.find(
        (p) => p.character.characterId === "actor",
      )!.coord,
    ),
  ).toBeUndefined();
});
