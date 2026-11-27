# Connected defense wall

`kingdom/` contains the three RGBA PNG lane sprites (448 × 148): intact,
cracked and breached. Transparent areas reveal the existing battlefield.
All three use the same baseline, stone courses and perspective. Their 16 px
side strips share the intact texture; the right strip mirrors the left so
all nine state adjacencies have identical seam pixels. The collapsed center
opens to the background with rubble along the footing.

`DEFENSE_LINE_ART` in `index.html` is the single artwork reference for both
sides. A later regional asset set can change its `basePath` and `states`;
this change adds no skin UI, persistence or gameplay state.

The five `.defenseSlot` elements keep the unit grid's track sizes and gutters.
Only their non-interactive images extend halfway across a gutter. The first
and last images stop at the row's outer edges. This removes visual gaps while
retaining every lane's rectangle and the `showDefenseShield` effect anchors.
The frame and cell fill are removed only for defense slots. Background,
landmarks, unit slots, HUD, hand and game rules retain their existing code.

## Validation (2026-11-27)

- `node tests/defense-line-regression.cjs`: 88 assertions, including combat,
  both sides, lane independence, state restoration and sprite dimensions.
- `npm run build:network` and `npm run test:network`: 24 tests passed.
- `node --test tests/battle-hud.test.cjs`: 4 tests passed.
- Browser preview: 320, 360, 375, 390, 430, 768, 1363 and 1920 px widths in
  auto/mobile/pc/full view modes: 32 cases and 1,824 layout checks passed.
  Verified loaded sprites, mixed states, gutter joins, matching unit-lane
  rectangles, zero frames, row bounds and no horizontal overflow.
- Pixel checks: all 1,332 edge comparisons across nine state pairings passed.
- Actual card click: the attack cracks only enemy lane 3 and leaves LIFE at
  20 when its intact wall blocks the hit.
- Spell target selection: the existing enemy lane highlight appears, selecting
  its unit resolves the spell and reduces power from 2 to 1 without changing
  any defense state.

The existing defense regression expected the obsolete log word `突破された`;
it now checks the game's current `崩壊した` wording. The unrelated landmark
regression fails with `TypeError: resume is not a function` both on the
original commit and this change; its harness and gameplay code are unchanged.

## Artwork generation and processing

Created with the built-in image generator from the supplied wall reference.
Common brief: production transparent pixel-art sprite for CROSSFORT; dark
fantasy blue-gray masonry, restrained warm highlights, frontal perspective,
continuous horizontal stone courses and footing; no towers, frame, ground,
text or background. Left/right connections and baseline must remain fixed.

Prompt set:

1. Intact: one undamaged modular crenellated wall strip, evenly spaced square
   merlons, identical straight-cut edge courses, transparent outside the wall.
2. Damaged (edit intact): change only the central 40%; introduce a deep diagonal
   crack and chipped stones, retain almost all standing masonry; preserve
   scale, coordinates, colors, baseline and the left/right 25% unchanged.
3. Collapsed (edit intact): collapse the central 60% into a broad U-shaped
   opening, stepped jagged shoulders and low rubble; preserve the outer 20%
   and original baseline, with transparent alpha in the opening.

Production processing: a common crop at (320, 388), 896 × 296; crisp alpha
threshold at 200 to remove the generated outer glow; nearest-neighbor downsize
to 448 × 148; normalize the shared 16 px side strips after resizing. All
three PNGs remain true RGBA. Original legacy wall sprites remain available
at their previous paths for compatibility but are not used by this renderer.
