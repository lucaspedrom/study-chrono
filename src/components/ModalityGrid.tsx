import React from "react";
import {
  BookOpen,
  CheckSquare,
  Headphones,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import type { Modality, SessionSnapshot } from "../types/session";
import { formatSeconds } from "../utils/formatTime";

interface ModalityGridProps {
  snapshot: SessionSnapshot;
  disabled?: boolean;
  onSelectModality: (modality: Modality) => void;
}

interface ModalityCardConfig {
  id: Modality;
  label: string;
  icon: LucideIcon;
  getSeconds: (snap: SessionSnapshot) => number;
}

const MODALITIES: ModalityCardConfig[] = [
  {
    id: "reading",
    label: "Leitura",
    icon: BookOpen,
    getSeconds: (snap) => snap.readingSec,
  },
  {
    id: "media",
    label: "Videoaula / Áudio",
    icon: Headphones,
    getSeconds: (snap) => snap.mediaSec,
  },
  {
    id: "review",
    label: "Revisão",
    icon: RefreshCw,
    getSeconds: (snap) => snap.reviewSec,
  },
  {
    id: "questions",
    label: "Questões",
    icon: CheckSquare,
    getSeconds: (snap) => snap.questionsSec,
  },
];

export const ModalityGrid: React.FC<ModalityGridProps> = ({
  snapshot,
  disabled = false,
  onSelectModality,
}) => {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-600 dark:text-neutral-400">
          Selecione a Modalidade Ativa
        </span>
        <span className="font-sans text-xs text-neutral-500 dark:text-neutral-500">
          Clique para iniciar ou alternar
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {MODALITIES.map((item) => {
          const Icon = item.icon;
          const seconds = item.getSeconds(snapshot);
          const isActive =
            snapshot.status === "running" &&
            snapshot.activeModality === item.id;
          const isLastPaused =
            snapshot.status === "paused" && snapshot.lastModality === item.id;

          let cardClass =
            "border-neutral-300 bg-neutral-50 hover:border-neutral-500 hover:bg-neutral-100 text-neutral-800 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:border-neutral-600 dark:hover:bg-neutral-900 dark:text-neutral-200";
          if (isActive) {
            cardClass =
              "border-neutral-950 bg-neutral-900 text-white shadow-sm dark:border-white dark:bg-neutral-100 dark:text-neutral-950";
          } else if (isLastPaused) {
            cardClass =
              "border-dashed border-neutral-500 bg-neutral-100 hover:border-neutral-700 text-neutral-900 dark:border-neutral-500 dark:bg-neutral-900 dark:hover:border-neutral-300 dark:text-neutral-100";
          }

          return (
            <button
              key={item.id}
              type="button"
              disabled={disabled}
              aria-pressed={isActive}
              onClick={() => onSelectModality(item.id)}
              className={`group flex flex-col items-start justify-between rounded-xl border px-3 py-3 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 ${
                disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer"
              } ${cardClass}`}
            >
              <div className="flex w-full items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Icon
                    className={`h-3.5 w-3.5 shrink-0 ${
                      isActive
                        ? "text-white animate-pulse dark:text-neutral-950"
                        : isLastPaused
                          ? "text-neutral-700 dark:text-neutral-300"
                          : "text-neutral-500 group-hover:text-neutral-900 dark:text-neutral-400 dark:group-hover:text-neutral-100"
                    }`}
                  />
                  <span className="font-sans truncate text-[11.5px] font-medium tracking-normal">
                    {item.label}
                  </span>
                </div>

                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    isActive
                      ? "bg-white animate-pulse dark:bg-neutral-950"
                      : isLastPaused
                        ? "bg-neutral-500 dark:bg-neutral-400"
                        : "bg-neutral-300 dark:bg-neutral-800"
                  }`}
                />
              </div>

              <div
                className={`tabular-clock font-mono mt-2 text-lg font-medium tabular-nums ${
                  isActive
                    ? "text-white dark:text-neutral-950"
                    : seconds > 0
                      ? "text-neutral-950 dark:text-neutral-100"
                      : "text-neutral-400 dark:text-neutral-500"
                }`}
              >
                {formatSeconds(seconds)}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};
