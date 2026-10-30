import type {
  DailySummary,
  HistoryData,
  InitialData,
  Modality,
  RecordStatus,
  SessionSnapshot,
  StudySessionRecord,
  TrackerStatus,
  UserProfile,
  StorageMode,
} from "../types/session";
import { IDLE_SNAPSHOT } from "../types/session";

export const STORAGE_KEYS = {
  ACTIVE_SESSION: "study_chrono_active_session",
  HISTORY: "study_chrono_history",
  SUBJECTS: "study_chrono_subjects",
  THEME: "study_chrono_theme",
  USER: "study_chrono_user",
  STORAGE_MODE: "study_chrono_storage_mode",
  GOOGLE_CLIENT_ID: "study_chrono_google_client_id",
  GOOGLE_ACCESS_TOKEN: "study_chrono_google_access_token",
  ACCOUNTS: "study_chrono_accounts",
  LAST_DRIVE_SYNC: "study_chrono_last_drive_sync",
} as const;

export interface ActiveSessionData {
  id: number;
  studyDate: string; // YYYY-MM-DD
  startTime: string; // ISO
  subject: string;
  topic: string;
  status: TrackerStatus;
  activeModality: Modality | null;
  lastModality: Modality | null;
  sliceStartTime: number; // timestamp ms
  readingMs: number;
  mediaMs: number;
  reviewMs: number;
  questionsMs: number;
  pausedMs: number;
  lastHeartbeat: number; // timestamp ms
}

const DEFAULT_SUBJECTS: string[] = [
  "Direito Administrativo",
  "Direito Constitucional",
  "Português",
  "Raciocínio Lógico",
];

const memoryStore = new Map<string, string>();

function getStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  if (typeof globalThis !== "undefined" && (globalThis as any).localStorage) {
    return (globalThis as any).localStorage;
  }
  return null;
}

export function safeGetItem(key: string): string | null {
  const storage = getStorage();
  if (storage) {
    try {
      return storage.getItem(key);
    } catch {
      // Fallback para memória se o acesso ao localStorage for bloqueado
    }
  }
  return memoryStore.get(key) ?? null;
}

export function safeSetItem(key: string, value: string): void {
  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(key, value);
      return;
    } catch {
      // Fallback para memória
    }
  }
  memoryStore.set(key, value);
}

export function safeRemoveItem(key: string): void {
  const storage = getStorage();
  if (storage) {
    try {
      storage.removeItem(key);
      return;
    } catch {
      // Fallback para memória
    }
  }
  memoryStore.delete(key);
}

let inMemoryActiveSession: ActiveSessionData | null = null;
let isInMemoryLoaded = false;

export function clearMemoryStoreForTesting(): void {
  memoryStore.clear();
  inMemoryActiveSession = null;
  isInMemoryLoaded = false;
}


export function getLocalTodayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function loadHistorySessions(): StudySessionRecord[] {
  const raw = safeGetItem(STORAGE_KEYS.HISTORY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // Fallback para array vazio em caso de corrupção
  }
  return [];
}

export function saveHistorySessions(sessions: StudySessionRecord[]): void {
  safeSetItem(STORAGE_KEYS.HISTORY, JSON.stringify(sessions));
}

export function loadSubjects(sessions?: StudySessionRecord[]): string[] {
  const currentSessions = sessions ?? loadHistorySessions();
  const sessionSubjects = currentSessions
    .map((s) => s.subject.trim())
    .filter((s) => s.length > 0);

  const customRaw = safeGetItem(STORAGE_KEYS.SUBJECTS);
  let customSubjects: string[] = [];
  if (customRaw) {
    try {
      const parsed = JSON.parse(customRaw);
      if (Array.isArray(parsed)) {
        customSubjects = parsed.filter((s) => typeof s === "string" && s.trim().length > 0);
      }
    } catch {
      // Ignora erro
    }
  }

  const combined = Array.from(
    new Set([...DEFAULT_SUBJECTS, ...customSubjects, ...sessionSubjects]),
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));

  return combined;
}

