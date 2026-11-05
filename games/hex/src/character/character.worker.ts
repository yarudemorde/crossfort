import type { Coord } from "../game/types";
import { CharacterSession, type NewBattle } from "./session";
import type { BattleAction } from "./battle";

export type CharacterRequest = (
  | { type: "new"; config: NewBattle }
  | { type: "move"; actorId: string; path: Coord[] }
  | { type: "act"; action: BattleAction }
  | { type: "cpu" }
) & { session: number };
export type CharacterResponse = {
  session: number;
  error?: string;
} & Partial<ReturnType<CharacterSession["view"]>>;

let current: CharacterSession | undefined;
self.onmessage = (message: MessageEvent<CharacterRequest>) => {
  const request = message.data;
  try {
    if (request.type === "new") current = new CharacterSession(request.config);
    if (!current) throw Error("戦闘が開始されていません。");
    const data =
      request.type === "move"
        ? current.move(request.actorId, request.path)
        : request.type === "act"
          ? current.act(request.action)
          : request.type === "cpu"
            ? current.cpu()
            : current.view();
    self.postMessage({
      session: request.session,
      ...data,
    } satisfies CharacterResponse);
  } catch (error) {
    self.postMessage({
      session: request.session,
      error:
        error instanceof Error ? error.message : "戦闘処理に失敗しました。",
    } satisfies CharacterResponse);
  }
};
