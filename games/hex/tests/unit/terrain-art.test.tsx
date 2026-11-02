import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TerrainTile } from "../../src/components/TerrainTile";
import { terrainArt } from "../../src/data/terrain-art";
import type { Terrain } from "../../src/game/types";
const terrains: Terrain[] = [
  "plain",
  "forest",
  "mountain",
  "swamp",
  "river",
  "desert",
];
describe("terrain artwork and fog privacy", () => {
  it.each(terrains)("%s uses its matching supplied artwork", (terrain) => {
    const html = renderToStaticMarkup(
      <svg>
        <TerrainTile terrain={terrain} explored />
      </svg>,
    );
    expect(html).toContain(`href="${terrainArt[terrain]}"`);
    expect(html).toContain(`data-terrain-art="${terrain}"`);
  });
  it.each(terrains)(
    "unexplored %s never exposes its actual artwork",
    (terrain) => {
      const html = renderToStaticMarkup(
        <svg>
          <TerrainTile terrain={terrain} explored={false} />
        </svg>,
      );
      expect(html).toContain(`href="${terrainArt.fog}"`);
      expect(html).not.toContain(`href="${terrainArt[terrain]}"`);
      expect(html).toContain('data-terrain-art="fog"');
    },
  );
  it("missing terrain falls back to fog instead of inventing visible ground", () => {
    expect(
      renderToStaticMarkup(
        <svg>
          <TerrainTile explored={false} />
        </svg>,
      ),
    ).toContain(`href="${terrainArt.fog}"`);
  });
});
