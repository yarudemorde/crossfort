export type DrawerStage = 0 | 1 | 2;
export type DetailPanel = "resources" | "selection" | "chronicle";
export type PanelState = {
  drawer: DrawerStage;
  panel: DetailPanel | null;
  sidebar: boolean;
  tray: boolean;
};
export const initialPanels: PanelState = {
  drawer: 0,
  panel: null,
  sidebar: false,
  tray: false,
};
export type PanelAction =
  | { type: "drawer"; stage: DrawerStage }
  | { type: "panel"; panel: DetailPanel }
  | { type: "sidebar" }
  | { type: "tray" }
  | { type: "close" };
export function panelsReducer(
  state: PanelState,
  action: PanelAction,
): PanelState {
  switch (action.type) {
    case "drawer":
      return { ...state, drawer: action.stage };
    case "panel":
      return {
        ...state,
        panel: state.panel === action.panel ? null : action.panel,
      };
    case "sidebar":
      return { ...state, sidebar: !state.sidebar };
    case "tray":
      return { ...state, tray: !state.tray };
    case "close":
      return { ...state, drawer: 0, tray: false, sidebar: false };
  }
}
export function swipeStage(stage: DrawerStage, deltaY: number): DrawerStage {
  if (Math.abs(deltaY) < 32) return stage;
  return Math.max(0, Math.min(2, stage + (deltaY < 0 ? 1 : -1))) as DrawerStage;
}
