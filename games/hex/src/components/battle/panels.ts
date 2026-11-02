/** UI-only state. Selection and game actions remain owned by App. */
export type DrawerStage = 0 | 1;
export function swipeStage(stage: DrawerStage, deltaY: number): DrawerStage {
  return Math.abs(deltaY) < 32 ? stage : deltaY < 0 ? 1 : 0;
}
