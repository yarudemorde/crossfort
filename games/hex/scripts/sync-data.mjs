import { readFile, writeFile } from "node:fs/promises";
const readData = async (name) =>
  JSON.parse(
    await readFile(new URL(`../data/${name}`, import.meta.url), "utf8"),
  );
const [source, additional, sizes] = await Promise.all([
  readData("maps.prototype.json"),
  readData("maps.additional.prototype.json"),
  readData("map-sizes.json"),
]);
// An explicit allowlist: never export hexes or terrain into the UI catalog.
const metadata = [...source.maps, ...additional.maps].map((map) => {
  const { id, name, radius, headquarters } = map;
  const size = sizes.sizes.find((s) => s.radius === radius);
  if (!size || map.hexes.length !== size.hexCount)
    throw Error(`不正なマップサイズ: ${id}`);
  return {
    id,
    typeId: map.typeId ?? id,
    size: size.id,
    name,
    radius,
    hexCount: size.hexCount,
    headquarters,
  };
});
for (const type of source.maps)
  for (const size of sizes.sizes)
    if (
      metadata.filter((m) => m.typeId === type.id && m.size === size.id)
        .length !== 1
    )
      throw Error(`マップの種類/サイズが不足または重複: ${type.id}/${size.id}`);
await writeFile(
  new URL("../src/data/maps.catalog.json", import.meta.url),
  JSON.stringify(metadata, null, 2) + "\n",
);