export function saveCustomSubject(subject: string): void {
  const clean = subject.trim();
  if (!clean) return;
  const existing = loadSubjects();
  if (!existing.includes(clean)) {
    const updated = [...existing, clean];
    safeSetItem(STORAGE_KEYS.SUBJECTS, JSON.stringify(updated));
  }
}

export function loadActiveSession(): ActiveSessionData | null {
  if (isInMemoryLoaded) {
    return inMemoryActiveSession;
  }
  const raw = safeGetItem(STORAGE_KEYS.ACTIVE_SESSION);
  if (!raw) {
    inMemoryActiveSession = null;
    isInMemoryLoaded = true;
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as ActiveSessionData;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.status === "string" &&
      parsed.status !== "idle"
    ) {
      inMemoryActiveSession = parsed;
      isInMemoryLoaded = true;
      return parsed;
    }
  } catch {
    // Ignora formato inválido
  }
  inMemoryActiveSession = null;
  isInMemoryLoaded = true;
  return null;
}

export function saveActiveSession(session: ActiveSessionData | null): void {
  inMemoryActiveSession = session;
  isInMemoryLoaded = true;
  if (!session || session.status === "idle") {
    safeRemoveItem(STORAGE_KEYS.ACTIVE_SESSION);
  } else {
    safeSetItem(STORAGE_KEYS.ACTIVE_SESSION, JSON.stringify(session));
  }
}

/**
 * Calcula o snapshot em tempo real usando diferencial de timestamps absolutos (Date.now()).
 * Nunca depende de contagem de ticks de intervalo, garantindo precisão mesmo com throttling de abas.
 */
export function computeSnapshot(active: ActiveSessionData | null): SessionSnapshot {
  if (!active || active.status === "idle") {
    return IDLE_SNAPSHOT;
  }

  const now = Date.now();
  const sliceElapsedMs = Math.max(0, now - active.sliceStartTime);

  const isRunning = active.status === "running";
  const isPaused = active.status === "paused";

  const readingMs =
    active.readingMs +
    (isRunning && active.activeModality === "reading" ? sliceElapsedMs : 0);
  const mediaMs =
    active.mediaMs +
    (isRunning && active.activeModality === "media" ? sliceElapsedMs : 0);
  const reviewMs =
    active.reviewMs +
    (isRunning && active.activeModality === "review" ? sliceElapsedMs : 0);
  const questionsMs =
    active.questionsMs +
    (isRunning && active.activeModality === "questions" ? sliceElapsedMs : 0);

  const pausedMs = active.pausedMs + (isPaused ? sliceElapsedMs : 0);

  const totalActiveMs = readingMs + mediaMs + reviewMs + questionsMs;
  const totalActiveSec = Math.floor(totalActiveMs / 1000);

  const readingSec = Math.floor(readingMs / 1000);
  const mediaSec = Math.floor(mediaMs / 1000);
  const reviewSec = Math.floor(reviewMs / 1000);
  const questionsSec = Math.floor(questionsMs / 1000);
  const pausedSec = Math.floor(pausedMs / 1000);
  const currentSliceSec = Math.floor(sliceElapsedMs / 1000);

  return {
    status: active.status,
    activeModality: active.activeModality,
    lastModality: active.lastModality,
    subject: active.subject,
    topic: active.topic,
    readingSec,
    mediaSec,
    reviewSec,
    questionsSec,
    pausedSec,
    totalActiveSec,
    totalActiveMs,
    currentSliceSec,
  };
}

/**
 * Salva o checkpoint da sessão ativa atualizando o timestamp de heartbeat.
 * Chamado periodicamente (1s) e nos eventos beforeunload e visibilitychange.
 */
