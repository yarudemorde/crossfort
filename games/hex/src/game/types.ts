export type Owner = "player" | "cpu";
export type Terrain =
  "plain" | "forest" | "mountain" | "swamp" | "desert" | "river";
export type Coord = { q: number; r: number };
export type Effect = {
  effectId: "heal" | "directDamage" | "reveal" | "temporaryPowerBonus";
  amount?: number;
  radius?: number;
  target: string;
  duration?: string;
};
export type CardDefinition = {
  id: string;
  name: string;
  type: "unit" | "landmark" | "spell";
  cost: number;
  resource: number;
  vision?: number;
  power?: number;
  range?: number;
  movement?: number;
  territory?: number;
  effects?: Effect[];
};
export type MapDefinition = {
  id: string;
  name: string;
  radius: number;
  headquarters: Record<Owner, Coord>;
  hexes: (Coord & { terrain: Terrain })[];
};
export type Piece = {
  instanceId: string;
  definitionId: string;
  owner: Owner;
  kind: "unit" | "landmark" | "headquarters";
  coord: Coord;
  basePower: number;
  accumulatedDamage: number;
  summonedOnOwnTurn: number;
  actedThisTurn: boolean;
  placementOrder: number;
  temporaryBonus: number;
};
export type PlayerState = {
  deck: string[];
  hand: string[];
  resourceCards: string[];
  playedCards: string[];
  resourceTotal: number;
  resourceRemaining: number;
  exchangedThisTurn: boolean;
  exploredHexIds: string[];
  ownTurnNumber: number;
};
export type GameEvent = {
  id: number;
  type: string;
  text: string;
  audience: Owner[];
  coord?: Coord;
  pieceId?: string;
};
export type Action =
  | { type: "endTurn" }
  | { type: "exchange"; cardId: string }
  | { type: "play"; cardId: string; coord?: Coord; targetId?: string }
  | { type: "act"; pieceId: string; path: Coord[]; targetId?: string };
export type Outcome = { winner: Owner; reason: "headquartersDestroyed" };
export type GameConfig = {
  cards: Record<string, CardDefinition>;
  maps: Record<string, MapDefinition>;
  rules: typeof import("../../data/ruleset.prototype.json");
};
export type DecisionConfig = Pick<GameConfig, "cards" | "rules">;
export type GameState = {
  version: string;
  seed: number;
  rngState: number;
  mapId: string;
  config: GameConfig;
  activePlayer: Owner;
  phase: "main" | "finished";
  players: Record<Owner, PlayerState>;
  pieces: Piece[];
  territoryOwner: Record<string, Owner | null>;
  outcome?: Outcome;
  nextInstanceNumber: number;
  nextPlacementOrder: number;
  actionLog: GameEvent[];
  commands: { owner: Owner; action: Action }[];
};
export type ObservedPiece = Piece & {
  power: number;
  vision: number;
  range: number;
  movement: number;
  territory: number;
};
export type Observation = {
  version: string;
  seed: number;
  mapId: string;
  mapName: string;
  radius: number;
  headquarters: Record<Owner, Coord>;
  owner: Owner;
  activePlayer: Owner;
  phase: GameState["phase"];
  self: Omit<PlayerState, "deck"> & { deckCount: number };
  opponent: {
    ownTurnNumber: number;
    handCount: number;
    deckCount: number;
    resourceTotal: number;
    resourceRemaining: number;
  };
  hexes: (Coord & {
    terrain?: Terrain;
    visible: boolean;
    explored: boolean;
    territory?: Owner | null;
  })[];
  pieces: ObservedPiece[];
  outcome?: Outcome;
  events: GameEvent[];
};
export type ActionResult = {
  state: GameState;
  events: GameEvent[];
  error?: string;
};
