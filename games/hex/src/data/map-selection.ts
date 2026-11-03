import definitions from "../../data/map-sizes.json";
import maps from "./maps.catalog.json";

export type MapSizeId = "small" | "medium" | "large";
export const mapSizes = definitions.sizes as {
  id: MapSizeId;
  label: string;
  radius: number;
  hexCount: number;
}[];
export const defaultMapSize = definitions.defaultSize as MapSizeId;
export const mapTypes = maps
  .filter((m) => m.size === defaultMapSize)
  .map((m) => ({ id: m.typeId, name: m.name }));

/** Only public metadata is used to resolve the engine's concrete map ID. */
export function selectMap(typeId: string, size: MapSizeId = defaultMapSize) {
  const map = maps.find((m) => m.typeId === typeId && m.size === size);
  if (!map) throw Error("未定義のマップ種類・サイズです。");
  return map;
}