export function saveActiveSessionCheckpoint(): void {
  const active = loadActiveSession();
  if (!active || active.status === "idle") return;

  const now = Date.now();
  const elapsed = Math.max(0, now - active.sliceStartTime);

  if (active.status === "running" && active.activeModality) {
    if (active.activeModality === "reading") active.readingMs += elapsed;
    else if (active.activeModality === "media") active.mediaMs += elapsed;
    else if (active.activeModality === "review") active.reviewMs += elapsed;
    else if (active.activeModality === "questions") active.questionsMs += elapsed;
    active.sliceStartTime = now;
  } else if (active.status === "paused") {
    active.pausedMs += elapsed;
    active.sliceStartTime = now;
  }

  active.lastHeartbeat = now;
  saveActiveSession(active);
}

/**
 * Inicialização Web: detecta sessões interrompidas inesperadamente (ex: fechamento de aba,
 * queda de energia ou crash) e as converte automaticamente para RECOVERED ("Encerramento inesperado").
 */
export function getInitialDataWeb(): InitialData {
  isInMemoryLoaded = false;
  let historySessions = loadHistorySessions();
  const recoveredSessions: StudySessionRecord[] = [];

  const storedActive = loadActiveSession();

  if (storedActive && storedActive.status !== "idle") {
    // Sessão ativa encontrada no armazenamento sem encerramento limpo:
    // Calcula o tempo decorrido até o último checkpoint registrado
    const checkpointTime = storedActive.lastHeartbeat || storedActive.sliceStartTime;
    const sliceDelta = Math.max(0, checkpointTime - storedActive.sliceStartTime);

    let readingMs = storedActive.readingMs;
    let mediaMs = storedActive.mediaMs;
    let reviewMs = storedActive.reviewMs;
    let questionsMs = storedActive.questionsMs;
    let pausedMs = storedActive.pausedMs;

    if (storedActive.status === "running" && storedActive.activeModality) {
      if (storedActive.activeModality === "reading") readingMs += sliceDelta;
      else if (storedActive.activeModality === "media") mediaMs += sliceDelta;
      else if (storedActive.activeModality === "review") reviewMs += sliceDelta;
      else if (storedActive.activeModality === "questions") questionsMs += sliceDelta;
    } else if (storedActive.status === "paused") {
      pausedMs += sliceDelta;
    }

    const totalActiveMs = readingMs + mediaMs + reviewMs + questionsMs;
    const totalActiveSec = Math.floor(totalActiveMs / 1000);

    // Se houver tempo de estudo registrado, salva como sessão recuperada
    if (totalActiveSec > 0) {
      const recoveredRecord: StudySessionRecord = {
        id: storedActive.id || Date.now(),
        studyDate: storedActive.studyDate || getLocalTodayISO(),
        startTime: storedActive.startTime,
        endTime: new Date(checkpointTime).toISOString(),
        subject: storedActive.subject || "Estudo sem Matéria",
        topic: storedActive.topic || "",
        timeReadingSec: Math.floor(readingMs / 1000),
        timeMediaSec: Math.floor(mediaMs / 1000),
        timeReviewSec: Math.floor(reviewMs / 1000),
        timeQuestionsSec: Math.floor(questionsMs / 1000),
        timePausedSec: Math.floor(pausedMs / 1000),
        totalActiveSec,
        status: "RECOVERED" as RecordStatus,
      };

      recoveredSessions.push(recoveredRecord);
      historySessions = [recoveredRecord, ...historySessions];
      saveHistorySessions(historySessions);
    }

    // Limpa a sessão ativa corrompida/interrompida
    saveActiveSession(null);
  }

  const subjects = loadSubjects(historySessions);
  const todayISO = getLocalTodayISO();
  const todaySessions = historySessions.filter((s) => s.studyDate === todayISO);

  const dailySummary: DailySummary = {
    studyDate: todayISO,
    sessions: todaySessions,
    totalReadingSec: todaySessions.reduce((acc, s) => acc + s.timeReadingSec, 0),
    totalMediaSec: todaySessions.reduce((acc, s) => acc + s.timeMediaSec, 0),
    totalReviewSec: todaySessions.reduce((acc, s) => acc + s.timeReviewSec, 0),
    totalQuestionsSec: todaySessions.reduce((acc, s) => acc + s.timeQuestionsSec, 0),
    totalPausedSec: todaySessions.reduce((acc, s) => acc + s.timePausedSec, 0),
    totalActiveSec: todaySessions.reduce((acc, s) => acc + s.totalActiveSec, 0),
    subjects,
  };

  return {
    subjects,
    dailySummary,
    historySessions,
    snapshot: IDLE_SNAPSHOT,
    recoveredSessions,
  };
}

