import { describe, expect, it } from "vitest";
import { describeHttpStatus, readApiError } from "./http-error";

describe("readApiError", () => {
  it("uses the JSON error message from our route handlers", async () => {
    const res = new Response(JSON.stringify({ error: "Send a polygon" }), { status: 400 });
    expect(await readApiError(res)).toBe("Send a polygon");
  });

  it("explains an HTML 404 (route not served) instead of a bare status", async () => {
    const res = new Response("<!doctype html><title>404</title>", { status: 404, headers: { "content-type": "text/html" } });
    expect(await readApiError(res)).toMatch(/couldn’t be reached \(404\)/);
  });

  it("falls back to a status description when the JSON has no error", async () => {
    expect(await readApiError(new Response("{}", { status: 503 }))).toBe(describeHttpStatus(503));
  });
});
