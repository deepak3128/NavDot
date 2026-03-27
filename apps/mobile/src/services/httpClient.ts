type RetryOptions = {
  retries?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
};

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function postJsonWithRetry<TResponse>(
  url: string,
  payload: unknown,
  options: RetryOptions = {}
): Promise<TResponse> {
  const retries = options.retries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 350;
  const timeoutMs = options.timeoutMs ?? 6000;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        },
        timeoutMs
      );

      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `Request failed with status ${response.status}`);
      }

      return (await response.json()) as TResponse;
    } catch (error) {
      lastError = error;
      if (attempt === retries) {
        break;
      }

      const jitter = Math.round(Math.random() * 120);
      await delay(baseDelayMs * Math.pow(2, attempt) + jitter);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Request failed after retries");
}