export function getSessionSnapshotWeb(): SessionSnapshot {
  const active = loadActiveSession();
  if (active && active.status !== "idle") {
    active.lastHeartbeat = Date.now();
  }
  return computeSnapshot(active);
}

export function startOrSwitchModalityWeb(
  modality: Modality,
  subject: string,
  topic: string,
): SessionSnapshot {
  const cleanSubject = subject.trim() || "Estudo Livre";
  const cleanTopic = topic.trim();
  const now = Date.now();

  let active = loadActiveSession();

  if (!active || active.status === "idle") {
    // Nova sessão
    active = {
      id: Date.now(),
      studyDate: getLocalTodayISO(),
      startTime: new Date().toISOString(),
      subject: cleanSubject,
      topic: cleanTopic,
      status: "running",
      activeModality: modality,
      lastModality: modality,
      sliceStartTime: now,
      readingMs: 0,
      mediaMs: 0,
      reviewMs: 0,
      questionsMs: 0,
      pausedMs: 0,
      lastHeartbeat: now,
    };
    saveCustomSubject(cleanSubject);
  } else if (active.status === "running") {
    if (active.activeModality === modality) {
      // Mesma modalidade: atualiza metadados sem interromper a fatia
      active.subject = cleanSubject;
      active.topic = cleanTopic;
      active.lastHeartbeat = now;
      saveActiveSession(active);
      return computeSnapshot(active);
    }

    // Consolida fatia anterior
    const elapsed = Math.max(0, now - active.sliceStartTime);
    if (active.activeModality === "reading") active.readingMs += elapsed;
    else if (active.activeModality === "media") active.mediaMs += elapsed;
    else if (active.activeModality === "review") active.reviewMs += elapsed;
    else if (active.activeModality === "questions") active.questionsMs += elapsed;

    active.activeModality = modality;
    active.lastModality = modality;
    active.sliceStartTime = now;
    active.subject = cleanSubject;
    active.topic = cleanTopic;
    active.lastHeartbeat = now;
    saveCustomSubject(cleanSubject);
  } else if (active.status === "paused") {
    // Retoma de pausa direto na modalidade clicada
    const pauseElapsed = Math.max(0, now - active.sliceStartTime);
    active.pausedMs += pauseElapsed;

    active.status = "running";
    active.activeModality = modality;
    active.lastModality = modality;
    active.sliceStartTime = now;
    active.subject = cleanSubject;
    active.topic = cleanTopic;
    active.lastHeartbeat = now;
    saveCustomSubject(cleanSubject);
  }

  saveActiveSession(active);
  return computeSnapshot(active);
}

export function togglePauseWeb(): SessionSnapshot {
  const active = loadActiveSession();
  if (!active || active.status === "idle") {
    return IDLE_SNAPSHOT;
  }

  const now = Date.now();
  const elapsed = Math.max(0, now - active.sliceStartTime);

  if (active.status === "running") {
    // Pausar
    if (active.activeModality === "reading") active.readingMs += elapsed;
    else if (active.activeModality === "media") active.mediaMs += elapsed;
    else if (active.activeModality === "review") active.reviewMs += elapsed;
    else if (active.activeModality === "questions") active.questionsMs += elapsed;

    active.lastModality = active.activeModality;
    active.activeModality = null;
    active.status = "paused";
    active.sliceStartTime = now;
    active.lastHeartbeat = now;
  } else if (active.status === "paused") {
    // Retomar
    active.pausedMs += elapsed;
    active.status = "running";
    active.activeModality = active.lastModality || "reading";
    active.sliceStartTime = now;
    active.lastHeartbeat = now;
  }

  saveActiveSession(active);
  return computeSnapshot(active);
}

