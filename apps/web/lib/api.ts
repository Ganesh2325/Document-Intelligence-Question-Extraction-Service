export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function configuredApiUrl() {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3001";
}

/** Browser calls stay same-origin (`/api/v1/...`) and Next.js proxies them. */
export function getApiBase(): string {
  if (typeof window === "undefined") return configuredApiUrl();
  return "";
}

/** Direct FastAPI origin for Swagger and other non-proxied links. */
export function getDirectApiUrl(): string {
  return configuredApiUrl();
}

export const apiUrl = getApiBase();

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("folio_token");
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem("folio_token", token);
  else localStorage.removeItem("folio_token");
}

function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && (error.name === "AbortError" || error.message.toLowerCase().includes("aborted"));
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (isAbortError(error)) return new ApiError("REQUEST_ABORTED", "Request was cancelled.", 499);
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : "Request failed.";
  const network =
    name === "TimeoutError" ||
    name === "NetworkError" ||
    message === "Failed to fetch" ||
    message === "Load failed" ||
    message === "NetworkError when attempting to fetch resource." ||
    /failed to fetch|networkerror|load failed/i.test(message);
  if (network) {
    return new ApiError(
      "NETWORK_UNAVAILABLE",
      "The API could not be reached. Confirm the Folio API is running, then retry.",
      0,
    );
  }
  return new ApiError("REQUEST_FAILED", message, 0);
}

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const attempts = method === "GET" || method === "HEAD" ? 2 : 1;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(url, init);
    } catch (error) {
      lastError = error;
      if (isAbortError(error) || attempt === attempts) throw toApiError(error);
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }
  throw toApiError(lastError);
}

function withTimeout(init: RequestInit): RequestInit {
  if (init.signal) return init;
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return { ...init, signal: AbortSignal.timeout(30_000) };
  }
  return init;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetchWithRetry(`${getApiBase()}${path}`, withTimeout({ ...init, headers }));
  } catch (error) {
    throw toApiError(error);
  }

  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = (data as { error?: { code?: string; message?: string } }).error ?? {};
    if (response.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/v1/auth/")) {
      setToken(null);
      window.location.href = "/login";
    }
    throw new ApiError(err.code ?? "REQUEST_FAILED", err.message ?? "Request failed.", response.status);
  }
  return data as T;
}

export function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
