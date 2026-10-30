import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  DailySummary,
  HistoryData,
  InitialData,
  Modality,
  SessionSnapshot,
} from "../types/session";
import {
  confirmCloseAndExitWeb,
  deleteHistorySessionWeb,
  getHistoryDataWeb,
  getInitialDataWeb,
  getSessionSnapshotWeb,
  saveActiveSessionCheckpoint,
  startOrSwitchModalityWeb,
  stopSessionWeb,
  togglePauseWeb,
  updateHistorySessionWeb,
  updateSessionMetadataWeb,
} from "./webTracker";

export {
  exportDataAsJson,
  getStorageConfigWeb,
  getUserProfileWeb,
  importDataFromJson,
  loginDemoUserWeb,
  logoutUserWeb,
  saveActiveSessionCheckpoint,
  setStorageConfigWeb,
  setUserProfileWeb,
} from "./webTracker";

/**
 * Detecta se a aplicação está rodando no contêiner desktop nativo Tauri
 * ou diretamente como Aplicação Web (SPA) em um navegador moderno.
 */
export function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
  );
}

export async function getInitialData(): Promise<InitialData> {
  if (!isTauri()) {
    return getInitialDataWeb();
  }
  return invoke<InitialData>("get_initial_data");
}

export async function getSessionSnapshot(): Promise<SessionSnapshot> {
  if (!isTauri()) {
    return getSessionSnapshotWeb();
  }
  return invoke<SessionSnapshot>("get_session_snapshot");
}

export async function startOrSwitchModality(
  modality: Modality,
  subject: string,
  topic: string,
): Promise<SessionSnapshot> {
  if (!isTauri()) {
    return startOrSwitchModalityWeb(modality, subject, topic);
  }
  return invoke<SessionSnapshot>("start_or_switch_modality", {
    modality,
    subject,
    topic,
  });
}

export async function togglePause(): Promise<SessionSnapshot> {
  if (!isTauri()) {
    return togglePauseWeb();
  }
  return invoke<SessionSnapshot>("toggle_pause");
}

export async function updateSessionMetadata(
  subject: string,
  topic: string,
): Promise<void> {
  if (!isTauri()) {
    updateSessionMetadataWeb(subject, topic);
    return;
  }
  return invoke<void>("update_session_metadata", {
    subject,
    topic,
  });
}

export async function stopSession(): Promise<DailySummary> {
  if (!isTauri()) {
    return stopSessionWeb();
  }
  return invoke<DailySummary>("stop_session");
}

export async function getHistoryData(): Promise<HistoryData> {
  if (!isTauri()) {
    return getHistoryDataWeb();
  }
  return invoke<HistoryData>("get_history_data");
}

export async function updateHistorySession(
  id: number,
  subject: string,
  topic: string,
): Promise<HistoryData> {
  if (!isTauri()) {
    return updateHistorySessionWeb(id, subject, topic);
  }
  return invoke<HistoryData>("update_history_session", {
    id,
    subject,
    topic,
  });
}

export async function deleteHistorySession(id: number): Promise<HistoryData> {
  if (!isTauri()) {
    return deleteHistorySessionWeb(id);
  }
  return invoke<HistoryData>("delete_history_session", { id });
}

export async function confirmCloseAndExit(): Promise<void> {
  if (!isTauri()) {
    confirmCloseAndExitWeb();
    return;
  }
  return invoke<void>("confirm_close_and_exit");
}

export async function onCloseRequested(
  callback: () => void,
): Promise<UnlistenFn> {
  if (!isTauri()) {
    if (typeof window === "undefined") {
      return () => {};
    }

    const beforeUnloadHandler = (e: BeforeUnloadEvent) => {
      saveActiveSessionCheckpoint();
      callback();
      // Em navegadores web, o diálogo nativo é solicitado ao setar returnValue
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", beforeUnloadHandler);

    return () => {
      window.removeEventListener("beforeunload", beforeUnloadHandler);
    };
  }

  return listen("close-requested", () => {
    callback();
  });
}
