import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { specialtySession } from "../class-session-helpers";
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

it("実Workerで回復と3マス突撃を保存・再開し、構造化演出と確定HPが一致", async () => {
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
  const send = (data: CharacterRequest) =>
    new Promise<CharacterResponse>((resolve) => {
      deliver = resolve;
      scope.onmessage!({ data } as MessageEvent<CharacterRequest>);
    });
  for (const cls of ["medic", "cavalry"] as const) {
    await discardBattle();
    const prepared = specialtySession(cls);
    await updateSave(0, (s) => ({
      ...s,
      roster: prepared.snapshot().config.team,
    }));
    await persistBattle(prepared.snapshot());
    let r = await send({ type: "resume", session: 42 });
    expect(r.error).toBeUndefined();
    expect(r.observation?.currentActorId).toBe("actor");
    if (cls === "cavalry") {
      r = await send({
        type: "move",
        actorId: "actor",
        path: [
          { q: -1, r: 0 },
          { q: 0, r: 0 },
          { q: 1, r: 0 },
        ],
        session: 42,
      });
      expect(r.error).toBeUndefined();
      expect(r.frames?.filter((f) => f.kind === "move")).toHaveLength(3);
      expect((await readBattle())?.battle.pendingMovedHexes).toBe(3);
      const before = r.observation;
      r = await send({ type: "resume", session: 42 });
      expect(r.observation).toEqual(before);
    }
    const action = r.legal!.find(
      (a) =>
        a.type === "act" &&
        a.targetId &&
        (cls === "medic" ? a.effect === "heal" : !a.targetId.startsWith("hq_")),
    )!;
    const targetBefore = r.observation!.participants.find(
      (p) =>
        action.type === "act" && p.character.characterId === action.targetId,
    )!;
    r = await send({ type: "act", action, session: 42 });
    expect(r.error).toBeUndefined();
    const frame = r.frames!.find(
      (f) => f.kind === (cls === "medic" ? "heal" : "hit"),
    )!;
    expect(frame.amount).toBe(cls === "medic" ? 10 : 18);
    const targetAfter = r.observation!.participants.find(
      (p) => p.character.characterId === frame.targetId,
    )!;
    expect(targetAfter.hp).toBe(targetBefore.hp + (cls === "medic" ? 10 : -18));
    if (cls === "cavalry") expect(frame.charge).toBe(true);
    expect((await readBattle())?.battle.pendingMovedHexes).toBeUndefined();
  }
});
