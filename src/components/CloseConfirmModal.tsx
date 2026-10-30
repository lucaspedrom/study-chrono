import React, { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import { useModalFocusTrap } from "../utils/useModalFocusTrap";

interface CloseConfirmModalProps {
  isOpen: boolean;
  isClosing: boolean;
  onContinueStudying: () => void;
  onConfirmClose: () => void;
}

export const CloseConfirmModal: React.FC<CloseConfirmModalProps> = ({
  isOpen,
  isClosing,
  onContinueStudying,
  onConfirmClose,
}) => {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const continueButtonRef = useRef<HTMLButtonElement | null>(null);

  useModalFocusTrap(isOpen, dialogRef, continueButtonRef);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isClosing) {
        e.stopPropagation();
        onContinueStudying();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isClosing, onContinueStudying]);

  if (!isOpen) return null;

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="close-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs dark:bg-black/75"
    >
      <div className="w-full max-w-md rounded-xl border border-neutral-300 bg-white p-5 shadow-2xl shadow-black/30 dark:border-neutral-800 dark:bg-neutral-900 dark:shadow-black/80">
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-lg border border-neutral-300 bg-neutral-100 p-2 text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h3
              id="close-modal-title"
              className="font-serif text-xl font-normal tracking-[-0.015em] text-neutral-950 dark:text-neutral-100"
            >
              Sessão de estudo em andamento
            </h3>
            <p className="font-sans mt-1.5 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
              Você possui uma sessão de estudo em andamento. Deseja encerrar e
              registrar o tempo estudado até agora antes de sair?
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5">
          <button
            ref={continueButtonRef}
            type="button"
            disabled={isClosing}
            onClick={onContinueStudying}
            className="font-mono cursor-pointer rounded-lg border border-neutral-300 bg-neutral-100 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-800 transition-colors hover:bg-neutral-200 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
          >
            Continuar Estudando
          </button>
          <button
            type="button"
            disabled={isClosing}
            onClick={onConfirmClose}
            className="font-mono cursor-pointer rounded-lg border border-neutral-950 bg-neutral-950 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-white transition-colors hover:bg-neutral-800 disabled:opacity-50 dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-950 dark:hover:bg-neutral-300"
          >
            {isClosing ? "Salvando e saindo..." : "Encerrar, Salvar e Sair"}
          </button>
        </div>
      </div>
    </div>
  );
};
