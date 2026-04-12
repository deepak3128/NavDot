import {
  clearStoredSession,
  loadStoredSession,
  requestSupabaseAuth,
  saveStoredSession,
  supabaseConfig,
  type SupabaseStoredSession
} from "./supabase";
import * as WebBrowser from "expo-web-browser";

WebBrowser.maybeCompleteAuthSession();

type LoginResponse = {
  token: string;
  user: {
    id: string;
    email: string;
    fullName?: string | null;
    avatarUrl?: string | null;
  };
};

type RegisterResponse = {
  user: {
    id: string;
    email: string;
    fullName?: string | null;
    avatarUrl?: string | null;
    createdAt: string;
  };
};

type ProfileResponse = {
  user: {
    id: string;
    email: string;
    fullName?: string | null;
    avatarUrl?: string | null;
    createdAt: string;
  };
};

type UpdateProfileResponse = {
  id: string;
  email: string;
  created_at?: string;
  user_metadata?: {
    full_name?: string;
    avatar_url?: string;
  };
};

type AuthSession = {
  token: string;
  user: {
    id: string;
    email: string;
    fullName?: string;
    avatarUrl?: string;
  };
};

export type OAuthProvider = "google" | "apple";

type SupabaseSignUpResponse = {
  user: {
    id: string;
    email: string;
    created_at?: string;
    user_metadata?: {
      full_name?: string;
      avatar_url?: string;
    };
  };
  session?: SupabaseStoredSession;
};

type SupabaseTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  token_type: string;
  user: {
    id: string;
    email: string;
    created_at?: string;
    user_metadata?: {
      full_name?: string;
      avatar_url?: string;
    };
  };
};

type SupabaseRefreshResponse = {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  user?: {
    id: string;
    email?: string;
    created_at?: string;
    user_metadata?: {
      full_name?: string;
      avatar_url?: string;
    };
  };
};

type SupabaseUserResponse = {
  id: string;
  email: string;
  created_at?: string;
  user_metadata?: {
    full_name?: string;
    avatar_url?: string;
  };
};

function parseOAuthCallback(url: string): {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  errorDescription?: string;
  error?: string;
} {
  const params = new URLSearchParams();

  const queryIndex = url.indexOf("?");
  const hashIndex = url.indexOf("#");

  if (queryIndex >= 0) {
    const query = url.slice(queryIndex + 1, hashIndex >= 0 ? hashIndex : undefined);
    const queryParams = new URLSearchParams(query);
    queryParams.forEach((value, key) => params.append(key, value));
  }

  if (hashIndex >= 0) {
    const hash = url.slice(hashIndex + 1);
    const hashParams = new URLSearchParams(hash);
    hashParams.forEach((value, key) => params.append(key, value));
  }

  const accessToken = params.get("access_token") ?? undefined;
  const refreshToken = params.get("refresh_token") ?? undefined;
  const expiresInRaw = params.get("expires_in");
  const expiresAtRaw = params.get("expires_at");
  const error = params.get("error") ?? undefined;
  const errorDescription = params.get("error_description") ?? undefined;

  let expiresAt: number | undefined;
  if (expiresAtRaw) {
    const parsed = Number(expiresAtRaw);
    if (Number.isFinite(parsed)) {
      expiresAt = parsed;
    }
  } else if (expiresInRaw) {
    const parsed = Number(expiresInRaw);
    if (Number.isFinite(parsed)) {
      expiresAt = Math.floor(Date.now() / 1000) + parsed;
    }
  }

  return {
    accessToken,
    refreshToken,
    expiresAt,
    error,
    errorDescription
  };
}

function mapSessionFromUser(user: SupabaseUserResponse, session: SupabaseStoredSession): AuthSession {
  return {
    token: session.access_token,
    user: {
      id: user.id,
      email: user.email,
      fullName: getSessionDisplayName(user.user_metadata),
      avatarUrl: getSessionAvatarUrl(user.user_metadata)
    }
  };
}

function getSessionDisplayName(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== "object") {
    return undefined;
  }

  const fullName = (metadata as { full_name?: unknown }).full_name;
  return typeof fullName === "string" && fullName.trim() ? fullName.trim() : undefined;
}

function getSessionAvatarUrl(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== "object") {
    return undefined;
  }

  const avatarUrl = (metadata as { avatar_url?: unknown }).avatar_url;
  return typeof avatarUrl === "string" && avatarUrl.trim() ? avatarUrl.trim() : undefined;
}

