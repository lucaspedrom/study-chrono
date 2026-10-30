import { useState, useRef, useEffect } from "react";
import {
  User,
  X,
  HardDrive,
  Cloud,
  Download,
  Upload,
  LogOut,
  Key,
  CheckCircle2,
  AlertCircle,
  Info,
  ShieldCheck,
  Zap,
} from "lucide-react";
import type { UserProfile, StorageMode } from "../types/session";
import { useModalFocusTrap } from "../utils/useModalFocusTrap";

export type UserProfileModalSection =
  | "all"
  | "profile"
  | "storage"
  | "backup"
  | "help";

export interface UserProfileModalProps {
  isOpen: boolean;
  activeSection?: UserProfileModalSection;
  user: UserProfile | null;
  storageMode: StorageMode;
  googleClientId: string;
  onClose: () => void;
  onLoginDemo: () => void;
  onLogout: () => void;
  onUpdateStorageMode: (mode: StorageMode) => void;
  onUpdateGoogleClientId: (clientId: string) => void;
  onExportBackup: () => void;
  onImportBackup: (file: File) => Promise<boolean>;
}

export function UserProfileModal({
  isOpen,
  activeSection = "all",
  user,
  storageMode,
  googleClientId,
  onClose,
  onLoginDemo,
  onLogout,
  onUpdateStorageMode,
  onUpdateGoogleClientId,
  onExportBackup,
  onImportBackup,
}: UserProfileModalProps) {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [inputClientId, setInputClientId] = useState(googleClientId);
  const [clientIdSaved, setClientIdSaved] = useState(false);
  const [importStatus, setImportStatus] = useState<"idle" | "success" | "error">(
    "idle",
  );

  useModalFocusTrap(isOpen, modalRef, closeBtnRef);

  useEffect(() => {
    setInputClientId(googleClientId);
  }, [googleClientId]);

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

  const handleSaveClientId = () => {
    onUpdateGoogleClientId(inputClientId);
    setClientIdSaved(true);
    setTimeout(() => setClientIdSaved(false), 2500);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ok = await onImportBackup(file);
    setImportStatus(ok ? "success" : "error");
    setTimeout(() => setImportStatus("idle"), 3000);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Metadados do cabeçalho de acordo com a seção ativa
  const getHeaderMeta = () => {
    switch (activeSection) {
      case "profile":
        return {
          title: "Perfil do Usuário",
          description: "Gerencie sua sessão e dados de identificação.",
          icon: <User className="h-4 w-4 text-neutral-900 dark:text-neutral-100" />,
        };
      case "storage":
        return {
          title: "Configuração de Armazenamento",
          description: "Defina onde suas sessões e histórico são gravados.",
          icon: (
            <HardDrive className="h-4 w-4 text-neutral-900 dark:text-neutral-100" />
          ),
        };
      case "backup":
        return {
          title: "Backup de Dados",
          description: "Exporte ou restaure seu histórico completo em formato JSON.",
          icon: (
            <Download className="h-4 w-4 text-neutral-900 dark:text-neutral-100" />
          ),
        };
      case "help":
        return {
          title: "Ajuda & Sobre",
          description:
            "Informações sobre tolerância a falhas e funcionamento do StudyChrono.",
          icon: <Info className="h-4 w-4 text-neutral-900 dark:text-neutral-100" />,
        };
      case "all":
      default:
        return {
          title: "Perfil e Armazenamento",
          description:
            "Gerencie sua sessão, dados locais e configurações de sincronização.",
          icon: <User className="h-4 w-4 text-neutral-900 dark:text-neutral-100" />,
        };
    }
  };

  const headerMeta = getHeaderMeta();

  // Renderizador da Seção de Autenticação / Perfil
  const renderAuthSection = () => (
    <section className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-950/40">
      <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
        Autenticação de Usuário
      </span>

      {user ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-900 font-mono text-sm font-semibold text-white dark:bg-neutral-100 dark:text-neutral-950">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="font-sans text-sm font-semibold text-neutral-950 dark:text-neutral-100">
                  {user.name}
                </div>
                <div className="font-mono text-xs text-neutral-500 dark:text-neutral-400">
                  {user.email}
                </div>
              </div>
            </div>
            <span className="font-mono rounded-full border border-neutral-300 bg-white px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.05em] text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
              {user.isDemo ? "Teste / Demo" : "Conectado"}
            </span>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={onLogout}
              className="font-mono inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 dark:hover:text-neutral-100 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sair da Conta (Logout)
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-2.5 text-xs text-neutral-600 dark:text-neutral-400">
            <Info className="h-4 w-4 shrink-0 text-neutral-500 mt-0.5" />
            <span>
              Você está em <strong>Modo Visitante</strong>. O cronômetro funciona normalmente sem login prévio e seus dados são salvos localmente neste navegador.
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onLoginDemo}
              className="font-mono inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-neutral-900 bg-neutral-900 px-3.5 py-1.5 text-xs font-medium uppercase tracking-[0.06em] text-white hover:bg-neutral-800 dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-950 dark:hover:bg-neutral-200 transition-colors"
            >
              <User className="h-3.5 w-3.5" />
              Entrar como Usuário de Teste
            </button>
          </div>
        </div>
      )}
    </section>
  );

  // Renderizador da Seção de Armazenamento
  const renderStorageSection = () => (
    <section className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-950/40">
      <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
        Configuração de Armazenamento
      </span>

      <div className="flex flex-col gap-2.5">
        {/* Opção 1: Armazenamento Local no Navegador */}
        <label
          className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
            storageMode === "local"
              ? "border-neutral-950 bg-white shadow-xs dark:border-neutral-100 dark:bg-neutral-900"
              : "border-neutral-200 bg-white/60 hover:bg-white dark:border-neutral-800 dark:bg-neutral-950/60 dark:hover:bg-neutral-900"
          }`}
        >
          <input
            type="radio"
            name="storageMode"
            value="local"
            checked={storageMode === "local"}
            onChange={() => onUpdateStorageMode("local")}
            className="mt-1 cursor-pointer accent-neutral-950 dark:accent-neutral-100"
          />
          <div className="flex flex-1 flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="font-sans flex items-center gap-1.5 text-xs font-semibold text-neutral-950 dark:text-neutral-100">
                <HardDrive className="h-3.5 w-3.5" />
                Armazenamento Local no Navegador (LocalStorage / IndexedDB)
              </span>
              <span className="font-mono text-[10px] font-semibold uppercase text-neutral-600 dark:text-neutral-300">
                Ativo
              </span>
            </div>
            <p className="font-sans text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
              Seus dados de estudo e matérias ficam salvos com segurança no cache deste navegador. Possui checkpoints em segundo plano e proteção contra fechamento de abas.
            </p>
          </div>
        </label>

        {/* Opção 2: Google Drive Pessoal */}
        <label
          className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
            storageMode === "drive"
              ? "border-neutral-950 bg-white shadow-xs dark:border-neutral-100 dark:bg-neutral-900"
              : "border-neutral-200 bg-white/60 hover:bg-white dark:border-neutral-800 dark:bg-neutral-950/60 dark:hover:bg-neutral-900"
          }`}
        >
          <input
            type="radio"
            name="storageMode"
            value="drive"
            checked={storageMode === "drive"}
            onChange={() => onUpdateStorageMode("drive")}
            className="mt-1 cursor-pointer accent-neutral-950 dark:accent-neutral-100"
          />
          <div className="flex flex-1 flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="font-sans flex items-center gap-1.5 text-xs font-semibold text-neutral-950 dark:text-neutral-100">
                <Cloud className="h-3.5 w-3.5" />
                Google Drive Pessoal (Sincronização em Nuvem)
              </span>
              <span className="font-mono rounded border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                Em breve / Configurar
              </span>
            </div>
            <p className="font-sans text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
              Sincronização em nuvem para acessar suas horas estudadas de qualquer computador ou celular mantendo a posse dos seus dados no seu próprio Google Drive.
            </p>
          </div>
        </label>
      </div>

      {/* Configuração de Google Client ID */}
      <div className="mt-1 flex flex-col gap-1.5 border-t border-neutral-200 pt-3 dark:border-neutral-800">
        <label
          htmlFor="google-client-id"
          className="font-mono flex items-center gap-1 text-[11px] font-medium text-neutral-700 dark:text-neutral-300"
        >
          <Key className="h-3 w-3" />
          Google OAuth Client ID (Opcional para ambiente próprio):
        </label>
        <div className="flex items-center gap-2">
          <input
            id="google-client-id"
            type="text"
            placeholder="ex: 123456789-xyz.apps.googleusercontent.com"
            value={inputClientId}
            onChange={(e) => setInputClientId(e.target.value)}
            className="font-mono flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-950 placeholder-neutral-400 focus:border-neutral-950 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder-neutral-500 dark:focus:border-neutral-100"
          />
          <button
            type="button"
            onClick={handleSaveClientId}
            className="font-mono cursor-pointer rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700 transition-colors"
          >
            Salvar
          </button>
        </div>
        {clientIdSaved && (
          <span className="font-mono flex items-center gap-1 text-[11px] font-medium text-neutral-900 dark:text-neutral-100">
            <CheckCircle2 className="h-3 w-3" />
            Client ID salvo com sucesso!
          </span>
        )}
      </div>
    </section>
  );

  // Renderizador da Seção de Ajuda e Fechamento Inesperado
  const renderHelpSection = () => (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-950/40">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-neutral-700 dark:text-neutral-300" />
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
            Como Funciona o Fechamento Inesperado
          </span>
        </div>
        <p className="font-sans text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
          Se você fechar a aba acidentalmente, a bateria acabar ou o computador reiniciar durante o estudo, o StudyChrono salva um <strong>checkpoint a cada segundo</strong>. Ao reabrir a aplicação, ela recupera automaticamente o tempo estudado até o último instante como sessão <strong>Recuperada (Encerramento inesperado)</strong>.
        </p>
      </section>

      {activeSection === "help" && (
        <section className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-950/40">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-neutral-700 dark:text-neutral-300" />
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
              Atalhos & Usabilidade
            </span>
          </div>
          <ul className="flex flex-col gap-1.5 font-sans text-xs text-neutral-600 dark:text-neutral-400">
            <li className="flex items-start gap-1.5">
              <span className="font-mono font-bold text-neutral-900 dark:text-neutral-100">•</span>
              <span><strong>Início Rápido:</strong> Pressione Enter ou escolha uma modalidade para iniciar imediatamente.</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="font-mono font-bold text-neutral-900 dark:text-neutral-100">•</span>
              <span><strong>Hot-Swap:</strong> Mude de Leitura para Questões com 1 clique sem pausar o relógio.</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="font-mono font-bold text-neutral-900 dark:text-neutral-100">•</span>
              <span><strong>Histórico:</strong> Edição inline com recálculo automático e paginação para alta performance.</span>
            </li>
          </ul>
        </section>
      )}
    </div>
  );

  // Renderizador da Seção de Backup de Dados
  const renderBackupSection = () => (
    <section className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-950/40">
      <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
        Backup e Exportação dos Seus Estudos
      </span>
      <p className="font-sans text-xs text-neutral-600 dark:text-neutral-400">
        Exporte seus registros em arquivo JSON para guardar uma cópia segura ou transfira seus dados para outro navegador.
      </p>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={onExportBackup}
          className="font-mono inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700 transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          Exportar Backup (JSON)
        </button>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="font-mono inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700 transition-colors"
        >
          <Upload className="h-3.5 w-3.5" />
          Importar Backup (JSON)
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {importStatus === "success" && (
        <span className="font-mono flex items-center gap-1 text-[11px] font-medium text-neutral-900 dark:text-neutral-100">
          <CheckCircle2 className="h-3 w-3" />
          Backup restaurado com sucesso! Seus registros foram atualizados.
        </span>
      )}
      {importStatus === "error" && (
        <span className="font-mono flex items-center gap-1 text-[11px] font-medium text-neutral-900 dark:text-neutral-100">
          <AlertCircle className="h-3 w-3" />
          Falha ao importar backup. Verifique se o arquivo JSON é válido.
        </span>
      )}
    </section>
  );

  const isFullView = activeSection === "all";

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-profile-modal-title"
        tabIndex={-1}
        className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl border border-neutral-300 bg-white text-neutral-950 shadow-2xl outline-hidden dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 ${
          isFullView ? "max-w-lg" : "max-w-md"
        }`}
      >
        {/* Cabeçalho do Modal Sóbrio */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3.5 dark:border-neutral-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-neutral-300 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800">
              {headerMeta.icon}
            </div>
            <div className="min-w-0">
              <h2
                id="user-profile-modal-title"
                className="font-serif text-lg font-normal tracking-tight truncate text-neutral-950 dark:text-neutral-100"
              >
                {headerMeta.title}
              </h2>
              <p className="font-sans text-xs text-neutral-500 dark:text-neutral-400 truncate">
                {headerMeta.description}
              </p>
            </div>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            aria-label="Fechar janela"
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Corpo do Modal com Scroll suave */}
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          {activeSection === "all" && (
            <>
              {renderAuthSection()}
              {renderStorageSection()}
              {renderHelpSection()}
              {renderBackupSection()}
            </>
          )}

          {activeSection === "profile" && renderAuthSection()}
          {activeSection === "storage" && renderStorageSection()}
          {activeSection === "backup" && renderBackupSection()}
          {activeSection === "help" && renderHelpSection()}
        </div>

        {/* Rodapé com Botão Fechar Sóbrio */}
        <div className="flex items-center justify-end border-t border-neutral-200 bg-neutral-50 px-5 py-3 dark:border-neutral-800 dark:bg-neutral-950">
          <button
            type="button"
            onClick={onClose}
            className="font-mono cursor-pointer rounded-lg border border-neutral-300 bg-white px-4 py-1.5 text-xs font-medium uppercase tracking-[0.06em] text-neutral-800 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
