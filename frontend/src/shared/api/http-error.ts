/**
 * Turns a failed `Response` into a message people can act on.
 * Our route handlers always answer with JSON `{ error }`; anything else (e.g. Next's
 * HTML 404 page) means the request never reached a handler, so we say that instead
 * of a bare "Request failed (404)".
 */
export async function readApiError(res: Response): Promise<string> {
  const body: unknown = await res.json().catch(() => null);
  if (body && typeof body === "object" && "error" in body && typeof body.error === "string" && body.error) return body.error;
  return describeHttpStatus(res.status);
}

export function describeHttpStatus(status: number): string {
  if (status === 404) return "The data service couldn’t be reached (404). If you run the app locally, restart the dev server and try again.";
  if (status === 408 || status === 504) return `The data service took too long to answer (${status}). Please try again.`;
  if (status === 429) return "Too many requests right now (429). Please wait a moment and try again.";
  if (status >= 500) return `The data service had a problem (${status}). Please try again.`;
  return `Request failed (${status})`;
}