export function updateSessionMetadataWeb(subject: string, topic: string): void {
  const active = loadActiveSession();
  if (!active || active.status === "idle") return;

  active.subject = subject.trim() || active.subject || "Estudo Livre";
  active.topic = topic.trim();
  active.lastHeartbeat = Date.now();
  saveActiveSession(active);
  saveCustomSubject(active.subject);
}

export function stopSessionWeb(): DailySummary {
  const active = loadActiveSession();
  if (!active || active.status === "idle") {
    const history = loadHistorySessions();
    const subjects = loadSubjects(history);
    const todayISO = getLocalTodayISO();
    const todaySessions = history.filter((s) => s.studyDate === todayISO);
    return {
      studyDate: todayISO,
      sessions: todaySessions,
      totalReadingSec: 0,
      totalMediaSec: 0,
      totalReviewSec: 0,
      totalQuestionsSec: 0,
      totalPausedSec: 0,
      totalActiveSec: 0,
      subjects,
    };
  }

  const now = Date.now();
  const elapsed = Math.max(0, now - active.sliceStartTime);

  let readingMs = active.readingMs;
  let mediaMs = active.mediaMs;
  let reviewMs = active.reviewMs;
  let questionsMs = active.questionsMs;
  let pausedMs = active.pausedMs;

  if (active.status === "running" && active.activeModality) {
    if (active.activeModality === "reading") readingMs += elapsed;
    else if (active.activeModality === "media") mediaMs += elapsed;
    else if (active.activeModality === "review") reviewMs += elapsed;
    else if (active.activeModality === "questions") questionsMs += elapsed;
  } else if (active.status === "paused") {
    pausedMs += elapsed;
  }

  const totalActiveMs = readingMs + mediaMs + reviewMs + questionsMs;
  const totalActiveSec = Math.floor(totalActiveMs / 1000);

  const completedRecord: StudySessionRecord = {
    id: active.id || Date.now(),
    studyDate: active.studyDate || getLocalTodayISO(),
    startTime: active.startTime,
    endTime: new Date().toISOString(),
    subject: active.subject.trim() || "Estudo sem Matéria",
    topic: active.topic.trim(),
    timeReadingSec: Math.floor(readingMs / 1000),
    timeMediaSec: Math.floor(mediaMs / 1000),
    timeReviewSec: Math.floor(reviewMs / 1000),
    timeQuestionsSec: Math.floor(questionsMs / 1000),
    timePausedSec: Math.floor(pausedMs / 1000),
    totalActiveSec,
    status: "COMPLETED",
  };

  const existingHistory = loadHistorySessions();
  const updatedHistory = [completedRecord, ...existingHistory];
  saveHistorySessions(updatedHistory);
  saveCustomSubject(completedRecord.subject);

  // Limpa sessão ativa
  saveActiveSession(null);

  const todayISO = getLocalTodayISO();
  const todaySessions = updatedHistory.filter((s) => s.studyDate === todayISO);
  const subjects = loadSubjects(updatedHistory);

  return {
    studyDate: todayISO,
    sessions: todaySessions,
    totalReadingSec: todaySessions.reduce((acc, s) => acc + s.timeReadingSec, 0),
    totalMediaSec: todaySessions.reduce((acc, s) => acc + s.timeMediaSec, 0),
    totalReviewSec: todaySessions.reduce((acc, s) => acc + s.timeReviewSec, 0),
    totalQuestionsSec: todaySessions.reduce((acc, s) => acc + s.timeQuestionsSec, 0),
    totalPausedSec: todaySessions.reduce((acc, s) => acc + s.timePausedSec, 0),
    totalActiveSec: todaySessions.reduce((acc, s) => acc + s.totalActiveSec, 0),
    subjects,
  };
}

