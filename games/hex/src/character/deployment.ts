import { maps } from "../game/data";
import rules from "../../data/ruleset.characters.json";
import { hexDistance, hexId } from "../game/rules/hex";
import { headquartersFor, validateDeployment } from "./combat";
import { stats, validateFormation } from "./roster";
import type { Coord } from "../game/types";
import type { Character } from "./types";
import type { BattleObservation } from "./battle";
/** Read-only UI projection. Enemy troops and unobserved terrain never cross the Worker boundary. */
export function deploymentObservation(
  mapId: string,
  team: Character[],
  placements: Record<string, Coord>,
): BattleObservation {
  const map = maps.find((m) => m.id === mapId);
  if (!map) throw Error("マップが見つかりません。");
  const invalid = validateFormation(
    team.map((c) => c.characterId),
    team,
  );
  if (invalid) throw Error(invalid);
  const homes = headquartersFor(map);
  const placed = team.filter((c) => placements[c.characterId]);
  if (placed.length) {
    const error = validateDeployment(
      map,
      homes.player,
      placed.map((c) => c.characterId),
      Object.fromEntries(
        placed.map((c) => [c.characterId, placements[c.characterId]]),
      ),
    );
    if (error) throw Error(error);
  }
  const participants = placed.map((character) => ({
    character: structuredClone(character),
    coord: { ...placements[character.characterId] },
    owner: "player" as const,
    hp: stats(character).hp,
    alive: true,
    killsThisBattle: 0,
  }));
  const sources = [
    { coord: homes.player, range: rules.headquarters.vision },
    ...participants.map((p) => ({
      coord: p.coord,
      range: stats(p.character).vision,
    })),
  ];
  const visible = new Set(
    map.hexes
      .filter((h) => sources.some((s) => hexDistance(h, s.coord) <= s.range))
      .map(hexId),
  );
  return {
    id: `deployment-${mapId}`,
    mapId,
    radius: map.radius,
    owner: "player",
    activePlayer: "player",
    roundNumber: 0,
    timeline: [],
    participants,
    headquarters: {
      player: { coord: homes.player, hp: rules.headquarters.hp },
      cpu: { coord: homes.cpu },
    },
    hexes: map.hexes.map((h) => ({
      q: h.q,
      r: h.r,
      visible: visible.has(hexId(h)),
      explored: visible.has(hexId(h)),
      ...(visible.has(hexId(h)) ? { terrain: h.terrain } : {}),
    })),
  };
}
