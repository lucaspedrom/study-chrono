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
  onLoginDemo?: () => void;
  onLogout: () => void;
}

export function UserMenuPopover({
  isOpen,
  user,
  onClose,
  onOpenSection,
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
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-900 font-mono text-sm font-semibold text-white dark:bg-neutral-100 dark:text-neutral-950 overflow-hidden">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                user.name.charAt(0).toUpperCase()
              )}
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
              {user.provider === "google"
                ? "Google"
                : user.provider === "email"
                  ? "E-mail"
                  : user.isDemo
                    ? "Demo"
                    : "Conectado"}
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
                onOpenSection("profile");
                onClose();
              }}
              className="font-sans mt-1 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-neutral-300 bg-white py-1.5 text-xs font-semibold text-neutral-900 shadow-xs transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              Entrar com o Google
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
