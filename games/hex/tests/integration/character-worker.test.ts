import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import type {
  CharacterRequest,
  CharacterResponse,
} from "../../src/character/character.worker";
import { loadSave, discardBattle } from "../../src/character/storage";
import { neighbors } from "../../src/game/rules/hex";
import { maps } from "../../src/game/data";
import { headquartersFor } from "../../src/character/combat";
import { chooseAction } from "../../src/character/cpu";
it("実Workerの通信で新規対戦・保存復帰・可視演出・勝利報酬まで完走", async () => {
  const save = await loadSave(1);
  await discardBattle();
  let deliver: (r: CharacterResponse) => void = () => {};
  const scope = {
    onmessage: undefined as
      undefined | ((e: MessageEvent<CharacterRequest>) => void),
    postMessage: (r: CharacterResponse) => deliver(r),
  };
  Object.defineProperty(globalThis, "self", {
    value: scope,
    configurable: true,
  });
  await import("../../src/character/character.worker");
  const send = (
    request: Omit<CharacterRequest, "session"> | CharacterRequest,
  ) =>
    new Promise<CharacterResponse>((resolve) => {
      deliver = resolve;
      scope.onmessage!({
        data: { ...request, session: 42 },
      } as MessageEvent<CharacterRequest>);
    });
  const map = maps.find((m) => m.id === "crossing-small")!,
    team = save.roster.filter((_, i) => [0, 1, 3, 4, 6, 7].includes(i)),
    slots = neighbors(headquartersFor(map).player);
  let r = await send({
    type: "new",
    config: {
      id: "worker-victory",
      seed: 1,
      mapId: map.id,
      first: "player",
      team,
      placements: Object.fromEntries(
        team.map((c, i) => [c.characterId, slots[i]]),
      ),
    },
    session: 42,
  });
  expect(r.error).toBeUndefined();
  const original = r.observation;
  r = await send({ type: "resume" });
  expect(r.observation).toEqual(original);
  let hits = 0,
    counters = 0;
  for (let i = 0; i < 800 && !r.observation?.outcome; i++) {
    if (r.observation!.activePlayer === "cpu") r = await send({ type: "cpu" });
    else {
      const a = chooseAction(r.observation!, 1 + i);
      if (a.type === "pass")
        r = await send({ type: "act", action: a, session: 42 });
      else {
        r = await send({
          type: "move",
          actorId: a.actorId,
          path: a.path,
          session: 42,
        });
        expect(r.error).toBeUndefined();
        r = await send({
          type: "act",
          action: chooseAction(r.observation!, 2 + i),
          session: 42,
        });
      }
    }
    expect(r.error).toBeUndefined();
    for (const f of r.frames ?? []) {
      for (const o of [f.before, f.after]) {
        expect(
          o.hexes.every((h) => h.explored || h.terrain === undefined),
        ).toBe(true);
        expect(
          o.participants.every(
            (p) =>
              p.owner === "player" ||
              o.hexes.some(
                (h) => h.visible && h.q === p.coord.q && h.r === p.coord.r,
              ),
          ),
        ).toBe(true);
      }
      if (f.kind === "hit") {
        hits++;
        if (f.counter) counters++;
        expect(f.target).toBeDefined();
        expect(f.amount).toBeGreaterThan(0);
      }
    }
  }
  expect(r.observation?.outcome?.winner).toBe("player");
  expect(r.save?.pendingReward?.id).toBe("worker-victory");
  expect((await loadSave(0)).pendingReward?.id).toBe("worker-victory");
  expect(hits).toBeGreaterThan(0);
  expect(counters).toBeGreaterThan(0);
  delete (globalThis as { self?: unknown }).self;
}, 30000);