async function refreshStoredSessionIfNeeded(session: SupabaseStoredSession): Promise<SupabaseStoredSession> {
  if (!session.refresh_token) {
    return session;
  }

  const data = await requestSupabaseAuth<SupabaseRefreshResponse>("/token?grant_type=refresh_token", {
    method: "POST",
    body: JSON.stringify({
      refresh_token: session.refresh_token
    })
  });

  const nextSession: SupabaseStoredSession = {
    ...session,
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? session.refresh_token,
    expires_at: data.expires_at ?? session.expires_at,
    user: {
      id: data.user?.id ?? session.user.id,
      email: data.user?.email ?? session.user.email,
      created_at: data.user?.created_at ?? session.user.created_at,
      full_name: getSessionDisplayName(data.user?.user_metadata) ?? session.user.full_name,
      avatar_url: getSessionAvatarUrl(data.user?.user_metadata) ?? session.user.avatar_url
    }
  };

  await saveStoredSession(nextSession);
  return nextSession;
}

async function withSessionRetry<T>(
  session: SupabaseStoredSession,
  operation: (accessToken: string) => Promise<T>
): Promise<{ data: T; session: SupabaseStoredSession }> {
  try {
    const data = await operation(session.access_token);
    return { data, session };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const shouldRetry = message.includes("401") || message.includes("403") || message.toLowerCase().includes("jwt");

    if (!shouldRetry || !session.refresh_token) {
      throw error;
    }

    const refreshedSession = await refreshStoredSessionIfNeeded(session);
    const data = await operation(refreshedSession.access_token);
    return { data, session: refreshedSession };
  }
}

export function mapSupabaseSession(session: SupabaseStoredSession): AuthSession {
  return {
    token: session.access_token,
    user: {
      id: session.user.id,
      email: session.user.email ?? "",
      fullName: session.user.full_name ?? undefined,
      avatarUrl: session.user.avatar_url ?? undefined
    }
  };
}

export async function loginWithOAuth(provider: OAuthProvider): Promise<AuthSession> {
  const redirectTo = "navdot://auth-callback";
  const authUrl = `${supabaseConfig.authBaseUrl}/authorize?provider=${provider}&redirect_to=${encodeURIComponent(redirectTo)}&response_type=token`;

  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectTo);

  if (result.type !== "success" || !result.url) {
    if (result.type === "cancel" || result.type === "dismiss") {
      throw new Error("Authentication was canceled.");
    }
    throw new Error("Unable to complete OAuth authentication.");
  }

  const callback = parseOAuthCallback(result.url);
  if (callback.error) {
    const combined = `${callback.error} ${callback.errorDescription ?? ""}`.toLowerCase();
    if (combined.includes("unsupported provider") || combined.includes("unsuported provider")) {
      throw new Error(
        "Google sign-in is not enabled in Supabase or provider config is invalid. In Supabase Dashboard, open Authentication > Providers > Google, enable it, set Client ID/Secret, and add redirect URI: https://<your-project-ref>.supabase.co/auth/v1/callback"
      );
    }

    throw new Error(callback.errorDescription || callback.error);
  }

  if (!callback.accessToken) {
    throw new Error("OAuth completed, but no access token was returned.");
  }

  const user = await requestSupabaseAuth<SupabaseUserResponse>(
    "/user",
    {
      method: "GET"
    },
    callback.accessToken
  );

  const session: SupabaseStoredSession = {
    access_token: callback.accessToken,
    refresh_token: callback.refreshToken,
    expires_at: callback.expiresAt,
    user: {
      id: user.id,
      email: user.email,
      created_at: user.created_at,
      full_name: getSessionDisplayName(user.user_metadata),
      avatar_url: getSessionAvatarUrl(user.user_metadata)
    }
  };

  await saveStoredSession(session);
  return mapSessionFromUser(user, session);
}

export async function registerUser(payload: {
  email: string;
  password: string;
  fullName?: string;
}): Promise<RegisterResponse> {
  const data = await requestSupabaseAuth<SupabaseSignUpResponse>("/signup", {
    method: "POST",
    body: JSON.stringify({
      email: payload.email,
      password: payload.password,
      data: {
        full_name: payload.fullName
      }
    })
  });

  if (!data.user) {
    throw new Error("Sign-up failed. No user returned.");
  }

  if (data.session) {
    await saveStoredSession(data.session);
  }

  return {
    user: {
      id: data.user.id,
      email: data.user.email ?? payload.email,
      fullName: getSessionDisplayName(data.user.user_metadata) ?? null,
      avatarUrl: getSessionAvatarUrl(data.user.user_metadata) ?? null,
      createdAt: data.user.created_at ?? new Date().toISOString()
    }
  };
}

export async function loginUser(payload: {
  email: string;
  password: string;
}): Promise<LoginResponse> {
  const data = await requestSupabaseAuth<SupabaseTokenResponse>("/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({
      email: payload.email,
      password: payload.password
    })
  });

  if (!data.access_token) {
    throw new Error("Login failed. No active session returned.");
  }

  const session: SupabaseStoredSession = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
    user: {
      id: data.user.id,
      email: data.user.email ?? payload.email,
      full_name: getSessionDisplayName(data.user.user_metadata),
      created_at: data.user.created_at
    }
  };
  await saveStoredSession(session);

  const mapped = mapSupabaseSession(session);
  return {
    token: mapped.token,
    user: {
      id: mapped.user.id,
      email: mapped.user.email,
      fullName: mapped.user.fullName ?? null,
      avatarUrl: mapped.user.avatarUrl ?? null
    }
  };
}

