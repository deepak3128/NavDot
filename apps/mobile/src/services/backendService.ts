import { postJsonWithRetry } from "./httpClient";

type DestinationPayload = {
  deviceId: string;
  latitude: number;
  longitude: number;
  label?: string;
  source?: string;
};

type DestinationResponse = {
  message: string;
  destination: {
    id: string;
    deviceId: string;
    latitude: number;
    longitude: number;
    label?: string;
    source: string;
    sentAt: string;
  };
};

function trimSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export async function sendDestinationToBackend(apiBaseUrl: string, payload: DestinationPayload): Promise<void> {
  const base = trimSlash(apiBaseUrl);
  await postJsonWithRetry<DestinationResponse>(`${base}/api/navigation/destinations`, payload, {
    retries: 2,
    timeoutMs: 7000
  });
}
