export function Sigil({
  kind = "unit",
  variant = "sword",
  className = "",
}: {
  kind?: string;
  variant?: string;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === "headquarters" ? (
        <>
          <path d="M9 51h46V29H43V17H21v12H9z" />
          <path d="M9 29v-7h7v7m32 0v-7h7v7M21 17V9h7v8m8 0V9h7v8M28 51V37h8v14M25 26h3m8 0h3" />
          <path d="M32 9V3l13 4-13 4" />
        </>
      ) : kind === "landmark" ? (
        <>
          <path d="M17 52h30M22 52V21h20v31M17 21l15-12 15 12zM29 52V39h6v13M29 28h6" />
          <path d="M32 9V3l11 3-11 3" />
        </>
      ) : kind === "spell" ? (
        <>
          <path d="m32 5 6 18 19 9-19 8-6 19-8-19L7 32l17-9z" />
          <path d="m32 21 10 11-10 11-10-11zM11 10l6 5m35-5-6 5M9 51l8-5m37 5-7-5" />
        </>
      ) : variant.includes("archers") || variant.includes("ballista") ? (
        <>
          <path d="M21 9c31 12 31 34 0 46l9-23zM12 32h40m-8-7 8 7-8 7" />
        </>
      ) : variant.includes("scout") || variant.includes("cavalry") ? (
        <>
          <path d="m15 51 7-22 16-15 12 8-9 14H30l-3 15zM38 14l-2-8-8 12M15 51h35M40 23h3" />
          <path d="m24 32 7-8" />
        </>
      ) : (
        <>
          <path d="m41 6 8 8-23 25-7-7zM13 32l19 19M10 54l12-12M24 45l-5-5" />
          <path d="m47 34 9 4v11l-9 8-9-8V38z" />
        </>
      )}
    </svg>
  );
}
export const terrainNames: Record<string, string> = {
  plain: "平原",
  forest: "森林",
  mountain: "山岳",
  swamp: "湿地",
  desert: "砂漠",
  river: "河川",
};
export const terrainEffects: Record<string, string> = {
  plain: "地形補正なし",
  forest: "反撃ダメージ +1",
  mountain: "開始時の移動 −1（最低1）・反撃 +1",
  swamp: "開始時の移動 −2（最低1）",
  desert: "現在戦力 −1（最低1）",
  river: "開始時の移動を1に固定（移動0は除外）",
};
export const typeNames: Record<string, string> = {
  unit: "ユニット",
  landmark: "ランドマーク",
  spell: "スペル",
};
