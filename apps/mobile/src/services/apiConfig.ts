import Constants from "expo-constants";
import { NativeModules, Platform } from "react-native";

const API_PORT = 4000;

function trimSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function normalizeHttpUrl(url: string): string {
  const trimmed = trimSlash(url.trim());
  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  return `http://${trimmed}`;
}

function inferMetroHost(): string | undefined {
  const scriptUrl = NativeModules?.SourceCode?.scriptURL as string | undefined;
  if (scriptUrl) {
    try {
      const parsed = new URL(scriptUrl);
      if (parsed.hostname) {
        return parsed.hostname;
      }
    } catch {
      // Ignore invalid URL and continue with other strategies.
    }
  }

  const hostUri = (Constants.expoConfig as { hostUri?: string } | undefined)?.hostUri;
  if (hostUri) {
    return hostUri.split(":")[0];
  }

  return undefined;
}

export function resolveApiBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (envUrl) {
    const normalized = normalizeHttpUrl(envUrl);
    if (normalized) {
      return normalized;
    }
  }

  const host = inferMetroHost();
  if (host && host !== "localhost" && host !== "127.0.0.1") {
    return `http://${host}:${API_PORT}`;
  }

  if (Platform.OS === "android") {
    return `http://10.0.2.2:${API_PORT}`;
  }

  return `http://localhost:${API_PORT}`;
}
