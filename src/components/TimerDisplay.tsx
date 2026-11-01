import React from "react";
import { MODALITY_LABELS, type SessionSnapshot } from "../types/session";
import { formatMainClock, formatSeconds } from "../utils/formatTime";

interface TimerDisplayProps {
  snapshot: SessionSnapshot;
}

export const TimerDisplay: React.FC<TimerDisplayProps> = ({ snapshot }) => {
  const isRunning = snapshot.status === "running";
  const isPaused = snapshot.status === "paused";

  const { main, tenths } = formatMainClock(
    snapshot.totalActiveMs,
    snapshot.totalActiveSec,
  );

  const clockColorClass = isPaused
    ? "text-neutral-500 dark:text-neutral-400"
    : isRunning
      ? "text-black dark:text-white"
      : "text-neutral-800 dark:text-neutral-300";

  return (
    <section className="flex flex-col items-center justify-center rounded-xl border border-neutral-300 bg-white px-3 sm:px-6 py-3.5 sm:py-5 text-center dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="font-serif text-lg sm:text-2xl font-normal tracking-[-0.015em] text-neutral-700 dark:text-neutral-300">
        Tempo Líquido de Estudo
      </h2>

      <div
        id="main-timer-clock"
        aria-live="off"
        className={`tabular-clock font-mono mt-1.5 flex items-baseline justify-center tabular-nums transition-colors ${clockColorClass}`}
      >
        <span className="tabular-clock font-mono text-5xl min-[380px]:text-6xl sm:text-7xl font-normal tracking-tight leading-none tabular-nums">
          {main}
        </span>
        <span
          data-testid="timer-tenths"
          className="tabular-clock font-mono ml-0.5 inline-block text-left text-xl min-[380px]:text-2xl sm:text-3xl font-light leading-none text-neutral-400 tabular-nums dark:text-neutral-500"
        >
          .{tenths}
        </span>
      </div>

      <div className="font-sans mt-3 flex flex-wrap items-center justify-center gap-2 text-xs">
        {isRunning && snapshot.activeModality && (
          <>
            <span className="font-mono inline-flex items-center gap-1.5 rounded-full border border-neutral-900 bg-neutral-900 px-3 py-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-950">
              <span className="h-2 w-2 rounded-full bg-white animate-pulse dark:bg-neutral-950" />
              EM ANDAMENTO
            </span>
            <span className="font-sans text-neutral-600 dark:text-neutral-300">
              Modalidade:{" "}
              <strong className="font-semibold text-black dark:text-white">
                {MODALITY_LABELS[snapshot.activeModality]}
              </strong>
            </span>
          </>
        )}

        {isPaused && (
          <>
            <span className="font-mono inline-flex items-center gap-1.5 rounded-full border border-neutral-400 bg-neutral-200 px-3 py-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-800 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200">
              <span className="h-2 w-2 rounded-full bg-neutral-700 dark:bg-neutral-300" />
              PAUSADO
            </span>
            {snapshot.lastModality && (
              <span className="font-sans text-neutral-600 dark:text-neutral-400">
                Última modalidade: {MODALITY_LABELS[snapshot.lastModality]}
              </span>
            )}
          </>
        )}

        {snapshot.status === "idle" && (
          <span className="font-sans rounded-full border border-neutral-300 bg-neutral-100 px-3.5 py-0.5 text-neutral-600 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
            Pronto — preencha a matéria e selecione uma modalidade abaixo
          </span>
        )}
      </div>

      <div
        className={`tabular-clock font-mono mt-2.5 text-[11px] tracking-[0.02em] tabular-nums transition-colors ${
          isPaused
            ? "font-medium text-neutral-900 dark:text-neutral-200"
            : "text-neutral-500 dark:text-neutral-500"
        }`}
      >
        Tempo em Intervalos/Pausas: {formatSeconds(snapshot.pausedSec)}
      </div>
    </section>
  );
};
