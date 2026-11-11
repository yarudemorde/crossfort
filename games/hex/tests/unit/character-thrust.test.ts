import { describe, expect, it } from "vitest";
import { thrustRay, resolveHitTarget } from "../../src/character/targeting";
import {
  resolveBoardCombat,
  counterDamage,
  attackDamage,
} from "../../src/character/combat";
import { stats } from "../../src/character/roster";
import { hexDistance } from "../../src/game/rules/hex";
import { soldier, thrustBattle } from "../thrust-helpers";
import { newCharacter } from "../new-class-helpers";
import {
  applyBattleAction,
  observation,
  legalActions,
} from "../../src/character/battle";
import { forecastAttack } from "../../src/character/forecast";
import { chooseAction } from "../../src/character/cpu";
import type { Coord } from "../../src/game/types";
const from = { q: 0, r: 0 };
const within2: Coord[] = [];
for (let q = -2; q <= 2; q++)
  for (let r = -2; r <= 2; r++)
    if (hexDistance(from, { q, r }) >= 1 && hexDistance(from, { q, r }) <= 2)
      within2.push({ q, r });

describe("槍兵の新基本値", () => {
  it("既存個体差と成長履歴をそのまま加算する", () => {
    const c = {
      ...newCharacter("spearman"),
      hpDelta: 2,
      attackDelta: 1,
      level: 2 as const,
      growthHistory: [{ hp: 4, attack: 2, initiative: 1, counterTenths: 1 }],
    };
    expect(stats(newCharacter("spearman"))).toMatchObject({
      attack: 9,
      counterTenths: 13,
    });
    expect(counterDamage(newCharacter("spearman"), "plain")).toBe(12);
    expect(stats(c)).toMatchObject({
      hp: 31,
      attack: 12,
      initiative: 10,
      counterTenths: 14,
    });
    expect(attackDamage(c, "desert")).toBe(11);
    expect(counterDamage(c, "forest")).toBe(18);
  });
});

describe("直突きの幾何判定", () => {
  it.each(within2)("射程2全18方向 $q,$r へ到達する", (to) => {
    const source = soldier("s", "spearman", from, "player"),
      target = soldier("target", "knight", to);
    const ray = thrustRay(from, to, 2);
    expect(ray).toContainEqual(to);
    expect(ray).not.toContainEqual(from);
    expect(
      resolveHitTarget(source, to, [source, target])?.character.characterId,
    ).toBe("target");
    if (hexDistance(from, to) === 2)
      expect(ray.filter((c) => hexDistance(c, from) === 1).length).toBe(
        [to.q, to.r, to.q + to.r].includes(0) ? 1 : 2,
      );
  });
  it("直線の手前敵が優先され、味方と死亡者は通過する", () => {
    const a = soldier("s", "spearman", from, "player"),
      front = soldier("front", "knight", { q: 1, r: 0 }),
      back = soldier("back", "archer", { q: 2, r: 0 });
    expect(thrustRay(from, back.coord, 2)).toEqual([
      { q: 1, r: 0 },
      { q: 2, r: 0 },
    ]);
    expect(
      resolveHitTarget(a, back.coord, [back, a, front])?.character.characterId,
    ).toBe("front");
    expect(
      resolveHitTarget(a, back.coord, [back, a, { ...front, owner: "player" }])
        ?.character.characterId,
    ).toBe("back");
    expect(
      resolveHitTarget(a, back.coord, [
        a,
        { ...front, hp: 0, alive: false },
        back,
      ])?.character.characterId,
    ).toBe("back");
    expect(resolveHitTarget(a, { q: 3, r: 0 }, [a, back])).toBeUndefined();
  });
  it("斜めの境界両側を含み、同距離は時計回り側。回転・移動・配列順で規則が変わらない", () => {
    const rotate = (c: Coord): Coord => ({ q: -c.r, r: c.q + c.r });
    let to = { q: 1, r: 1 },
      clockwise = { q: 0, r: 1 },
      other = { q: 1, r: 0 };
    for (let turn = 0; turn < 6; turn++) {
      for (const offset of [from, { q: 4, r: -3 }]) {
        const translate = (c: Coord) => ({
          q: c.q + offset.q,
          r: c.r + offset.r,
        });
        const a = soldier("s", "spearman", offset, "player"),
          x = soldier("clockwise", "knight", translate(clockwise)),
          y = soldier("other", "knight", translate(other)),
          target = soldier("back", "archer", translate(to));
        const board = [a, x, y, target];
        for (let i = 0; i < board.length; i++) {
          const permutation = [...board.slice(i), ...board.slice(0, i)];
          for (const order of [permutation, [...permutation].reverse()])
            expect(
              resolveHitTarget(a, target.coord, order)?.character.characterId,
            ).toBe("clockwise");
        }
      }
      to = rotate(to);
      clockwise = rotate(clockwise);
      other = rotate(other);
    }
  });
  it("弓兵は途中の敵も味方も無視し指定敵へ直接命中する", () => {
    const a = soldier("a", "archer", from, "player"),
      front = soldier("front", "knight", { q: 1, r: 0 }),
      target = soldier("target", "spearman", { q: 2, r: 0 });
    for (const owner of ["player", "cpu"] as const) {
      const result = resolveBoardCombat(
        a,
        target.coord,
        [a, { ...front, owner }, target],
        () => "plain",
      )!;
      expect(result.hitTargetId).toBe("target");
      expect(result.hit).toBe(9);
      expect(result.counter).toBe(12);
      expect(result.counterTargetId).toBe(owner === "player" ? "front" : "a");
      expect(
        result.participants.find((p) => p.character.characterId === "target")
          ?.hp,
      ).toBe(16);
    }
    expect(stats(a.character).counterTenths).toBe(5);
  });
});

