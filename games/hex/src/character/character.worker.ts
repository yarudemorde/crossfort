import { deploymentObservation } from "./deployment";
import type { Character } from "./types";
import type { BattleObservation } from "./battle";
import type { Coord } from "../game/types";
import { CharacterSession, type NewBattle } from "./session";
import type { BattleAction } from "./battle";
import type { CharacterFrame } from "./presentation";
import { discardBattle, persistBattle, readBattle } from "./storage";
import type { RosterSave } from "./types";
export type CharacterRequest = (
  | {
      type: "deployment";
      deploymentSerial: number;
      mapId: string;
      team: Character[];
      placements: Record<string, Coord>;
    }
  | { type: "new"; config: NewBattle }
  | { type: "move"; actorId: string; path: Coord[] }
  | { type: "act"; action: BattleAction }
  | { type: "cpu" }
  | { type: "resume" }
  | { type: "discard" }
) & { session: number };
export type CharacterResponse = {
  session: number;
  error?: string;
  frames?: CharacterFrame[];
  save?: RosterSave;
  resumed?: boolean;
  deployment?: BattleObservation;
  deploymentSerial?: number;
  discarded?: boolean;
} & Partial<ReturnType<CharacterSession["view"]>>;
let current: CharacterSession | undefined;
let queue = Promise.resolve();
self.onmessage = (message: MessageEvent<CharacterRequest>) => {
  const request = message.data;
  queue = queue.then(async () => {
    const before = current?.snapshot();
    try {
      if (request.type === "deployment") {
        self.postMessage({
          session: request.session,
          deploymentSerial: request.deploymentSerial,
          deployment: deploymentObservation(
            request.mapId,
            request.team,
            request.placements,
          ),
        } satisfies CharacterResponse);
        return;
      }
      if (request.type === "discard") {
        await discardBattle();
        current = undefined;
        self.postMessage({
          session: request.session,
          discarded: true,
        } satisfies CharacterResponse);
        return;
      }
      if (request.type === "resume") {
        const saved = await readBattle();
        current = saved ? CharacterSession.restore(saved) : undefined;
        self.postMessage({
          session: request.session,
          resumed: true,
          ...current?.view(),
        } satisfies CharacterResponse);
        return;
      }
      if (request.type === "new")
        current = new CharacterSession(request.config);
      if (!current) throw Error("戦闘が開始されていません。");
      const revision = current.snapshot().revision;
      const data =
        request.type === "move"
          ? current.move(request.actorId, request.path)
          : request.type === "act"
            ? current.act(request.action)
            : request.type === "cpu"
              ? current.cpu()
              : current.view();
      if (request.type !== "new") current.advanceRevision();
      const save = await persistBattle(
        current.snapshot(),
        request.type === "new" ? undefined : revision,
      );
      self.postMessage({
        session: request.session,
        ...data,
        save,
      } satisfies CharacterResponse);
    } catch (error) {
      current = before ? CharacterSession.restore(before) : undefined;
      self.postMessage({
        session: request.session,
        error:
          error instanceof Error ? error.message : "戦闘処理に失敗しました。",
      } satisfies CharacterResponse);
    }
  });
};
