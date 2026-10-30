import {
  loadHistorySessions,
  saveHistorySessions,
  loadSubjects,
  safeSetItem,
  STORAGE_KEYS,
} from "./webTracker";
import type { StudySessionRecord } from "../types/session";

declare global {
  interface Window {
    google?: any;
  }
}

const DRIVE_FILE_NAME = "studychrono_data.json";
const GOOGLE_DRIVE_SCOPE =
  "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email";

let cachedToken: string | null = null;

export function getCachedGoogleToken(): string | null {
  if (cachedToken) return cachedToken;
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      cachedToken = window.sessionStorage.getItem("study_chrono_google_token");
    }
  } catch {
    // sessionStorage indisponível
  }
  return cachedToken;
}

export function setCachedGoogleToken(token: string | null): void {
  cachedToken = token;
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      if (token) {
        window.sessionStorage.setItem("study_chrono_google_token", token);
      } else {
        window.sessionStorage.removeItem("study_chrono_google_token");
      }
    }
  } catch {
    // sessionStorage indisponível
  }
}

/**
 * Carrega a biblioteca Google Identity Services dinamicamente se necessário
 */
export async function loadGoogleGsiScript(): Promise<void> {
  if (typeof window === "undefined") return;
  if (window.google?.accounts?.oauth2) return;

  const existing = document.getElementById("google-gsi-client");
  if (existing) {
    return new Promise((resolve) => {
      existing.addEventListener("load", () => resolve());
      if (window.google?.accounts?.oauth2) resolve();
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = "google-gsi-client";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Falha ao carregar a biblioteca Google Identity Services."));
    document.head.appendChild(script);
  });
}

/**
 * Solicita token de acesso OAuth2 com popup interativo do Google
 */
export async function requestGoogleOAuthToken(clientId: string): Promise<string> {
  const cleanId = clientId.trim();
  if (!cleanId) {
    throw new Error(
      "É necessário informar um Google OAuth Client ID válido para conectar com o Google Drive.",
    );
  }

  await loadGoogleGsiScript();

  if (!window.google?.accounts?.oauth2) {
    throw new Error("Biblioteca do Google Identity Services não foi inicializada.");
  }

  return new Promise((resolve, reject) => {
    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: cleanId,
        scope: GOOGLE_DRIVE_SCOPE,
        callback: (response: any) => {
          if (response.error) {
            reject(new Error(`Erro de autorização Google: ${response.error}`));
            return;
          }
          if (response.access_token) {
            setCachedGoogleToken(response.access_token);
            resolve(response.access_token);
          } else {
            reject(new Error("Nenhum token de acesso retornado pelo Google."));
          }
        },
      });
      client.requestAccessToken();
    } catch (err: any) {
      reject(new Error(`Falha ao iniciar autenticação Google: ${err.message || err}`));
    }
  });
}

/**
 * Obtém dados do usuário autenticado a partir do token
 */
export async function fetchGoogleUserInfo(token: string): Promise<{
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
}> {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error("Não foi possível carregar os dados de perfil do Google.");
  }

  const data = await res.json();
  return {
    id: data.sub || `google_${Date.now()}`,
    name: data.name || data.given_name || "Usuário Google",
    email: data.email || "",
    avatarUrl: data.picture,
  };
}

/**
 * Localiza o arquivo de backup no Google Drive
 */