export async function getProfile(): Promise<ProfileResponse> {
  const session = await loadStoredSession();
  if (!session) {
    throw new Error("No authenticated user found.");
  }

  const { data, session: activeSession } = await withSessionRetry(
    session,
    async (accessToken) => requestSupabaseAuth<{ user: SupabaseTokenResponse["user"] }>(
      "/user",
      {
        method: "GET"
      },
      accessToken
    )
  );

  return {
    user: {
      id: data.user.id,
      email: data.user.email ?? activeSession.user.email,
      fullName: getSessionDisplayName(data.user.user_metadata) ?? activeSession.user.full_name ?? null,
      avatarUrl: getSessionAvatarUrl(data.user.user_metadata) ?? activeSession.user.avatar_url ?? null,
      createdAt: data.user.created_at ?? activeSession.user.created_at ?? new Date().toISOString()
    }
  };
}

export async function updateProfile(payload: { fullName: string; avatarUrl?: string }): Promise<ProfileResponse> {
  const session = await loadStoredSession();
  if (!session) {
    throw new Error("No authenticated user found.");
  }

  const normalizedFullName = payload.fullName.trim();
  const normalizedAvatarUrl = payload.avatarUrl?.trim();

  const requestBody: {
    data: {
      full_name: string;
      avatar_url?: string;
    };
  } = {
    data: {
      full_name: normalizedFullName
    }
  };

  if (normalizedAvatarUrl) {
    requestBody.data.avatar_url = normalizedAvatarUrl;
  }

  const { data, session: activeSession } = await withSessionRetry(
    session,
    async (accessToken) => requestSupabaseAuth<UpdateProfileResponse>(
      "/user",
      {
        method: "PUT",
        body: JSON.stringify(requestBody)
      },
      accessToken
    )
  );

  const updatedSession: SupabaseStoredSession = {
    ...activeSession,
    user: {
      ...activeSession.user,
      email: data.email ?? activeSession.user.email,
      full_name: getSessionDisplayName(data.user_metadata) ?? normalizedFullName,
      avatar_url: getSessionAvatarUrl(data.user_metadata) ?? normalizedAvatarUrl ?? activeSession.user.avatar_url,
      created_at: data.created_at ?? activeSession.user.created_at
    }
  };

  await saveStoredSession(updatedSession);

  return {
    user: {
      id: data.id,
      email: data.email ?? activeSession.user.email,
      fullName: getSessionDisplayName(data.user_metadata) ?? normalizedFullName,
      avatarUrl: getSessionAvatarUrl(data.user_metadata) ?? normalizedAvatarUrl ?? activeSession.user.avatar_url ?? null,
      createdAt: data.created_at ?? activeSession.user.created_at ?? new Date().toISOString()
    }
  };
}

export async function updateEmail(payload: { email: string }): Promise<{ email: string }> {
  const session = await loadStoredSession();
  if (!session) {
    throw new Error("No authenticated user found.");
  }

  const normalizedEmail = payload.email.trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error("Email is required.");
  }

  const { data, session: activeSession } = await withSessionRetry(
    session,
    async (accessToken) =>
      requestSupabaseAuth<UpdateProfileResponse>(
        "/user",
        {
          method: "PUT",
          body: JSON.stringify({ email: normalizedEmail })
        },
        accessToken
      )
  );

  const updatedSession: SupabaseStoredSession = {
    ...activeSession,
    user: {
      ...activeSession.user,
      email: data.email ?? normalizedEmail
    }
  };

  await saveStoredSession(updatedSession);

  return {
    email: data.email ?? normalizedEmail
  };
}

export async function updatePassword(payload: { password: string }): Promise<void> {
  const session = await loadStoredSession();
  if (!session) {
    throw new Error("No authenticated user found.");
  }

  const normalizedPassword = payload.password.trim();
  if (!normalizedPassword) {
    throw new Error("Password is required.");
  }

  await withSessionRetry(
    session,
    async (accessToken) =>
      requestSupabaseAuth<UpdateProfileResponse>(
        "/user",
        {
          method: "PUT",
          body: JSON.stringify({ password: normalizedPassword })
        },
        accessToken
      )
  );
}

export async function signOutUser(): Promise<void> {
  const session = await loadStoredSession();
  if (session) {
    try {
      await requestSupabaseAuth<void>("/logout", {
        method: "POST"
      }, session.access_token);
    } catch {
      // Clear local session even if the remote logout request fails.
    }
  }

  await clearStoredSession();
}

export async function getCurrentSession(): Promise<AuthSession | null> {
  const session = await loadStoredSession();
  if (!session) {
    return null;
  }

  try {
    await requestSupabaseAuth("/user", { method: "GET" }, session.access_token);
    return mapSupabaseSession(session);
  } catch {
    await clearStoredSession();
    return null;
  }
}
