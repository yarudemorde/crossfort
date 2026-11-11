import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { specialtySession } from "../class-session-helpers";
import { advanceSpecialty } from "../new-class-helpers";
import { CharacterSession } from "../../src/character/session";
import {
  discardBattle,
  persistBattle,
  readBattle,
  updateSave,
} from "../../src/character/storage";
import type {
  CharacterRequest,
  CharacterResponse,
} from "../../src/character/character.worker";

it("実Workerで第三者への反撃・死亡・保存復帰を同期させる", async () => {
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
  const send = (request: CharacterRequest) =>
    new Promise<CharacterResponse>((resolve) => {
      deliver = resolve;
      scope.onmessage!({ data: request } as MessageEvent<CharacterRequest>);
    });
  const snapshot = specialtySession("archer").snapshot(),
    b = snapshot.battle;
  const own = b.participants.filter((p) => p.owner === "player"),
    cpu = b.participants.filter((p) => p.owner === "cpu"),
    defender = cpu.find((p) => p.character.classId === "spearman")!;
  own[0].coord = { q: 2, r: 0 };
  own[1].coord = { q: 1, r: 0 };
  own[1].hp = 1;
  defender.coord = { q: 0, r: 0 };
  cpu
    .filter((p) => p !== defender)
    .forEach((p, i) => (p.coord = { q: 4, r: i - 3 }));
  snapshot.battle = advanceSpecialty(b, "actor");
  await discardBattle();
  await updateSave(0, (s) => ({ ...s, roster: snapshot.config.team }));
  await persistBattle(snapshot);
  const before = await send({ type: "resume", session: 77 });
  expect(before.error).toBeUndefined();
  const r = await send({
    type: "act",
    action: {
      type: "act",
      actorId: "actor",
      path: [],
      targetId: defender.character.characterId,
    },
    session: 77,
  });
  expect(r.error).toBeUndefined();
  expect(r.frames?.find((f) => f.kind === "hit" && f.counter)?.targetId).toBe(
    "ally",
  );
  expect(r.frames?.find((f) => f.kind === "destroy")?.targetId).toBe("ally");
  const saved = (await readBattle())!;
  expect(
    saved.battle.participants.find((p) => p.character.characterId === "ally"),
  ).toMatchObject({ hp: 0, alive: false });
  expect(
    saved.battle.participants.find((p) => p.character.characterId === "actor")
      ?.hp,
  ).toBe(22);
  expect(
    saved.battle.participants.find(
      (p) => p.character.characterId === defender.character.characterId,
    )?.killsThisBattle,
  ).toBe(1);
  expect(CharacterSession.restore(saved).view().observation).toEqual(
    r.observation,
  );
  expect((await send({ type: "resume", session: 77 })).observation).toEqual(
    r.observation,
  );
});
