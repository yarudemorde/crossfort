import { useEffect, useRef, useState, type SetStateAction } from "react";
import { reconcileFormationDraft, type FormationDraft } from "./formation";
import timing from "../../data/presentation.settings.json";
import {
  mapSizes,
  mapTypes,
  selectMap,
  type MapSizeId,
} from "../data/map-selection";
import { hexDistance, neighbors, sameHex } from "../game/rules/hex";
import type { Coord } from "../game/types";
import { damage, headquartersForRadius } from "../character/combat";
import { stats, validateFormation } from "../character/roster";
import { loadSave, updateSave } from "../character/storage";
import type { CharacterFrame } from "../character/presentation";
import type { BattleAction, BattleObservation } from "../character/battle";
import type { RosterSave } from "../character/types";
import type {
  CharacterRequest,
  CharacterResponse,
} from "../character/character.worker";
const seed = () => crypto.getRandomValues(new Uint32Array(1))[0];
export const newCharacterId = () =>
  crypto.randomUUID?.() ??
  Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) =>
    n.toString(16),
  ).join("");
const id = newCharacterId;
export type Screen =
  | "home"
  | "barracks"
  | "formation"
  | "deployment"
  | "battle"
  | "defeat"
  | "reward";
export function useCharacterGame() {
  const initialSeed = useRef(seed());
  const [save, setSave] = useState<RosterSave>();
  const [screen, setScreen] = useState<Screen>("home");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [animation, setAnimation] = useState<{
    frame: CharacterFrame;
    impact: boolean;
    serial: number;
  }>();
  const [chronicle, setChronicle] = useState<string[]>([]);
  const [formationDraft, setFormationDraft] = useState<FormationDraft>({
    formation: [],
    placements: {},
  });
  const { formation, placements, pick } = formationDraft;
  function setFormation(value: SetStateAction<string[]>) {
    setFormationDraft((draft) => ({
      ...draft,
      formation: typeof value === "function" ? value(draft.formation) : value,
    }));
  }
  function setPlacements(value: SetStateAction<Record<string, Coord>>) {
    setFormationDraft((draft) => ({
      ...draft,
      placements: typeof value === "function" ? value(draft.placements) : value,
    }));
  }
  function setPick(value: SetStateAction<string | undefined>) {
    setFormationDraft((draft) => ({
      ...draft,
      pick: typeof value === "function" ? value(draft.pick) : value,
    }));
  }
  function acceptSave(next: RosterSave) {
    setSave(next);
    setFormationDraft((draft) => reconcileFormationDraft(draft, next.roster));
  }
  const [mapType, setMapType] = useState(mapTypes[0].id);
  const [mapSize, setMapSize] = useState<MapSizeId>("medium");
  const mapId = selectMap(mapType, mapSize).id;
  const [battleSeed, setBattleSeed] = useState(seed);
  const [selection, setSelection] = useState<string>();
  const [preview, setPreview] =
    useState<Extract<BattleAction, { type: "act" }>>();
  const [movePreview, setMovePreview] = useState<{
    actorId: string;
    path: Coord[];
  }>();
  const [deploymentView, setDeploymentView] = useState<BattleObservation>();
  const [response, setResponse] = useState<CharacterResponse>();
  const worker = useRef<Worker | undefined>(undefined);
  const sid = useRef(0);
  const deploymentSerial = useRef(0);

  useEffect(() => {
    let live = true;
    loadSave(initialSeed.current)
      .then((s) => {
        if (live) {
          acceptSave(s);
          if (s.pendingReward) setScreen("reward");
        }
      })
      .catch((e) => setError(String(e)));
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    const w = new Worker(
      new URL("../character/character.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.current = w;
    let live = true;
    let serial = 0;
    w.onmessage = async (msg: MessageEvent<CharacterResponse>) => {
      const v = msg.data;
      if (!live || v.session !== sid.current) return;
      if (v.deployment) {
        if (v.deploymentSerial === deploymentSerial.current)
          setDeploymentView(v.deployment);
        return;
      }
      if (v.error) {
        setError(v.error);
        setBusy(false);
        return;
      }
      if (v.discarded) {
        setBusy(false);
        return;
      }
      if (v.save) acceptSave(v.save);
      const recovery =
        v.resumed && !v.observation && v.save?.deploymentRecovery;
      if (recovery && !v.save?.pendingReward) {
        const meta = mapTypes
          .flatMap((t) =>
            mapSizes.map((size) => ({
              ...selectMap(t.id, size.id),
              type: t.id,
              size: size.id,
            })),
          )
          .find((m) => m.id === recovery.mapId)!;
        setMapType(meta.type);
        setMapSize(meta.size);
        setBattleSeed(recovery.seed);
        setFormation(recovery.teamIds);
        setPlacements(recovery.placements);
        setScreen("deployment");
        setError(v.save?.migrationNotice ?? "戦闘前の配置を復元しました。");
      }
      if (v.resumed && v.config) {
        const meta = mapTypes
          .flatMap((t) =>
            mapSizes.map((size) => ({
              ...selectMap(t.id, size.id),
              type: t.id,
              size: size.id,
            })),
          )
          .find((m) => m.id === v.config!.mapId)!;
        setMapType(meta.type);
        setMapSize(meta.size);
        setBattleSeed(v.config.seed);
        setFormation(v.config.team.map((c) => c.characterId));
        setPlacements(v.config.placements);
        setScreen(
          v.observation?.outcome?.winner === "cpu" ? "defeat" : "battle",
        );
      }
      const reduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      const wait = (ms: number) =>
        new Promise<void>((resolve) =>
          window.setTimeout(resolve, reduced ? timing.reducedMotionMs : ms),
        );
      for (const frame of v.frames ?? []) {
        if (!live || v.session !== sid.current) return;
        setAnimation({ frame, impact: false, serial: ++serial });
        setResponse((previous) => ({
          ...previous,
          session: v.session,
          observation: frame.kind === "move" ? frame.after : frame.before,
          legal: [],
        }));
        if (frame.kind === "move")
          await wait(timing.movement.stepMs + timing.movement.pauseMs);
        else if (frame.kind === "hit") {
          await wait(
            timing.combat.windupMs +
              (frame.range === 2
                ? timing.combat.projectileMs
                : timing.combat.meleeMs),
          );
          if (!live || v.session !== sid.current) return;
          setAnimation({ frame, impact: true, serial });
          setResponse((previous) => ({
            ...previous,
            session: v.session,
            observation: frame.after,
            legal: [],
          }));
          const target =
            frame.before.participants.find(
              (p) => p.character.characterId === frame.targetId,
            )?.character.displayName ?? "本城";
          setChronicle((log) =>
            [
              ...log,
              `${frame.counter ? "反撃" : "攻撃"}：${target} −${frame.amount}`,
            ].slice(-40),
          );
          await wait(timing.combat.popupMs);
        } else await wait(timing.combat.deathMs);
      }
      if (!live || v.session !== sid.current) return;
      setAnimation(undefined);
      setChronicle(v.chronicle ?? []);
      setResponse(v);
      setSelection(
        v.observation?.activePlayer === "player"
          ? v.observation.currentActorId
          : undefined,
      );
      if (v.save?.pendingReward) setScreen("reward");
      else if (v.observation?.outcome?.winner === "cpu") setScreen("defeat");
      setBusy(false);
    };
    w.postMessage({
      type: "resume",
      initialSeed: initialSeed.current,
      session: sid.current,
    } satisfies CharacterRequest);
    w.onerror = () => {
      setError("戦闘処理でエラーが発生しました。");
      setBusy(false);
    };
    return () => {
      live = false;
      w.terminate();
      worker.current = undefined;
    };
  }, []);
  useEffect(() => {
    if (
      screen === "battle" &&
      response?.observation?.activePlayer === "cpu" &&
      !response.observation.outcome &&
      !busy
    ) {
      const timer = setTimeout(
        () => send({ type: "cpu", session: sid.current }),
        250,
      );
      return () => clearTimeout(timer);
    }
  }, [screen, response, busy]);
  useEffect(() => {
    if (screen !== "deployment" || !save || !worker.current) return;
    const team = formation.flatMap((id) => {
      const c = save.roster.find((c) => c.characterId === id);
      return c ? [c] : [];
    });
    if (deploymentView?.mapId !== mapId) setDeploymentView(undefined);
    deploymentSerial.current++;
    worker.current.postMessage({
      type: "deployment",
      deploymentSerial: deploymentSerial.current,
      mapId,
      team,
      placements,
      session: sid.current,
    } satisfies CharacterRequest);
  }, [screen, mapId, formation, placements, save]);
  function send(request: CharacterRequest) {
    setMovePreview(undefined);
    setPreview(undefined);
    setError("");
    setBusy(true);
    worker.current?.postMessage(request);
  }
  async function change(fn: (s: RosterSave) => RosterSave) {
    setBusy(true);
    try {
      const s = await updateSave(0, fn);
      acceptSave(s);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  function start() {
    if (!save) return;
    const invalid = validateFormation(formation, save.roster);
    if (invalid) {
      setError(invalid);
      return;
    }
    const team = formation.map((x) =>
      save.roster.find((c) => c.characterId === x)!,
    );
    const config = {
      id: id(),
      seed: battleSeed,
      mapId,
      team,
      placements,
    };
    sid.current++;
    setChronicle([]);
    setPreview(undefined);
    setResponse(undefined);
    setScreen("battle");
    send({ type: "new", config, session: sid.current });
  }
  function command(action: BattleAction) {
    setPreview(undefined);
    send({ type: "act", action, session: sid.current });
  }
  function hex(coord: Coord) {
    if (
      busy ||
      !response?.observation ||
      response.observation.activePlayer !== "player"
    )
      return;
    setPreview(undefined);
    const view = response.observation;
    const actions = response.legal ?? [];
    if (view.pendingActorId) {
      const target = view.participants.find(
        (p) => p.owner === "cpu" && sameHex(p.coord, coord),
      );
      const targetId =
        target?.character.characterId ??
        (sameHex(view.headquarters.cpu.coord, coord) ? "hq_cpu" : undefined);
      const hit = actions.find(
        (a) => a.type === "act" && a.targetId === targetId && !!targetId,
      );
      if (hit?.type === "act") setPreview(hit);
      return;
    }
    const directTarget =
      view.participants.find(
        (p) => p.owner === "cpu" && sameHex(p.coord, coord),
      )?.character.characterId ??
      (sameHex(view.headquarters.cpu.coord, coord) ? "hq_cpu" : undefined);
    const directHit = actions.find(
      (a) =>
        a.type === "act" &&
        a.actorId === selection &&
        !a.path.length &&
        a.targetId === directTarget &&
        !!directTarget,
    );
    if (directHit?.type === "act") {
      setMovePreview(undefined);
      setPreview(directHit);
      return;
    }
    const move = actions.find(
      (a) =>
        a.type === "act" &&
        a.actorId === selection &&
        !a.targetId &&
        a.path.length &&
        sameHex(a.path[a.path.length - 1], coord),
    );
    if (move?.type === "act") {
      setMovePreview({ actorId: move.actorId, path: move.path });
      return;
    }
    const piece = view.participants.find(
      (p) => p.owner === "player" && sameHex(p.coord, coord),
    );
    setMovePreview(undefined);
    if (piece?.character.characterId === view.currentActorId)
      setSelection(view.currentActorId);
  }
  function chooseSlot(coord: Coord, characterId = pick) {
    if (!characterId) {
      setPick(
        Object.keys(placements).find((id) => sameHex(placements[id], coord)),
      );
      return;
    }
    if (
      !formation.includes(characterId) ||
      !slots.some((c) => sameHex(c, coord))
    )
      return;
    setPlacements((p) => {
      const next = { ...p };
      const other = Object.keys(next).find((x) => sameHex(next[x], coord));
      const old = next[characterId];
      if (other && other !== characterId) {
        if (old) next[other] = old;
        else delete next[other];
      }
      next[characterId] = coord;
      return next;
    });
    setPick(undefined);
  }
  const mapInfo = selectMap(mapType, mapSize);
  const slots = neighbors(headquartersForRadius(mapInfo.radius).player);
  const chosen = formation.flatMap((id) => {
    const c = save?.roster.find((item) => item.characterId === id);
    return c ? [c] : [];
  });
  const cost = chosen.reduce((n, c) => n + stats(c).cost, 0);
  const pending = save?.pendingReward;
  const view = response?.observation;
  const attacking =
    preview &&
    view?.participants.find((p) => p.character.characterId === preview.actorId);
  const defending =
    preview &&
    view?.participants.find(
      (p) => p.character.characterId === preview.targetId,
    );
  const tile = (c: Coord) =>
    view?.hexes.find((h) => sameHex(h, c))?.terrain ?? "plain";
  const expectedHit = attacking
    ? damage(stats(attacking.character).attack, tile(attacking.coord))
    : 0;
  const expectedCounter =
    attacking &&
    defending &&
    defending.hp > expectedHit &&
    hexDistance(attacking.coord, defending.coord) <=
      stats(defending.character).range
      ? damage(
          stats(defending.character).attack,
          tile(defending.coord),
          true,
          stats(defending.character).counterTenths,
        )
      : 0;
  function goHome() {
    if (busy) return;
    if (screen === "battle" && !confirm("戦闘を中断して本陣に戻りますか？"))
      return;
    if (screen === "battle" || screen === "defeat") {
      sid.current++;
      send({ type: "discard", session: sid.current });
      setResponse(undefined);
    }
    setPreview(undefined);
    setMovePreview(undefined);
    setSelection(undefined);
    setScreen(pending ? "reward" : "home");
  }
  function toggleFormation(id: string) {
    const next = formation.includes(id)
      ? formation.filter((x) => x !== id)
      : [...formation, id];
    const error = validateFormation(next, save?.roster ?? []);
    if (next.length > 0 && error) {
      setError(error);
      return;
    }
    setError("");
    setFormation(next);
  }
  function prepareDeployment() {
    if (!save) return;
    const error = validateFormation(formation, save.roster);
    if (error) {
      setError(error);
      return;
    }
    setPlacements((p) =>
      Object.fromEntries(
        Object.entries(p).filter(([id]) => formation.includes(id)),
      ),
    );
    setPick(undefined);
    setScreen("deployment");
  }
  function reorder(id: string, delta: number) {
    setFormation((a) => {
      const x = [...a],
        i = x.indexOf(id),
        j = i + delta;
      if (i < 0 || j < 0 || j >= x.length) return a;
      [x[i], x[j]] = [x[j], x[i]];
      return x;
    });
  }
  function retry() {
    send({ type: "discard", session: sid.current });
    setScreen("deployment");
  }
  return {
    save,
    screen,
    setScreen,
    error,
    setError,
    busy,
    animation,
    chronicle,
    formation,
    placements,
    setPlacements,
    pick,
    setPick,
    mapType,
    setMapType,
    mapSize,
    setMapSize,
    mapInfo,
    mapId,
    battleSeed,
    setBattleSeed,
    selection,
    setSelection,
    preview,
    setPreview,
    movePreview,
    setMovePreview,
    response,
    deploymentView,
    slots,
    chosen,
    cost,
    pending,
    view,
    attacking,
    defending,
    expectedHit,
    expectedCounter,
    send,
    change,
    start,
    command,
    hex,
    chooseSlot,
    goHome,
    toggleFormation,
    prepareDeployment,
    reorder,
    retry,
    session: sid.current,
  };
}
export type CharacterGame = ReturnType<typeof useCharacterGame>;