export async function findDriveBackupFile(token: string): Promise<string | null> {
  const query = encodeURIComponent(
    `name = '${DRIVE_FILE_NAME}' and trashed = false`,
  );
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime)`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    if (res.status === 401) {
      setCachedGoogleToken(null);
      throw new Error("Token de acesso expirado. Por favor, reconecte sua conta.");
    }
    throw new Error(`Erro ao buscar arquivo no Google Drive: ${res.statusText}`);
  }

  const data = await res.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }
  return null;
}

/**
 * Faz upload dos dados do StudyChrono para o Google Drive
 */
export async function uploadDataToDrive(
  token: string,
  payload: any,
): Promise<{ fileId: string; modifiedTime: string }> {
  const fileId = await findDriveBackupFile(token);
  const jsonContent = JSON.stringify(payload, null, 2);

  if (fileId) {
    // Atualiza arquivo existente com PATCH
    const updateRes = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: jsonContent,
      },
    );

    if (!updateRes.ok) {
      throw new Error("Falha ao salvar atualização no Google Drive.");
    }

    const result = await updateRes.json();
    return {
      fileId: result.id || fileId,
      modifiedTime: result.modifiedTime || new Date().toISOString(),
    };
  }

  // Cria novo arquivo com multipart upload
  const metadata = {
    name: DRIVE_FILE_NAME,
    mimeType: "application/json",
    description: "Backup automático dos registros de estudo do StudyChrono",
  };

  const boundary = "-------314159265358979323846";
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const multipartRequestBody =
    delimiter +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    JSON.stringify(metadata) +
    delimiter +
    "Content-Type: application/json\r\n\r\n" +
    jsonContent +
    closeDelimiter;

  const createRes = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: multipartRequestBody,
    },
  );

  if (!createRes.ok) {
    throw new Error("Falha ao criar arquivo de estudo no Google Drive.");
  }

  const created = await createRes.json();
  return {
    fileId: created.id,
    modifiedTime: created.modifiedTime || new Date().toISOString(),
  };
}

/**
 * Baixa os dados do arquivo de backup do Google Drive
 */
export async function downloadDataFromDrive(
  token: string,
  fileId: string,
): Promise<any> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  if (!res.ok) {
    throw new Error("Não foi possível carregar o arquivo do Google Drive.");
  }

  return await res.json();
}

/**
 * Unifica sessões locais e remotas sem duplicidades
 */
function mergeSessions(
  local: StudySessionRecord[],
  remote: StudySessionRecord[],
): StudySessionRecord[] {
  const sessionMap = new Map<number | string, StudySessionRecord>();

  for (const s of remote) {
    sessionMap.set(s.id, s);
  }
  for (const s of local) {
    sessionMap.set(s.id, s);
  }

  return Array.from(sessionMap.values()).sort(
    (a, b) =>
      new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
  );
}

/**
 * Sincronização bidirecional completa entre o Cache Local e o Google Drive
 */
export async function syncWithGoogleDrive(token: string): Promise<{
  syncedAt: string;
  totalSessions: number;
}> {
  const fileId = await findDriveBackupFile(token);
  const localHistory = loadHistorySessions();
  const localSubjects = loadSubjects(localHistory);

  let mergedHistory = localHistory;
  let mergedSubjects = localSubjects;

  if (fileId) {
    try {
      const remoteData = await downloadDataFromDrive(token, fileId);
      if (remoteData && Array.isArray(remoteData.history)) {
        mergedHistory = mergeSessions(localHistory, remoteData.history);
      }
      if (remoteData && Array.isArray(remoteData.subjects)) {
        const set = new Set([...localSubjects, ...remoteData.subjects]);
        mergedSubjects = Array.from(set);
      }
    } catch (e) {
      console.warn("Falha ao mesclar dados remotos do Drive, usando dados locais:", e);
    }
  }

  // Atualiza dados no navegador
  saveHistorySessions(mergedHistory);
  safeSetItem(STORAGE_KEYS.SUBJECTS, JSON.stringify(mergedSubjects));

  // Prepara payload e faz upload no Google Drive
  const payload = {
    version: "1.0",
    syncedAt: new Date().toISOString(),
    subjects: mergedSubjects,
    history: mergedHistory,
  };

  const uploadResult = await uploadDataToDrive(token, payload);
  safeSetItem(STORAGE_KEYS.LAST_DRIVE_SYNC, uploadResult.modifiedTime);

  return {
    syncedAt: uploadResult.modifiedTime,
    totalSessions: mergedHistory.length,
  };
}
