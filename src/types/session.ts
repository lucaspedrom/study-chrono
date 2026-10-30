export type Modality = "reading" | "media" | "review" | "questions";

export type TrackerStatus = "idle" | "running" | "paused";

export type RecordStatus = "IN_PROGRESS" | "COMPLETED" | "RECOVERED";

export type AppTab = "timer" | "history";

export type ThemeMode = "light" | "dark";

export type StorageMode = "local" | "drive";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  isDemo?: boolean;
  provider: "guest" | "demo" | "google" | "email";
  storageMode: StorageMode;
  googleClientId?: string;
}

export interface SessionSnapshot {
  status: TrackerStatus;
  activeModality: Modality | null;
  lastModality: Modality | null;
  subject: string;
  topic: string;
  readingSec: number;
  mediaSec: number;
  reviewSec: number;
  questionsSec: number;
  pausedSec: number;
  totalActiveSec: number;
  totalActiveMs: number;
  currentSliceSec: number;
}

export interface StudySessionRecord {
  id: number;
  studyDate: string;
  startTime: string;
  endTime: string | null;
  subject: string;
  topic: string;
  timeReadingSec: number;
  timeMediaSec: number;
  timeReviewSec: number;
  timeQuestionsSec: number;
  timePausedSec: number;
  totalActiveSec: number;
  status: RecordStatus;
}

export interface DailySummary {
  studyDate: string;
  sessions: StudySessionRecord[];
  totalReadingSec: number;
  totalMediaSec: number;
  totalReviewSec: number;
  totalQuestionsSec: number;
  totalPausedSec: number;
  totalActiveSec: number;
  subjects: string[];
}

export interface HistoryData {
  sessions: StudySessionRecord[];
  subjects: string[];
}

export interface InitialData {
  subjects: string[];
  dailySummary: DailySummary;
  historySessions: StudySessionRecord[];
  snapshot: SessionSnapshot;
  recoveredSessions: StudySessionRecord[];
}

export const MODALITY_LABELS: Record<Modality, string> = {
  reading: "Leitura",
  media: "Videoaula / Áudio",
  review: "Revisão",
  questions: "Questões",
};

export const IDLE_SNAPSHOT: SessionSnapshot = {
  status: "idle",
  activeModality: null,
  lastModality: null,
  subject: "",
  topic: "",
  readingSec: 0,
  mediaSec: 0,
  reviewSec: 0,
  questionsSec: 0,
  pausedSec: 0,
  totalActiveSec: 0,
  totalActiveMs: 0,
  currentSliceSec: 0,
};
