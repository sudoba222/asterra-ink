import "server-only";

/**
 * ASTERRA backend (FastAPI, `backend/`). It holds the Copernicus keys, so the browser never calls
 * it with secrets: our route handlers call it from the server.
 * On the server, Docker sets ASTERRA_API_URL=http://api:8000/api/v1 (internal network);
 * locally it falls back to the public API.
 */
const DEFAULT_URL = "https://api.asterra.ink/api/v1";

export function asterraApiUrl(path: string): string {
  return `${(process.env.ASTERRA_API_URL || DEFAULT_URL).replace(/\/+$/, "")}${path}`;
}

/** Thrown with a message people can act on and the status to answer with. */
export class AsterraApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

/** POSTs JSON to the backend; backend errors `{ error: { code, message } }` become AsterraApiError. */
export async function postAsterraApi<T>(path: string, body: unknown, timeoutMs = 60_000): Promise<T> {
  let res: Response;
  try {
    res = await fetch(asterraApiUrl(path), {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch {
    throw new AsterraApiError("The ASTERRA satellite service isn’t reachable right now. Please try again.", 502, "BACKEND_UNREACHABLE");
  }
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = json && typeof json === "object" && "error" in json ? (json.error as { code?: unknown; message?: unknown }) : null;
    const message = typeof err?.message === "string" ? err.message : `The ASTERRA satellite service answered ${res.status}.`;
    throw new AsterraApiError(message, res.status, typeof err?.code === "string" ? err.code : "BACKEND_ERROR");
  }
  return json as T;
}
