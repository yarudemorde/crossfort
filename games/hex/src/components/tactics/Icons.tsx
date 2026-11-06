import type { ReactNode } from "react";
import type { ClassId, Character } from "../../character/types";
import { stats } from "../../character/roster";
export type IconName =
  | ClassId
  | "castle"
  | "menu"
  | "back"
  | "close"
  | "sword"
  | "shield"
  | "eye"
  | "move"
  | "target"
  | "fit"
  | "plus"
  | "minus"
  | "flag"
  | "book"
  | "settings"
  | "chevron"
  | "check"
  | "heart"
  | "history";
const paths: Record<IconName, ReactNode> = {
  knight: (
    <>
      <path d="M7 7 12 3l5 4v9l-5 5-5-5Z" />
      <path d="M12 7v10M9 11h6M4 4l2 15M3 16h5" />
    </>
  ),
  archer: (
    <>
      <path d="M7 3c10 1 10 17 0 18l6-9Z" />
      <path d="M3 12h17m-4-3 4 3-4 3" />
    </>
  ),
  scout: (
    <>
      <path d="m6 10 6-7 6 7-3 9H9Z" />
      <path d="M8 10h8l-4 5ZM17 3l-1 5m-2-2 4 3" />
    </>
  ),
  castle: (
    <>
      <path d="M4 21h16M6 21V8h3V4h2v4h2V4h2v4h3v13M4 8V4h2v4m12 0h2V4h-2" />
      <path d="M10 21v-5a2 2 0 0 1 4 0v5" />
    </>
  ),
  menu: <path d="M5 6h14M5 12h14M5 18h14" />,
  back: <path d="m14 5-7 7 7 7M7 12h13" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  sword: (
    <>
      <path d="m6 18 13-13-1 5-9 10M5 15l5 5M3 21l4-4" />
    </>
  ),
  shield: <path d="m12 3 8 4-2 10-6 4-6-4L4 7Z" />,
  eye: (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  move: (
    <path d="M12 3v18M3 12h18m-13-5 4-4 4 4m-9 9 5 5 4-4M7 8l-4 4 4 4m10-8 4 4-4 4" />
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 1v6m0 10v6M1 12h6m10 0h6" />
    </>
  ),
  fit: <path d="M4 9V4h5m6 0h5v5m0 6v5h-5M9 20H4v-5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  flag: <path d="M5 22V3l14 2-3 5 3 5-14-2" />,
  book: (
    <path d="M12 6c-4-3-8-2-9-1v15c4-2 6-1 9 1 3-2 5-3 9-1V5c-1-1-5-2-9 1v15" />
  ),
  settings: (
    <>
      <path d="m8 3 1 3-3 2-3-1-1 5 3 1 1 3-2 2 4 3 2-2 3 1 1 2 5-2-1-3 2-2 3-1-1-5-3 1-2-2V5l-4-2-2 2Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  chevron: <path d="m9 5 7 7-7 7" />,
  check: <path d="m4 12 5 5L20 6" />,
  heart: <path d="M12 21 3 12C-2 4 7-1 12 6 17-1 26 4 21 12Z" />,
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 3-7M3 3v6h6" />
      <path d="M12 7v5l4 3" />
    </>
  ),
};
export function Icon({
  name,
  size = 20,
  ...props
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
export const classNames: Record<ClassId, string> = {
  knight: "騎士",
  archer: "弓兵",
  scout: "斥候",
};
export const countryNames: Record<string, string> = {
  crossfort: "クロスフォート",
  avis: "アヴィス",
  riskari: "リスカリ",
};
export function SoldierBadge({
  character,
  hp,
  enemy = false,
  selected = false,
}: {
  character: Character;
  hp?: number;
  enemy?: boolean;
  selected?: boolean;
}) {
  const value = stats(character);
  return (
    <span
      className={`hx-badge ${enemy ? "enemy" : ""} ${selected ? "selected" : ""}`}
    >
      <Icon name={character.classId} size={28} />
      <span className="hx-badge-hp">
        <i
          style={{
            width: `${Math.max(0, (hp ?? value.hp) / value.hp) * 100}%`,
          }}
        />
      </span>
    </span>
  );
}
