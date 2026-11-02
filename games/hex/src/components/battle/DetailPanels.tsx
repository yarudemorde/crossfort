import type { ReactNode } from "react";
import type { DetailPanel } from "./panels";
export function DetailPanels({
  panel,
  onPanel,
  content,
  id,
}: {
  panel: DetailPanel | null;
  onPanel: (p: DetailPanel) => void;
  content: Record<DetailPanel, ReactNode>;
  id: string;
}) {
  return (
    <div className="detail-accordions">
      {(
        [
          ["resources", "資源詳細"],
          ["selection", "選択中の部隊・カード"],
          ["chronicle", "戦況記録"],
        ] as const
      ).map(([key, label]) => (
        <section key={key}>
          <button
            id={`${id}-${key}-toggle`}
            className="accordion-toggle"
            aria-expanded={panel === key}
            aria-controls={`${id}-${key}`}
            onClick={() => onPanel(key)}
          >
            {label}
            <span aria-hidden="true">{panel === key ? "−" : "+"}</span>
          </button>
          {panel === key && (
            <div
              id={`${id}-${key}`}
              role="region"
              aria-labelledby={`${id}-${key}-toggle`}
              className="accordion-content"
            >
              {content[key]}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
