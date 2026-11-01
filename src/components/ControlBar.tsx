import React from "react";
import { Pause, Play, Square } from "lucide-react";
import type { TrackerStatus } from "../types/session";

interface ControlBarProps {
  status: TrackerStatus;
  isBusy: boolean;
  onTogglePause: () => void;
  onStopSession: () => void;
  onStartSession?: () => void;
}

export const ControlBar: React.FC<ControlBarProps> = ({
  status,
  isBusy,
  onTogglePause,
  onStopSession,
  onStartSession,
}) => {
  const isIdle = status === "idle";
  const isPaused = status === "paused";
  const isStartAvailable = isIdle && Boolean(onStartSession);
  const isPlayPauseDisabled = isBusy || (isIdle && !onStartSession);
  const isStopDisabled = isIdle || isBusy;

  const baseBtnClass = isPlayPauseDisabled
    ? "cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400 dark:border-neutral-800 dark:bg-neutral-900/50 dark:text-neutral-600"
    : "cursor-pointer border-neutral-400 bg-neutral-50 text-neutral-900 hover:border-neutral-700 hover:bg-neutral-200/70 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:hover:border-neutral-500 dark:hover:bg-neutral-800";

  return (
    <div className="flex w-full items-center justify-center gap-2 sm:gap-3 pt-0.5">
      <button
        type="button"
        disabled={isPlayPauseDisabled}
        onClick={isStartAvailable ? onStartSession : onTogglePause}
        className={`font-mono flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 sm:gap-2 rounded-lg border px-3 sm:px-5 py-2.5 sm:py-2 text-[11px] font-medium uppercase tracking-[0.08em] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 ${baseBtnClass}`}
      >
        {isStartAvailable ? (
          <>
            <Play
              className={`h-3.5 w-3.5 shrink-0 fill-current ${
                isPlayPauseDisabled ? "" : "text-emerald-600 dark:text-emerald-400"
              }`}
            />
            <span className="truncate">Iniciar Estudo</span>
          </>
        ) : isPaused ? (
          <>
            <Play
              className={`h-3.5 w-3.5 shrink-0 fill-current ${
                isPlayPauseDisabled ? "" : "text-emerald-600 dark:text-emerald-400"
              }`}
            />
            <span className="truncate">Retomar Sessão</span>
          </>
        ) : (
          <>
            <Pause
              className={`h-3.5 w-3.5 shrink-0 fill-current ${
                isPlayPauseDisabled ? "" : "text-amber-600 dark:text-amber-400"
              }`}
            />
            <span className="truncate">Pausar Sessão</span>
          </>
        )}
      </button>

      <button
        type="button"
        disabled={isStopDisabled}
        onClick={onStopSession}
        className={`font-mono flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 sm:gap-2 rounded-lg border px-3 sm:px-5 py-2.5 sm:py-2 text-[11px] font-medium uppercase tracking-[0.08em] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 ${
          isStopDisabled
            ? "cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400 dark:border-neutral-800 dark:bg-neutral-900/50 dark:text-neutral-600"
            : "cursor-pointer border-neutral-400 bg-neutral-50 text-neutral-900 hover:border-neutral-700 hover:bg-neutral-200/70 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:hover:border-neutral-500 dark:hover:bg-neutral-800"
        }`}
      >
        <Square
          className={`h-3.5 w-3.5 shrink-0 fill-current ${
            isStopDisabled ? "" : "text-rose-600 dark:text-rose-400"
          }`}
        />
        <span className="truncate">Finalizar Estudo</span>
      </button>
    </div>
  );
};
