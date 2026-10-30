import type { UserProfile } from "../types/session";
import {
  setUserProfileWeb,
  getStorageConfigWeb,
  STORAGE_KEYS,
  safeGetItem,
  safeSetItem,
} from "./webTracker";

export interface StoredAccount {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

async function hashPassword(password: string): Promise<string> {
  try {
    if (typeof crypto !== "undefined" && crypto.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(password.trim());
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    }
  } catch {
    // Fallback caso crypto.subtle não esteja acessível em contextos legados
  }
  let hash = 0;
  const trimmed = password.trim();
  for (let i = 0; i < trimmed.length; i++) {
    hash = (hash << 5) - hash + trimmed.charCodeAt(i);
    hash |= 0;
  }
  return `hash_${Math.abs(hash)}`;
}

export function getStoredAccounts(): StoredAccount[] {
  const raw = safeGetItem(STORAGE_KEYS.ACCOUNTS ?? "study_chrono_accounts");
  if (!raw) return [];
  try {
    return JSON.parse(raw) as StoredAccount[];
  } catch {
    return [];
  }
}

function saveStoredAccounts(accounts: StoredAccount[]): void {
  safeSetItem(
    STORAGE_KEYS.ACCOUNTS ?? "study_chrono_accounts",
    JSON.stringify(accounts),
  );
}

export async function registerUserAccount(
  name: string,
  email: string,
  password: string,
): Promise<UserProfile> {
  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();
  const cleanPassword = password.trim();

  if (!cleanName) {
    throw new Error("Por favor, informe seu nome.");
  }
  if (!cleanEmail || !cleanEmail.includes("@")) {
    throw new Error("Por favor, informe um endereço de e-mail válido.");
  }
  if (cleanPassword.length < 6) {
    throw new Error("A senha deve conter no mínimo 6 caracteres.");
  }

  const accounts = getStoredAccounts();
  const existing = accounts.find((acc) => acc.email === cleanEmail);
  if (existing) {
    throw new Error("Este endereço de e-mail já está cadastrado.");
  }

  const passwordHash = await hashPassword(cleanPassword);
  const newAccount: StoredAccount = {
    id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: cleanName,
    email: cleanEmail,
    passwordHash,
    createdAt: new Date().toISOString(),
  };

  accounts.push(newAccount);
  saveStoredAccounts(accounts);

  const profile: UserProfile = {
    id: newAccount.id,
    name: newAccount.name,
    email: newAccount.email,
    isDemo: false,
    provider: "email",
    storageMode: getStorageConfigWeb().mode,
  };

  setUserProfileWeb(profile);
  return profile;
}

export async function loginUserAccount(
  email: string,
  password: string,
): Promise<UserProfile> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanPassword = password.trim();

  if (!cleanEmail || !cleanPassword) {
    throw new Error("Preencha e-mail e senha para entrar.");
  }

  const accounts = getStoredAccounts();
  const account = accounts.find((acc) => acc.email === cleanEmail);
  if (!account) {
    throw new Error("E-mail não cadastrado. Crie uma conta para começar.");
  }

  const inputHash = await hashPassword(cleanPassword);
  if (account.passwordHash !== inputHash) {
    throw new Error("Senha incorreta. Verifique e tente novamente.");
  }

  const profile: UserProfile = {
    id: account.id,
    name: account.name,
    email: account.email,
    isDemo: false,
    provider: "email",
    storageMode: getStorageConfigWeb().mode,
  };

  setUserProfileWeb(profile);
  return profile;
}

export async function loginWithGoogleData(googleUser: {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
}): Promise<UserProfile> {
  const profile: UserProfile = {
    id: googleUser.id,
    name: googleUser.name,
    email: googleUser.email.toLowerCase(),
    avatarUrl: googleUser.avatarUrl,
    isDemo: false,
    provider: "google",
    storageMode: "drive",
  };

  setUserProfileWeb(profile);
  return profile;
}