describe("確定処理・予測・CPUが同じ対象を扱う", () => {
  it.each([true, false])("本城を指定した方向の兵士遮蔽=%sを予測と確定で一致させる", (blocked) => {
    const b = thrustBattle();
    b.headquarters.cpu.coord = { q: 2, r: 0 };
    b.participants = b.participants.filter(
      (p) => p.owner === "player" || (blocked && p.character.characterId === "enemy"),
    );
    const action = {
      type: "act" as const,
      actorId: "actor",
      path: [],
      targetId: "hq_cpu",
    };
    const expected = forecastAttack(observation(b, "player"), action)!;
    expect(expected.hitTargetId).toBe(blocked ? "enemy" : "hq_cpu");
    const after = applyBattleAction(b, action, "player");
    expect(after.headquarters.cpu.hp).toBe(blocked ? 60 : 51);
    expect(after.events.filter((e) => e.type === "attack").at(-1)?.targetId)
      .toBe(expected.hitTargetId);
  });
  it("遠い指定敵ではなく手前の敵へ9ダメージ、実対象が反撃する", () => {
    const b = thrustBattle();
    const action = {
      type: "act" as const,
      actorId: "actor",
      path: [],
      targetId: "other-enemy",
    };
    const expected = forecastAttack(observation(b, "player"), action)!;
    expect(expected).toMatchObject({
      requestedTargetId: "other-enemy",
      hitTargetId: "enemy",
      hit: 9,
      counter: 12,
      counterTargetId: "actor",
      attackerHpAfter: 13,
      hitTargetHpAfter: 21,
      uncertain: false,
    });
    const after = applyBattleAction(b, action, "player");
    expect(
      after.participants.find((p) => p.character.characterId === "enemy")?.hp,
    ).toBe(21);
    expect(
      after.participants.find((p) => p.character.characterId === "other-enemy")
        ?.hp,
    ).toBe(25);
    expect(
      after.events
        .slice(-2)
        .map((e) => [e.type, e.actorId, e.targetId, e.amount]),
    ).toEqual([
      ["attack", "actor", "enemy", 9],
      ["counter", "enemy", "actor", 12],
    ]);
  });
  it.each([30, 1])("槍兵の反撃が元の攻撃者と別の兵士HP%dに命中する", (hp) => {
    const b = thrustBattle(true);
    b.participants.find((p) => p.character.characterId === "ally")!.hp = hp;
    const action = {
      type: "act" as const,
      actorId: "actor",
      path: [],
      targetId: "enemy",
    };
    const expected = forecastAttack(observation(b, "player"), action)!;
    expect(expected).toMatchObject({
      hitTargetId: "enemy",
      hit: 9,
      counter: 12,
      counterTargetId: "ally",
      attackerHpAfter: 22,
      counterTargetHpAfter: Math.max(0, hp - 12),
    });
    const after = applyBattleAction(b, action, "player");
    expect(
      after.participants.find((p) => p.character.characterId === "actor")?.hp,
    ).toBe(22);
    expect(
      after.participants.find((p) => p.character.characterId === "ally")?.hp,
    ).toBe(Math.max(0, hp - 12));
    expect(
      after.participants.find((p) => p.character.characterId === "enemy"),
    ).toMatchObject({ hp: 16, killsThisBattle: hp === 1 ? 1 : 0 });
    expect(
      after.events.slice(-2).map((e) => [e.type, e.targetId, e.amount]),
    ).toEqual([
      ["attack", "enemy", 9],
      ["counter", "ally", 12],
    ]);
    expect(after.outcome).toBeUndefined(); // Original attacker survives even if its ally falls.
    if (hp === 1) expect(after.currentActorId).not.toBe("ally");
  });
  it("CPUも実命中先・反撃先を観測だけで評価し、合法手を返す", () => {
    const b = thrustBattle(true);
    const o = observation(b, "player");
    const action = chooseAction(o, 77);
    expect(legalActions(o)).toContainEqual(action);
    const forecast = forecastAttack(o, action);
    if (action.type === "act" && action.targetId) {
      const after = applyBattleAction(b, action, "player");
      expect(
        after.events.filter((e) => e.type === "attack").at(-1)?.targetId,
      ).toBe(forecast?.hitTargetId);
    }
  });
});

it("弓兵の反撃は途中の敵を無視して元の攻撃者へ×0.5で返す", () => {
  const a = soldier("s", "spearman", { q: 0, r: 0 }, "player"),
    front = soldier("ally", "knight", { q: 1, r: 0 }, "player"),
    archer = soldier("archer", "archer", { q: 2, r: 0 });
  const r = resolveBoardCombat(
    a,
    archer.coord,
    [a, front, archer],
    () => "plain",
  )!;
  expect(r.hitTargetId).toBe("archer");
  expect(r.hit).toBe(9);
  expect(r.counter).toBe(5);
  expect(r.counterTargetId).toBe("s");
  expect(
    r.participants.find((p) => p.character.characterId === "ally")?.hp,
  ).toBe(30);
  expect(r.participants.find((p) => p.character.characterId === "s")?.hp).toBe(
    20,
  );
});