export function getHistoryDataWeb(): HistoryData {
  const sessions = loadHistorySessions();
  const subjects = loadSubjects(sessions);
  return { sessions, subjects };
}

export function updateHistorySessionWeb(
  id: number,
  subject: string,
  topic: string,
): HistoryData {
  const cleanSubject = subject.trim();
  const cleanTopic = topic.trim();
  const existing = loadHistorySessions();

  const updated = existing.map((s) =>
    s.id === id ? { ...s, subject: cleanSubject, topic: cleanTopic } : s,
  );

  saveHistorySessions(updated);
  saveCustomSubject(cleanSubject);
  const subjects = loadSubjects(updated);
  return { sessions: updated, subjects };
}

export function deleteHistorySessionWeb(id: number): HistoryData {
  const existing = loadHistorySessions();
  const updated = existing.filter((s) => s.id !== id);
  saveHistorySessions(updated);
  const subjects = loadSubjects(updated);
  return { sessions: updated, subjects };
}

export function confirmCloseAndExitWeb(): void {
  // Em ambiente web, finaliza a sessão se houver e limpa o ativo
  const active = loadActiveSession();
  if (active && active.status !== "idle") {
    stopSessionWeb();
  }
}

// ==========================================
// Gestão de Usuário e Armazenamento (Web)
// ==========================================

export function getUserProfileWeb(): UserProfile | null {
  const raw = safeGetItem(STORAGE_KEYS.USER);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
}

export function setUserProfileWeb(profile: UserProfile | null): void {
  if (!profile) {
    safeRemoveItem(STORAGE_KEYS.USER);
  } else {
    safeSetItem(STORAGE_KEYS.USER, JSON.stringify(profile));
  }
}

export function loginDemoUserWeb(): UserProfile {
  const demoUser: UserProfile = {
    id: "demo_user_1",
    name: "Estudante Demonstração",
    email: "estudante.demo@studychrono.web",
    isDemo: true,
    provider: "demo",
    storageMode: getStorageConfigWeb().mode,
  };
  setUserProfileWeb(demoUser);
  return demoUser;
}

export function logoutUserWeb(): void {
  setUserProfileWeb(null);
}

export function getStorageConfigWeb(): {
  mode: StorageMode;
  googleClientId: string;
} {
  const rawMode = safeGetItem(STORAGE_KEYS.STORAGE_MODE) as StorageMode | null;
  const mode: StorageMode = rawMode === "drive" ? "drive" : "local";
  const googleClientId = safeGetItem(STORAGE_KEYS.GOOGLE_CLIENT_ID) || "";
  return { mode, googleClientId };
}

export function setStorageConfigWeb(config: {
  mode?: StorageMode;
  googleClientId?: string;
}): void {
  if (config.mode) {
    safeSetItem(STORAGE_KEYS.STORAGE_MODE, config.mode);
    const user = getUserProfileWeb();
    if (user) {
      user.storageMode = config.mode;
      setUserProfileWeb(user);
    }
  }
  if (typeof config.googleClientId === "string") {
    safeSetItem(STORAGE_KEYS.GOOGLE_CLIENT_ID, config.googleClientId.trim());
  }
}

export function exportDataAsJson(): string {
  const history = loadHistorySessions();
  const subjects = loadSubjects(history);
  const user = getUserProfileWeb();
  const storageConfig = getStorageConfigWeb();

  const payload = {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    user,
    storageConfig,
    subjects,
    history,
  };

  return JSON.stringify(payload, null, 2);
}

export function importDataFromJson(jsonString: string): boolean {
  try {
    const data = JSON.parse(jsonString);
    if (data && Array.isArray(data.history)) {
      saveHistorySessions(data.history);
      if (Array.isArray(data.subjects)) {
        safeSetItem(STORAGE_KEYS.SUBJECTS, JSON.stringify(data.subjects));
      }
      return true;
    }
  } catch {
    // Erro no JSON
  }
  return false;
}
