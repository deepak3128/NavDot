import AsyncStorage from "@react-native-async-storage/async-storage";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase env vars are missing. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in apps/mobile/.env."
  );
}

export const supabaseConfig = {
  url: supabaseUrl.replace(/\/$/, "").replace(/\/auth\/v1$/, ""),
  anonKey: supabaseAnonKey,
  authBaseUrl: `${supabaseUrl.replace(/\/$/, "").replace(/\/auth\/v1$/, "")}/auth/v1`
};

const sessionStorageKey = "navdot-supabase-session";

export type SupabaseStoredSession = {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  user: {
    id: string;
    email: string;
    full_name?: string | null;
    avatar_url?: string | null;
    created_at?: string;
  };
};

type AuthResponse<T> = {
  data?: T;
  error?: string;
  message?: string;
  msg?: string;
};

export async function saveStoredSession(session: SupabaseStoredSession): Promise<void> {
  await AsyncStorage.setItem(sessionStorageKey, JSON.stringify(session));
}

export async function loadStoredSession(): Promise<SupabaseStoredSession | null> {
  const raw = await AsyncStorage.getItem(sessionStorageKey);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as SupabaseStoredSession;
  } catch {
    await AsyncStorage.removeItem(sessionStorageKey);
    return null;
  }
}

export async function clearStoredSession(): Promise<void> {
  await AsyncStorage.removeItem(sessionStorageKey);
}

export async function requestSupabaseAuth<T>(
  path: string,
  init: RequestInit,
  accessToken?: string
): Promise<T> {
  const headers = {
    apikey: supabaseConfig.anonKey,
    Authorization: accessToken ? `Bearer ${accessToken}` : `Bearer ${supabaseConfig.anonKey}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined)
  };

  const response = await fetch(`${supabaseConfig.authBaseUrl}${path}`, {
    ...init,
    headers
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const payload = (await response.json()) as AuthResponse<unknown>;
      if (typeof payload.error === "string" && payload.error.trim()) {
        message = payload.error;
      } else if (typeof payload.message === "string" && payload.message.trim()) {
        message = payload.message;
      } else if (typeof payload.msg === "string" && payload.msg.trim()) {
        message = payload.msg;
      }
    } catch {
      // Ignore parse errors and keep the status fallback.
    }

    throw new Error(message);
  }

  return (await response.json()) as T;
}
