import type {
  Action,
  Coord,
  DecisionConfig,
  Observation,
  ObservedPiece,
} from "../types";
import { hexDistance, hexId, neighbors, sameHex } from "../rules/hex";
import { calculateMovement } from "../rules/board";
export function movementPaths(
  o: Observation,
  p: ObservedPiece,
  config: DecisionConfig,
): Coord[][] {
  if (
    p.kind !== "unit" ||
    p.actedThisTurn ||
    p.summonedOnOwnTurn >= o.self.ownTurnNumber
  )
    return [];
  const terrain = o.hexes.find((h) => sameHex(h, p.coord))?.terrain ?? "plain";
  const max = calculateMovement(p.movement, terrain, config);
  const tiles = new Set(o.hexes.map(hexId));
  const seen = new Set([hexId(p.coord)]);
  const queue: { coord: Coord; path: Coord[] }[] = [
    { coord: p.coord, path: [] },
  ];
  const result: Coord[][] = [];
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i];
    if (node.path.length >= max) continue;
    for (const c of neighbors(node.coord)) {
      const id = hexId(c);
      if (
        !tiles.has(id) ||
        seen.has(id) ||
        o.pieces.some((x) => x.owner !== o.owner && sameHex(x.coord, c))
      )
        continue;
      seen.add(id);
      const path = [...node.path, c];
      queue.push({ coord: c, path });
      if (!o.pieces.some((x) => x.kind === "unit" && sameHex(x.coord, c)))
        result.push(path);
    }
  }
  return result;
}
export function getLegalActions(
  o: Observation,
  config: DecisionConfig,
): Action[] {
  if (o.phase === "finished" || o.activePlayer !== o.owner) return [];
  const result: Action[] = [{ type: "endTurn" }];
  if (!o.self.exchangedThisTurn)
    for (const cardId of o.self.hand) result.push({ type: "exchange", cardId });
  for (const cardId of o.self.hand) {
    const c = config.cards[cardId];
    if (c.cost > o.self.resourceRemaining) continue;
    if (c.type === "spell") {
      const e = c.effects![0];
      if (e.effectId === "reveal") {
        for (const h of o.hexes.filter((h) => h.visible))
          result.push({ type: "play", cardId, coord: { q: h.q, r: h.r } });
      } else
        for (const p of o.pieces) {
          const friendly = p.owner === o.owner;
          const valid =
            e.effectId === "directDamage"
              ? !friendly
              : e.effectId === "heal"
                ? friendly && p.accumulatedDamage > 0
                : friendly && p.kind === "unit";
          if (valid)
            result.push({ type: "play", cardId, targetId: p.instanceId });
        }
    } else
      for (const h of o.hexes.filter((h) => h.visible)) {
        const at = o.pieces.filter((p) => sameHex(p.coord, h));
        const own = o.pieces.filter((p) => p.owner === o.owner);
        const valid =
          c.type === "unit"
            ? !at.some((p) => p.kind === "unit" || p.owner !== o.owner) &&
              own.some(
                (p) => p.kind !== "unit" && hexDistance(p.coord, h) === 1,
              )
            : !at.some((p) => p.kind !== "unit" || p.owner !== o.owner) &&
              h.territory !== (o.owner === "player" ? "cpu" : "player") &&
              own.some(
                (p) => p.kind === "unit" && hexDistance(p.coord, h) === 1,
              );
        if (valid)
          result.push({ type: "play", cardId, coord: { q: h.q, r: h.r } });
      }
  }
  for (const p of o.pieces.filter(
    (p) =>
      p.owner === o.owner &&
      !p.actedThisTurn &&
      p.summonedOnOwnTurn < o.self.ownTurnNumber,
  )) {
    const paths = [[], ...movementPaths(o, p, config)];
    for (const path of paths) {
      const dest = path.at(-1) ?? p.coord;
      if (path.length)
        result.push({ type: "act", pieceId: p.instanceId, path });
      for (const target of o.pieces.filter((t) => t.owner !== o.owner)) {
        const d = hexDistance(dest, target.coord);
        if (d >= 1 && d <= p.range)
          result.push({
            type: "act",
            pieceId: p.instanceId,
            path,
            targetId: target.instanceId,
          });
      }
    }
  }
  return result;
}
