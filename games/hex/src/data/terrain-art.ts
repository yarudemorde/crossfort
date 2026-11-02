import plain from "../assets/terrain/plain.jpeg";
import forest from "../assets/terrain/forest.jpeg";
import mountain from "../assets/terrain/mountain.jpeg";
import swamp from "../assets/terrain/swamp.jpeg";
import river from "../assets/terrain/river.jpeg";
import desert from "../assets/terrain/desert.jpeg";
import fog from "../assets/terrain/fog.jpeg";
import type { Terrain } from "../game/types";
/** Public artwork only; this catalog does not contain the map's terrain layout. */
export const terrainArt: Record<Terrain | "fog", string> = {
  plain,
  forest,
  mountain,
  swamp,
  river,
  desert,
  fog,
};
