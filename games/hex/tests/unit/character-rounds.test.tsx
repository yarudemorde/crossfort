import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { advanceTo, roundBattle } from "../character-helpers";
import {
  beginMovement,
  applyBattleAction,
  observation,
  legalActions,
} from "../../src/character/battle";
import { stats, createInitialRoster } from "../../src/character/roster";
import { roundOrder } from "../../src/character/rounds";
import { TurnTimeline } from "../../src/components/tactics/TurnTimeline";
import { damage, resolveCombat } from "../../src/character/combat";
import { CharacterSession } from "../../src/character/session";
import { chooseAction } from "../../src/character/cpu";
import type { Participant } from "../../src/character/types";

describe("機動順ラウンド", () => {
  it("機動降順で、各生存者は1回ずつ行動し次ラウンドに移る", () => {
    let s = roundBattle();
    const original = s.turnOrder.slice(),
      values = original.map(
        (id) =>
          stats(
            s.participants.find((p) => p.character.characterId === id)!
              .character,
          ).initiative,
      );
    expect(values).toEqual(values.slice().sort((a, b) => b - a));
    const acted: string[] = [];
    const owners: string[] = [];
    for (let i = 0; i < 12; i++) {
      acted.push(s.currentActorId);
      owners.push(s.activePlayer);
      const legal = legalActions(observation(s, s.activePlayer));
      expect(
        legal
          .filter((a) => a.type === "act")
          .every((a) => a.type === "act" && a.actorId === s.currentActorId),
      ).toBe(true);
      s = applyBattleAction(s, { type: "pass" }, s.activePlayer);
    }
    expect(acted).toEqual(original);
    expect(new Set(acted).size).toBe(12);
    expect(s.roundNumber).toBe(2);
    expect(s.actedIds).toEqual([]);
    expect(s.turnOrder).toEqual(roundOrder(s.participants, s.seed, 2));
    expect(owners.some((o, i) => i > 0 && owners[i - 1] === o)).toBe(true);
  });
  it("同値優先は陣営固定ではなく、seed/round/IDから再現し、隠れた人数で自軍内の順を変えない", () => {
    const s = roundBattle(),
      same = s.participants
        .filter((p) => p.character.classId === "scout")
        .slice(0, 1)
        .concat(
          s.participants
            .filter((p) => p.owner === "cpu" && p.character.classId === "scout")
            .slice(0, 1),
        );
    let ownFirst = 0;
    for (let seed = 0; seed < 500; seed++) {
      const a = roundOrder(same, seed, 1);
      expect(roundOrder(same, seed, 1)).toEqual(a);
      if (a[0] === same[0].character.characterId) ownFirst++;
    }
    expect(ownFirst).toBeGreaterThan(150);
    expect(ownFirst).toBeLessThan(350);
    const scouts = s.participants.filter(
      (p) => p.character.classId === "scout",
    );
    let groupFirst = 0;
    for (let seed = 0; seed < 500; seed++)
      if (
        scouts.find(
          (p) => p.character.characterId === roundOrder(scouts, seed, 1)[0],
        )!.owner === "player"
      )
        groupFirst++;
    expect(groupFirst).toBeGreaterThan(150);
    expect(groupFirst).toBeLessThan(350);
    const own = s.participants.filter((p) => p.owner === "player");
    expect(
      roundOrder(s.participants, s.seed, 1).filter((id) =>
        own.some((p) => p.character.characterId === id),
      ),
    ).toEqual(roundOrder(own, s.seed, 1));
  });
  it("行動権のない兵士は移動も攻撃もできず、移動の確定だけでは順番を進めない", () => {
    let s = roundBattle();
    const scout = s.participants.find(
      (p) => p.owner === "player" && p.character.classId === "scout",
    )!;
    s = advanceTo(s, scout.character.characterId);
    const other = s.participants.find(
      (p) =>
        p.owner === "player" && p.character.characterId !== s.currentActorId,
    )!;
    expect(() =>
      beginMovement(s, "player", other.character.characterId, []),
    ).toThrow();
    expect(() =>
      applyBattleAction(
        s,
        { type: "act", actorId: other.character.characterId, path: [] },
        "player",
      ),
    ).toThrow();
    const action = legalActions(observation(s, "player")).find(
      (a) => a.type === "act" && a.path.length && !a.targetId,
    )!;
    if (action.type !== "act") throw Error("fixture");
    const moved = beginMovement(s, "player", action.actorId, action.path);
    expect(moved.currentActorId).toBe(s.currentActorId);
    expect(moved.turnIndex).toBe(s.turnIndex);
    expect(moved.pendingActorId).toBe(s.currentActorId);
    expect(moved.actedIds).toEqual(s.actedIds);
    expect(
      legalActions(observation(moved, "player"))
        .filter((a) => a.type === "act")
        .every((a) => a.type === "act" && !a.path.length),
    ).toBe(true);
    const ended = applyBattleAction(moved, { type: "pass" }, "player");
    expect(ended.currentActorId).not.toBe(s.currentActorId);
    expect(ended.actedIds).toContain(s.currentActorId);
  });
  it("攻撃で戦死した未行動兵をスキップし、反撃は行動権を消費しない", () => {
    let s = roundBattle();
    const own = s.participants.find(
        (p) => p.owner === "player" && p.character.classId === "scout",
      )!,
      enemy = s.participants.find(
        (p) => p.owner === "cpu" && p.character.classId === "knight",
      )!;
    s = advanceTo(s, own.character.characterId);
    const a = s.participants.find(
        (p) => p.character.characterId === own.character.characterId,
      )!,
      d = s.participants.find(
        (p) => p.character.characterId === enemy.character.characterId,
      )!;
    a.coord = { q: 0, r: 0 };
    d.coord = { q: 1, r: 0 };
    d.hp = 1;
    const next = applyBattleAction(
      s,
      {
        type: "act",
        actorId: a.character.characterId,
        path: [],
        targetId: d.character.characterId,
      },
      "player",
    );
    expect(
      next.participants.find(
        (p) => p.character.characterId === d.character.characterId,
      )?.alive,
    ).toBe(false);
    expect(next.actedIds).not.toContain(d.character.characterId);
    let t = next;
    while (t.roundNumber === s.roundNumber) {
      expect(t.currentActorId).not.toBe(d.character.characterId);
      t = applyBattleAction(t, { type: "pass" }, t.activePlayer);
    }
    expect(t.turnOrder).not.toContain(d.character.characterId);
  });
  it("Workerへ返す観測・タイムラインに非公開の敵ID・機動・絶対順・人数枠を含めない", () => {
    const s = roundBattle();
    const hidden = s.participants.filter((p) => p.owner === "cpu");
    const o = observation(s, "player");
    expect(o).not.toHaveProperty("turnOrder");
    expect(o).not.toHaveProperty("turnIndex");
    expect(o).not.toHaveProperty("actionNumber");
    expect(o).not.toHaveProperty("actedIds");
    expect(JSON.stringify(o)).not.toContain("initiativeKey");
    const html = renderToStaticMarkup(
      <TurnTimeline view={o} onInspect={() => {}} />,
    );
    for (const p of hidden) {
      expect(JSON.stringify(o)).not.toContain(p.character.characterId);
      expect(html).not.toContain(p.character.characterId);
    }
    expect(o.timeline).toHaveLength(6);
    expect(html.match(/<button/g) ?? []).toHaveLength(6);
    const changed = structuredClone(s);
    for (const p of changed.participants.filter((p) => p.owner === "cpu")) {
      p.character.displayName = "極秘";
      p.character.attackDelta = 1;
    }
    expect(observation(changed, "player")).toEqual(o);
  });
  it("現在・行動済みを公開し、CPUは現在の1体だけで合法手を選ぶ", () => {
    let s = roundBattle();
    s = applyBattleAction(s, { type: "pass" }, s.activePlayer);
    while (!observation(s, s.activePlayer).timeline.some((t) => t.acted))
      s = applyBattleAction(s, { type: "pass" }, s.activePlayer);
    const o = observation(s, s.activePlayer);
    const a = chooseAction(o, 1);
    expect(legalActions(o)).toContainEqual(a);
    if (a.type === "act") expect(a.actorId).toBe(s.currentActorId);
    const h = renderToStaticMarkup(
      <TurnTimeline view={o} onInspect={() => {}} />,
    );
    expect(h).toContain('aria-current="step"');
    expect(h).toContain("行動済み");
  });
  it("途中移動後の行動位置・順序を再読み込みで保持し、改変された行動順を拒否する", () => {
    const mapId = "crossing-large",
      team = createInitialRoster(1).roster.slice(6, 7),
      mapState = roundBattle(mapId);
    const home = mapState.headquarters.player.coord;
    const game = new CharacterSession({
      id: "round-resume",
      seed: 2,
      mapId,
      first: "player",
      team,
      placements: { [team[0].characterId]: { q: home.q + 1, r: home.r } },
    });
    while (game.view().observation.activePlayer === "cpu") game.cpu();
    game.move(game.view().observation.currentActorId!, []);
    const snap = game.snapshot();
    expect(CharacterSession.restore(snap).snapshot()).toEqual(snap);
    const bad = structuredClone(snap);
    bad.battle.turnOrder.reverse();
    expect(() => CharacterSession.restore(bad)).toThrow();
  });
});
describe("新基礎値と反撃倍率", () => {
  it.each([
    ["knight", 30, 12, 10, 10, 1, 2, 1, 2],
    ["archer", 22, 9, 12, 5, 1, 2, 2, 2],
    ["scout", 18, 6, 16, 20, 2, 3, 1, 1],
  ] as const)(
    "%s の基礎値",
    (
      classId,
      hp,
      attack,
      initiative,
      counterTenths,
      movement,
      vision,
      range,
      cost,
    ) => {
      const c = {
        ...createInitialRoster(1).roster[0],
        classId,
        hpDelta: 0,
        attackDelta: 0,
      };
      expect(stats(c)).toMatchObject({
        hp,
        attack,
        initiative,
        counterTenths,
        movement,
        vision,
        range,
        cost,
      });
    },
  );
  it("倍率→切上→地形の順序で反撃し、通常攻撃には倍率を掛けない", () => {
    expect(damage(12, "plain", true, 10)).toBe(12);
    expect(damage(9, "plain", true, 5)).toBe(5);
    expect(damage(6, "plain", true, 20)).toBe(12);
    expect(damage(9, "desert", true, 5)).toBe(4);
    expect(damage(9, "forest", true, 5)).toBe(6);
    expect(damage(1, "desert", true, 11)).toBe(2);
    expect(damage(6, "mountain", true, 21)).toBe(14);
    expect(damage(6, "plain", false, 20)).toBe(6);
    expect(damage(0, "forest", true, 20)).toBe(0);
  });
  it("受傷で攻撃が下がらず、生存・射程条件のみで一度反撃する", () => {
    const base = createInitialRoster(1).roster[0];
    const a: Participant = {
      character: { ...base, hpDelta: 0, attackDelta: 0 },
      owner: "player",
      coord: { q: 0, r: 0 },
      hp: 30,
      alive: true,
      killsThisBattle: 0,
    };
    const d: Participant = {
      ...a,
      character: {
        ...base,
        characterId: "defender",
        classId: "archer",
        hpDelta: 0,
        attackDelta: 0,
      },
      owner: "cpu",
      coord: { q: 1, r: 0 },
      hp: 22,
    };
    const r = resolveCombat(a, d, "plain", "plain");
    expect([r.hit, r.counter, r.attacker.hp, r.defender.hp]).toEqual([
      12, 5, 25, 10,
    ]);
    expect(stats(r.defender.character).attack).toBe(9);
    expect(resolveCombat(a, { ...d, hp: 12 }, "plain", "plain").counter).toBe(
      0,
    );
  });
});
