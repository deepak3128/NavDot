import { resolveApiBaseUrl } from "./apiConfig";

type LoginResponse = {
  token: string;
  user: {
    id: string;
    email: string;
    fullName?: string | null;
  };
};

type RegisterResponse = {
  user: {
    id: string;
    email: string;
    fullName?: string | null;
    createdAt: string;
  };
};

type ProfileResponse = {
  user: {
    id: string;
    email: string;
    fullName?: string | null;
    createdAt: string;
  };
};

function trimSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function normalizeBaseUrl(url: string): string {
  const trimmed = trimSlash(url.trim());
  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  return `http://${trimmed}`;
}

async function parseError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as {
      error?: string | { formErrors?: string[]; fieldErrors?: Record<string, string[] | undefined> };
    };
    if (typeof payload.error === "string") {
      return payload.error;
    }

    if (payload.error && typeof payload.error === "object" && Array.isArray(payload.error.formErrors)) {
      const formMessage = payload.error.formErrors.join(", ").trim();
      if (formMessage) {
        return formMessage;
      }
    }

    if (payload.error && typeof payload.error === "object" && payload.error.fieldErrors) {
      const fieldMessages = Object.values(payload.error.fieldErrors)
        .flatMap((messages) => messages ?? [])
        .filter((message) => message.trim().length > 0);

      if (fieldMessages.length > 0) {
        return fieldMessages.join(", ");
      }
    }
  } catch {
    // Ignore JSON parse errors and fall back to status code.
  }

  return `Request failed (${response.status})`;
}

async function requestJson<TResponse>(path: string, init: RequestInit, apiBaseUrlOverride?: string): Promise<TResponse> {
  const base = normalizeBaseUrl(apiBaseUrlOverride ?? resolveApiBaseUrl());

  try {
    const response = await fetch(`${base}${path}`, init);
    if (!response.ok) {
      throw new Error(await parseError(response));
    }

    return (await response.json()) as TResponse;
  } catch (error) {
    if (error instanceof Error && /network request failed/i.test(error.message)) {
      throw new Error(
        `Cannot reach API at ${base}. Ensure API server is running and base URL is correct (Android emulator: http://10.0.2.2:4000).`
      );
    }

    throw error;
  }
}

export async function registerUser(payload: {
  email: string;
  password: string;
  fullName?: string;
}, apiBaseUrlOverride?: string): Promise<RegisterResponse> {
  return await requestJson<RegisterResponse>("/api/auth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  }, apiBaseUrlOverride);
}

export async function loginUser(payload: {
  email: string;
  password: string;
}, apiBaseUrlOverride?: string): Promise<LoginResponse> {
  return await requestJson<LoginResponse>("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  }, apiBaseUrlOverride);
}

export async function getProfile(token: string, apiBaseUrlOverride?: string): Promise<ProfileResponse> {
  return await requestJson<ProfileResponse>("/api/auth/profile", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`
    }
  }, apiBaseUrlOverride);
}
