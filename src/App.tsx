import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Clock, FileText, Moon, Sun, User, X } from "lucide-react";
import "./App.css";
import { CloseConfirmModal } from "./components/CloseConfirmModal";
import { ControlBar } from "./components/ControlBar";
import { HistoryReport } from "./components/HistoryReport";
import { ModalityGrid } from "./components/ModalityGrid";
import { SubjectInput } from "./components/SubjectInput";
import { TimerDisplay } from "./components/TimerDisplay";
import {
  UserProfileModal,
  type UserProfileModalSection,
} from "./components/UserProfileModal";
import { UserMenuPopover } from "./components/UserMenuPopover";
import {
  confirmCloseAndExit,
  deleteHistorySession,
  exportDataAsJson,
  getHistoryData,
  getInitialData,
  getSessionSnapshot,
  getStorageConfigWeb,
  getUserProfileWeb,
  importDataFromJson,
  loginDemoUserWeb,
  logoutUserWeb,
  onCloseRequested,
  saveActiveSessionCheckpoint,
  setStorageConfigWeb,
  startOrSwitchModality,
  stopSession,
  togglePause,
  updateHistorySession,
  updateSessionMetadata,
} from "./services/tauriApi";
import {
  IDLE_SNAPSHOT,
  type AppTab,
  type Modality,
  type SessionSnapshot,
  type StorageMode,
  type StudySessionRecord,
  type ThemeMode,
  type UserProfile,
} from "./types/session";
import { formatDateBR, formatSeconds } from "./utils/formatTime";

const THEME_STORAGE_KEY = "study_chrono_theme";

function getInitialTheme(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark") {
      return saved;
    }
  } catch {
    // Ignora falha de acesso ao localStorage
  }
  return "dark";
}

function getLocalTodayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function App() {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [activeTab, setActiveTab] = useState<AppTab>("timer");

  const [snapshot, setSnapshot] = useState<SessionSnapshot>(IDLE_SNAPSHOT);
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [historySessions, setHistorySessions] = useState<StudySessionRecord[]>(
    [],
  );
  const [recoveredSessions, setRecoveredSessions] = useState<
    StudySessionRecord[]
  >([]);
  const [subjectError, setSubjectError] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // Estados de Usuário, Perfil e Notificação de Modo Visitante
  const [user, setUser] = useState<UserProfile | null>(() => getUserProfileWeb());
  const [storageMode, setStorageMode] = useState<StorageMode>(
    () => getStorageConfigWeb().mode,
  );
  const [googleClientId, setGoogleClientId] = useState<string>(
    () => getStorageConfigWeb().googleClientId,
  );
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [activeModalSection, setActiveModalSection] =
    useState<UserProfileModalSection | null>(null);
  const [showVisitorNotice, setShowVisitorNotice] = useState(false);

  const subjectInputRef = useRef<HTMLInputElement | null>(null);
  const actionVersionRef = useRef(0);
  const sessionEpochRef = useRef(0);
  const pollInFlightRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncedMetadataRef = useRef<{ subject: string; topic: string }>({
    subject: "",
    topic: "",
  });

  // Sincroniza classe .dark no <html> e persiste preferência de tema
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", theme === "dark");
    }
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignora erro de armazenamento
    }
  }, [theme]);

  // Carregamento inicial de dados + listener de interceptação de fechamento (RN04 & RN05)
  useEffect(() => {
    let disposed = false;
    let unlistenClose: (() => void) | null = null;

    getInitialData()
      .then((data) => {
        if (disposed) return;
        setSubjects(data.subjects);
        setHistorySessions(data.historySessions ?? data.dailySummary.sessions);
        setSnapshot(data.snapshot);
        if (data.snapshot.status !== "idle") {
          setSubject(data.snapshot.subject);
          setTopic(data.snapshot.topic);
          lastSyncedMetadataRef.current = {
            subject: data.snapshot.subject,
            topic: data.snapshot.topic,
          };
        }
        if (data.recoveredSessions.length > 0) {
          setRecoveredSessions(data.recoveredSessions);
        }
      })
      .catch((err) => {
        if (!disposed) {
          setErrorBanner(String(err));
        }
      });

    onCloseRequested(() => {
      if (!disposed) {
        setIsCloseModalOpen(true);
      }
    })
      .then((unlisten) => {
        if (disposed) {
          unlisten();
        } else {
          unlistenClose = unlisten;
        }
      })
      .catch(() => {
        // Ignora silenciosamente fora do runtime nativo Tauri
      });

    return () => {
      disposed = true;
      if (unlistenClose) {
        unlistenClose();
      }
    };
  }, []);

  // Garante fechamento do modal RN04 caso a sessão retorne a idle
  useEffect(() => {
    if (snapshot.status === "idle") {
      setIsCloseModalOpen(false);
    }
  }, [snapshot.status]);

  // Checkpoint periódico da sessão ativa (1s) e sincronização ao focar a aba (visibilitychange)
  useEffect(() => {
    if (snapshot.status === "idle") return;

    const checkpointTimer = setInterval(() => {
      saveActiveSessionCheckpoint();
    }, 1000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        saveActiveSessionCheckpoint();
      } else if (document.visibilityState === "visible") {
        void getSessionSnapshot()
          .then((snap) => setSnapshot(snap))
          .catch(() => {});
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(checkpointTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [snapshot.status]);

  // Loop de polling: 50ms em "running" (fluidez dos décimos .0–.9) e 200ms em "paused"
  useEffect(() => {
    if (snapshot.status === "idle") {
      return;
    }

    const pollIntervalMs = snapshot.status === "running" ? 50 : 200;

    const intervalId = setInterval(async () => {
      if (pollInFlightRef.current) return;
      pollInFlightRef.current = true;
      const versionAtStart = actionVersionRef.current;

      try {
        const nextSnap = await getSessionSnapshot();
        if (versionAtStart === actionVersionRef.current) {
          setSnapshot(nextSnap);
        }
      } catch {
        // Evita ruído transitório durante polling
      } finally {
        pollInFlightRef.current = false;
      }
    }, pollIntervalMs);

    return () => clearInterval(intervalId);
  }, [snapshot.status]);

  const handleSelectTab = (tab: AppTab) => {
    setActiveTab(tab);
    if (tab === "history") {
      getHistoryData()
        .then((data) => {
          setHistorySessions(data.sessions);
          setSubjects(data.subjects);
        })
        .catch(() => {});
    }
  };

  const flushMetadataToBackend = useCallback(
    async (rawSubject: string, rawTopic: string, currentStatus: string) => {
      if (currentStatus === "idle") return;

      const cleanSubject = rawSubject.trim();
      const cleanTopic = rawTopic.trim();

      if (!cleanSubject) {
        setSubjectError(
          "O campo Matéria não pode ficar vazio durante a sessão.",
        );
        return;
      }

      if (
        cleanSubject === lastSyncedMetadataRef.current.subject &&
        cleanTopic === lastSyncedMetadataRef.current.topic
      ) {
        return;
      }

      const epochAtStart = sessionEpochRef.current;
      try {
        await updateSessionMetadata(cleanSubject, cleanTopic);
        if (epochAtStart === sessionEpochRef.current) {
          lastSyncedMetadataRef.current = {
            subject: cleanSubject,
            topic: cleanTopic,
          };
          setSubjectError(null);
        }
      } catch (err) {
        if (epochAtStart === sessionEpochRef.current) {
          setErrorBanner(String(err));
        }
      }
    },
    [],
  );

  // RN02 — Debounce de 500ms para edição dinâmica durante o estudo
  useEffect(() => {
    if (snapshot.status === "idle") return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      void flushMetadataToBackend(subject, topic, snapshot.status);
    }, 500);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [subject, topic, snapshot.status, flushMetadataToBackend]);

  const handleSubjectChange = (nextSubject: string) => {
    setSubject(nextSubject);
    if (nextSubject.trim()) {
      setSubjectError(null);
    }
  };

  const handleMetadataCommit = (nextSubject: string, nextTopic: string) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    void flushMetadataToBackend(nextSubject, nextTopic, snapshot.status);
  };

  const handleSelectModality = async (modality: Modality) => {
    if (isBusy || isClosing) return;

    let cleanSubject = subject.trim();
    if (!cleanSubject) {
      if (snapshot.status === "idle") {
        // Sem enrolação: define matéria padrão e inicia imediatamente
        cleanSubject = "Estudo Livre";
        setSubject("Estudo Livre");
      } else {
        setSubjectError("O campo Matéria não pode ficar vazio durante a sessão.");
        subjectInputRef.current?.focus();
        return;
      }
    }

    // Notificação discreta de Modo Visitante ao iniciar contagem sem autenticação
    if (snapshot.status === "idle" && !user) {
      setShowVisitorNotice(true);
    }

    // RN03 — Clicar na modalidade já ativa em andamento não faz nada no cronômetro
    if (
      snapshot.status === "running" &&
      snapshot.activeModality === modality
    ) {
      await flushMetadataToBackend(cleanSubject, topic, snapshot.status);
      return;
    }

    setIsBusy(true);
    setErrorBanner(null);
    setSubjectError(null);
    actionVersionRef.current += 1;
    if (snapshot.status === "idle") {
      sessionEpochRef.current += 1;
    }

    try {
      const nextSnap = await startOrSwitchModality(modality, cleanSubject, topic);
      lastSyncedMetadataRef.current = {
        subject: nextSnap.subject,
        topic: nextSnap.topic,
      };
      setSnapshot(nextSnap);
    } catch (err) {
      setErrorBanner(String(err));
    } finally {
      setIsBusy(false);
    }
  };

  const handleStartDefaultSession = async () => {
    await handleSelectModality("reading");
  };

  const handleTogglePause = async () => {
    if (snapshot.status === "idle" || isBusy || isClosing) return;
    setIsBusy(true);
    setErrorBanner(null);
    actionVersionRef.current += 1;

    try {
      const nextSnap = await togglePause();
      setSnapshot(nextSnap);
    } catch (err) {
      setErrorBanner(String(err));
    } finally {
      setIsBusy(false);
    }
  };

  const handleStopSession = async () => {
    if (snapshot.status === "idle" || isBusy || isClosing) return;

    const effectiveSubject =
      subject.trim() ||
      lastSyncedMetadataRef.current.subject ||
      snapshot.subject ||
      "Estudo Livre";

    setIsBusy(true);
    setErrorBanner(null);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    try {
      await flushMetadataToBackend(effectiveSubject, topic, snapshot.status);
      sessionEpochRef.current += 1;
      actionVersionRef.current += 1;
      const updatedSummary = await stopSession();
      setSnapshot(IDLE_SNAPSHOT);
      setSubject("");
      setTopic("");
      setSubjectError(null);
      lastSyncedMetadataRef.current = { subject: "", topic: "" };
      setSubjects(updatedSummary.subjects);

      const historyData = await getHistoryData();
      setHistorySessions(historyData.sessions);
      setSubjects(historyData.subjects);
    } catch (err) {
      setErrorBanner(String(err));
    } finally {
      setIsBusy(false);
    }
  };

  const handleEditHistorySession = async (
    id: number,
    nextSubject: string,
    nextTopic: string,
  ) => {
    const updated = await updateHistorySession(id, nextSubject, nextTopic);
    setHistorySessions(updated.sessions);
    setSubjects(updated.subjects);
    setRecoveredSessions((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, subject: nextSubject.trim(), topic: nextTopic.trim() }
          : item,
      ),
    );
  };

  const handleDeleteHistorySession = async (id: number) => {
    const updated = await deleteHistorySession(id);
    setHistorySessions(updated.sessions);
    setSubjects(updated.subjects);
    setRecoveredSessions((prev) => prev.filter((item) => item.id !== id));
  };

  const handleConfirmCloseAndExit = async () => {
    if (isClosing) return;
    setIsClosing(true);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    try {
      if (snapshot.status !== "idle") {
        const effectiveSubject =
          subject.trim() ||
          lastSyncedMetadataRef.current.subject ||
          snapshot.subject ||
          "Estudo Livre";
        await flushMetadataToBackend(
          effectiveSubject,
          topic,
          snapshot.status,
        );
      }
      sessionEpochRef.current += 1;
      actionVersionRef.current += 1;
      await confirmCloseAndExit();
      // Em ambiente Web SPA, reseta o estado da UI para idle e recarrega histórico
      setSnapshot(IDLE_SNAPSHOT);
      setSubject("");
      setTopic("");
      setSubjectError(null);
      setIsCloseModalOpen(false);
      setIsClosing(false);
      const historyData = await getHistoryData();
      setHistorySessions(historyData.sessions);
      setSubjects(historyData.subjects);
    } catch (err) {
      setIsClosing(false);
      setIsCloseModalOpen(false);
      setErrorBanner(String(err));
    }
  };

  // Funções de Gestão de Usuário e Armazenamento
  const handleLoginDemo = () => {
    const logged = loginDemoUserWeb();
    setUser(logged);
    setShowVisitorNotice(false);
  };

  const handleLogout = () => {
    logoutUserWeb();
    setUser(null);
  };

  const handleUpdateStorageMode = (mode: StorageMode) => {
    setStorageConfigWeb({ mode });
    setStorageMode(mode);
    if (user) {
      setUser({ ...user, storageMode: mode });
    }
  };

  const handleUpdateGoogleClientId = (clientId: string) => {
    setStorageConfigWeb({ googleClientId: clientId });
    setGoogleClientId(clientId);
  };

  const handleExportBackup = () => {
    const jsonStr = exportDataAsJson();
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `studychrono-backup-${getLocalTodayISO()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = async (file: File): Promise<boolean> => {
    try {
      const text = await file.text();
      const success = importDataFromJson(text);
      if (success) {
        const historyData = await getHistoryData();
        setHistorySessions(historyData.sessions);
        setSubjects(historyData.subjects);
      }
      return success;
    } catch {
      return false;
    }
  };

  const todayISO = getLocalTodayISO();

  return (
    <div className="flex h-screen flex-col bg-neutral-50 text-neutral-950 select-none dark:bg-neutral-950 dark:text-neutral-100">
      {/* Cabeçalho com navegação por abas centralizada, seletor de tema e menu flutuante de usuário */}
      <header className="relative flex items-center justify-between border-b border-neutral-200 bg-white px-5 py-2.5 dark:border-neutral-800 dark:bg-neutral-900">
        {/* Wordmark limpo StudyChrono (sem ícone) */}
        <div className="flex items-center">
          <h1 className="font-serif text-xl font-normal tracking-[-0.02em] leading-none text-neutral-950 dark:text-neutral-100">
            StudyChrono
          </h1>
        </div>

        {/* Navegação entre Cronômetro e Histórico centralizada com precisão absoluta */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <nav
            role="tablist"
            aria-label="Seções do aplicativo"
            className="h-8 inline-flex items-center rounded-lg border border-neutral-300 bg-neutral-100 p-0.5 dark:border-neutral-800 dark:bg-neutral-950"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "timer"}
              onClick={() => handleSelectTab("timer")}
              className={`font-mono inline-flex h-full cursor-pointer items-center justify-center gap-1.5 rounded-md px-3.5 text-[11px] font-medium uppercase tracking-[0.08em] transition-colors ${
                activeTab === "timer"
                  ? "bg-neutral-950 text-white shadow-xs dark:bg-neutral-100 dark:text-neutral-950"
                  : "text-neutral-600 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-neutral-100"
              }`}
            >
              <Clock className="h-3.5 w-3.5" />
              Cronômetro
              {snapshot.status !== "idle" && activeTab !== "timer" && (
                <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
              )}
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "history"}
              onClick={() => handleSelectTab("history")}
              className={`font-mono inline-flex h-full cursor-pointer items-center justify-center gap-1.5 rounded-md px-3.5 text-[11px] font-medium uppercase tracking-[0.08em] transition-colors ${
                activeTab === "history"
                  ? "bg-neutral-950 text-white shadow-xs dark:bg-neutral-100 dark:text-neutral-950"
                  : "text-neutral-600 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-neutral-100"
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              Histórico
            </button>
          </nav>
        </div>

        {/* Controles do topo à direita: Tema Claro/Escuro e Perfil do Usuário com mesma altura h-8 */}
        <div className="flex items-center gap-2">
          {/* Seletor de Tema Claro / Escuro */}
          <div
            role="group"
            aria-label="Tema de aparência"
            className="h-8 inline-flex items-center rounded-lg border border-neutral-300 bg-neutral-100 p-0.5 dark:border-neutral-800 dark:bg-neutral-950"
          >
            <button
              type="button"
              aria-pressed={theme === "light"}
              onClick={() => setTheme("light")}
              className={`font-mono inline-flex h-full cursor-pointer items-center justify-center gap-1 rounded-md border px-2.5 text-[11px] font-medium uppercase tracking-[0.06em] transition-colors ${
                theme === "light"
                  ? "border-neutral-300 bg-white text-neutral-950 shadow-xs"
                  : "border-transparent text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200"
              }`}
            >
              <Sun className="h-3.5 w-3.5" />
              Claro
            </button>
            <button
              type="button"
              aria-pressed={theme === "dark"}
              onClick={() => setTheme("dark")}
              className={`font-mono inline-flex h-full cursor-pointer items-center justify-center gap-1 rounded-md border px-2.5 text-[11px] font-medium uppercase tracking-[0.06em] transition-colors ${
                theme === "dark"
                  ? "border-neutral-700 bg-neutral-800 text-white shadow-xs"
                  : "border-transparent text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200"
              }`}
            >
              <Moon className="h-3.5 w-3.5" />
              Escuro
            </button>
          </div>

          {/* Botão de Perfil do Usuário & Caixa Flutuante (Menu Popover) */}
          <div className="relative flex items-center h-8">
            <button
              type="button"
              aria-label="Perfil do usuário e configurações de armazenamento"
              aria-expanded={isUserMenuOpen}
              aria-haspopup="menu"
              onClick={() => setIsUserMenuOpen((prev) => !prev)}
              className="font-mono h-8 inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-neutral-300 bg-neutral-100 px-3 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-800 transition-colors hover:bg-neutral-200 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-200 dark:hover:bg-neutral-900"
            >
              <User className="h-3.5 w-3.5 text-neutral-900 dark:text-neutral-100" />
              <span>{user ? user.name.split(" ")[0] : "Entrar"}</span>
              {user && (
                <span
                  className="h-1.5 w-1.5 rounded-full bg-neutral-900 dark:bg-neutral-100"
                  title="Usuário conectado"
                />
              )}
            </button>

            <UserMenuPopover
              isOpen={isUserMenuOpen}
              user={user}
              onClose={() => setIsUserMenuOpen(false)}
              onOpenSection={(section) => {
                setIsUserMenuOpen(false);
                setActiveModalSection(section);
              }}
              onLoginDemo={handleLoginDemo}
              onLogout={handleLogout}
            />
          </div>
        </div>
      </header>

      {/* Conteúdo principal */}
      <main className="mx-auto flex w-full max-w-5xl flex-1 min-h-0 flex-col gap-3 px-5 py-3">
        {/* Notificação de Modo Visitante ao iniciar contagem sem autenticação */}
        {showVisitorNotice && !user && (
          <div
            role="status"
            aria-live="polite"
            className="font-sans flex items-center justify-between gap-3 rounded-lg border border-neutral-300 bg-neutral-100 px-3.5 py-2 text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-neutral-600 dark:text-neutral-400" />
              <span>
                <strong>Modo Visitante:</strong> Seus dados não serão armazenados na nuvem (dados não serão armazenados, por favor faça login para salvar seu histórico e sincronizar).
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setActiveModalSection("profile")}
                className="font-mono cursor-pointer rounded border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.05em] text-white hover:bg-neutral-800 dark:border-neutral-200 dark:bg-neutral-100 dark:text-neutral-950 dark:hover:bg-neutral-200"
              >
                Fazer Login
              </button>
              <button
                type="button"
                aria-label="Dispensar aviso de visitante"
                onClick={() => setShowVisitorNotice(false)}
                className="cursor-pointer rounded p-0.5 text-neutral-600 hover:bg-neutral-200 hover:text-neutral-950 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Aviso de sessão auto-recuperada (RN05) */}
        {recoveredSessions.length > 0 && (
          <div className="font-sans flex items-center justify-between gap-3 rounded-lg border border-neutral-400 bg-neutral-100 px-3.5 py-2 text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100">
            <span>
              Recuperação automática:{" "}
              <strong className="font-semibold">{recoveredSessions.length}</strong>{" "}
              {recoveredSessions.length === 1
                ? "sessão interrompida foi salva"
                : "sessões interrompidas foram salvas"}{" "}
              no histórico (
              {recoveredSessions
                .map((s) =>
                  s.studyDate !== todayISO
                    ? `${s.subject} em ${formatDateBR(s.studyDate)}: ${formatSeconds(s.totalActiveSec)}`
                    : `${s.subject}: ${formatSeconds(s.totalActiveSec)}`,
                )
                .join(", ")}
              ).
            </span>
            <button
              type="button"
              aria-label="Fechar aviso"
              onClick={() => setRecoveredSessions([])}
              className="cursor-pointer rounded p-0.5 text-neutral-600 hover:bg-neutral-200 hover:text-neutral-950 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Aviso de erro operacional */}
        {errorBanner && (
          <div className="font-sans flex items-center justify-between gap-3 rounded-lg border border-neutral-900 bg-neutral-200/80 px-3.5 py-2 text-xs font-medium text-neutral-950 dark:border-neutral-200 dark:bg-neutral-900 dark:text-neutral-100">
            <span>{errorBanner}</span>
            <button
              type="button"
              aria-label="Fechar erro"
              onClick={() => setErrorBanner(null)}
              className="cursor-pointer rounded p-0.5 text-neutral-700 hover:bg-neutral-300 hover:text-black dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {activeTab === "timer" ? (
          <div className="flex flex-1 min-h-0 overflow-y-auto">
            <div className="mx-auto my-auto flex w-full max-w-3xl flex-col gap-3 py-0.5">
              {/* Entrada de Matéria e Conteúdo */}
              <SubjectInput
                subject={subject}
                topic={topic}
                subjects={subjects}
                subjectError={subjectError}
                subjectInputRef={subjectInputRef}
                onSubjectChange={handleSubjectChange}
                onTopicChange={setTopic}
                onMetadataCommit={handleMetadataCommit}
              />

              {/* Visor Principal Minimalista */}
              <TimerDisplay snapshot={snapshot} />

              {/* Grid de Modalidades + Barra de Controle */}
              <div className="flex flex-col gap-3 rounded-xl border border-neutral-300 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
                <ModalityGrid
                  snapshot={snapshot}
                  disabled={isBusy || isClosing}
                  onSelectModality={handleSelectModality}
                />
                <ControlBar
                  status={snapshot.status}
                  isBusy={isBusy || isClosing}
                  onTogglePause={handleTogglePause}
                  onStopSession={handleStopSession}
                  onStartSession={handleStartDefaultSession}
                />
              </div>
            </div>
          </div>
        ) : (
          <HistoryReport
            sessions={historySessions}
            subjects={subjects}
            isCloseModalOpen={isCloseModalOpen}
            onEditSession={handleEditHistorySession}
            onDeleteSession={handleDeleteHistorySession}
          />
        )}
      </main>

      {/* Modal de bloqueio ao tentar fechar com sessão em andamento (RN04) */}
      <CloseConfirmModal
        isOpen={isCloseModalOpen}
        isClosing={isClosing}
        onContinueStudying={() => setIsCloseModalOpen(false)}
        onConfirmClose={handleConfirmCloseAndExit}
      />

      {/* Modal sóbrio de perfil do usuário e configurações de armazenamento */}
      <UserProfileModal
        isOpen={activeModalSection !== null}
        activeSection={activeModalSection ?? "all"}
        user={user}
        storageMode={storageMode}
        googleClientId={googleClientId}
        onClose={() => setActiveModalSection(null)}
        onLoginDemo={handleLoginDemo}
        onLogout={handleLogout}
        onUpdateStorageMode={handleUpdateStorageMode}
        onUpdateGoogleClientId={handleUpdateGoogleClientId}
        onExportBackup={handleExportBackup}
        onImportBackup={handleImportBackup}
      />
    </div>
  );
}

export default App;
