import { useEffect, useRef } from "react";
import {
  User,
  HardDrive,
  Download,
  Info,
  LogOut,
  ChevronRight,
} from "lucide-react";
import type { UserProfile } from "../types/session";
import { useModalFocusTrap } from "../utils/useModalFocusTrap";

export type UserSection = "profile" | "storage" | "backup" | "help";

export interface UserMenuPopoverProps {
  isOpen: boolean;
  user: UserProfile | null;
  onClose: () => void;
  onOpenSection: (section: UserSection) => void;
  onLoginDemo: () => void;
  onLogout: () => void;
}

export function UserMenuPopover({
  isOpen,
  user,
  onClose,
  onOpenSection,
  onLoginDemo,
  onLogout,
}: UserMenuPopoverProps) {
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useModalFocusTrap(isOpen, popoverRef);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop transparente para captura de clique externo sem escurecer a tela */}
      <div
        role="presentation"
        aria-hidden="true"
        className="fixed inset-0 z-30 cursor-default"
        onClick={onClose}
      />

      {/* Caixa flutuante (Popover) posicionada logo abaixo do botão de usuário */}
      <div
        ref={popoverRef}
        role="menu"
        aria-label="Menu de usuário e configurações"
        className="absolute right-0 top-full z-40 mt-2 w-80 rounded-xl border border-neutral-300 bg-white p-3 text-neutral-950 shadow-xl outline-hidden animate-in fade-in zoom-in-95 duration-100 select-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
      >
        {/* Resumo simples do Usuário / Modo Visitante */}
        {user ? (
          <div className="flex items-center gap-3 rounded-lg bg-neutral-50 p-2.5 dark:bg-neutral-950/50 border border-neutral-200/80 dark:border-neutral-800/80">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-900 font-mono text-sm font-semibold text-white dark:bg-neutral-100 dark:text-neutral-950">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-sans text-xs font-semibold truncate text-neutral-950 dark:text-neutral-100">
                {user.name}
              </div>
              <div className="font-mono text-[11px] truncate text-neutral-500 dark:text-neutral-400">
                {user.email}
              </div>
            </div>
            <span className="font-mono rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
              {user.isDemo ? "Demo" : "Conectado"}
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-2 rounded-lg bg-neutral-50 p-3 dark:bg-neutral-950/50 border border-neutral-200/80 dark:border-neutral-800/80">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-800">
                <User className="h-4 w-4 text-neutral-700 dark:text-neutral-300" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-sans text-xs font-semibold text-neutral-950 dark:text-neutral-100">
                  Modo Visitante
                </div>
                <div className="font-sans text-[11px] text-neutral-500 dark:text-neutral-400">
                  Dados salvos localmente neste navegador
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                onLoginDemo();
                onClose();
              }}
              className="font-mono mt-1 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-neutral-900 bg-neutral-900 py-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-white transition-colors hover:bg-neutral-800 dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-950 dark:hover:bg-neutral-200"
            >
              <User className="h-3.5 w-3.5" />
              Entrar como Usuário de Teste
            </button>
          </div>
        )}

        {/* Separador */}
        <div className="my-2 border-t border-neutral-200 dark:border-neutral-800" />

        {/* Lista de Opções Principais: Perfil, Configuração/Armazenamento, Backup, Ajuda */}
        <div className="flex flex-col gap-1" role="none">
          <button
            type="button"
            role="menuitem"
            onClick={() => onOpenSection("profile")}
            className="group flex w-full cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-700 group-hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300">
                <User className="h-3.5 w-3.5" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-sans text-xs font-medium text-neutral-950 dark:text-neutral-100">
                  Perfil
                </span>
                <span className="font-sans text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                  Detalhes da conta e sessão
                </span>
              </div>
            </div>
            <ChevronRight className="h-3.5 w-3.5 text-neutral-400 group-hover:text-neutral-700 dark:text-neutral-500 dark:group-hover:text-neutral-300" />
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => onOpenSection("storage")}
            className="group flex w-full cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-700 group-hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300">
                <HardDrive className="h-3.5 w-3.5" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-sans text-xs font-medium text-neutral-950 dark:text-neutral-100">
                  Configuração / Armazenamento
                </span>
                <span className="font-sans text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                  Local e sincronização com Google Drive
                </span>
              </div>
            </div>
            <ChevronRight className="h-3.5 w-3.5 text-neutral-400 group-hover:text-neutral-700 dark:text-neutral-500 dark:group-hover:text-neutral-300" />
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => onOpenSection("backup")}
            className="group flex w-full cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-700 group-hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300">
                <Download className="h-3.5 w-3.5" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-sans text-xs font-medium text-neutral-950 dark:text-neutral-100">
                  Backup de Dados
                </span>
                <span className="font-sans text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                  Exportar e restaurar registros JSON
                </span>
              </div>
            </div>
            <ChevronRight className="h-3.5 w-3.5 text-neutral-400 group-hover:text-neutral-700 dark:text-neutral-500 dark:group-hover:text-neutral-300" />
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => onOpenSection("help")}
            className="group flex w-full cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-700 group-hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300">
                <Info className="h-3.5 w-3.5" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-sans text-xs font-medium text-neutral-950 dark:text-neutral-100">
                  Ajuda & Sobre
                </span>
                <span className="font-sans text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                  Tolerância a falhas e funcionamento
                </span>
              </div>
            </div>
            <ChevronRight className="h-3.5 w-3.5 text-neutral-400 group-hover:text-neutral-700 dark:text-neutral-500 dark:group-hover:text-neutral-300" />
          </button>
        </div>

        {/* Rodapé: Ação de Logout se autenticado */}
        {user && (
          <>
            <div className="my-2 border-t border-neutral-200 dark:border-neutral-800" />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onLogout();
                onClose();
              }}
              className="font-mono flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-neutral-700 transition-colors hover:bg-neutral-100 hover:text-neutral-950 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sair da Conta (Logout)</span>
            </button>
          </>
        )}
      </div>
    </>
  );
}
