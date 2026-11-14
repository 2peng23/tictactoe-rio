import assert from "node:assert/strict";
import { test } from "node:test";
import { requestApi, RequestError } from "../src/lib/client-api";

test("browser requests send JSON and receive the server result", async (context) => {
  context.mock.method(
    globalThis,
    "fetch",
    async (_url: string, options: RequestInit) => {
      assert.equal(options.credentials, "same-origin");
      assert.equal(options.cache, "no-store");
      assert.equal(options.body, JSON.stringify({ action: "start" }));
      return Response.json({ started: true });
    },
  );
  assert.deepEqual(
    await requestApi("/api/rooms/example", "PATCH", { action: "start" }),
    { started: true },
  );
});

test("HTTP failures retain their status even when a proxy returns HTML", async (context) => {
  context.mock.method(
    globalThis,
    "fetch",
    async () => new Response("<html>Unavailable</html>", { status: 503 }),
  );
  await assert.rejects(
    requestApi("/api/session"),
    (failure: unknown) =>
      failure instanceof RequestError &&
      failure.status === 503 &&
      !failure.message.includes("html"),
  );
});

test("server validation errors remain available to the player", async (context) => {
  context.mock.method(globalThis, "fetch", async () =>
    Response.json({ error: "That room is full." }, { status: 409 }),
  );
  await assert.rejects(requestApi("/api/rooms/example"), {
    status: 409,
    message: "That room is full.",
  });
});

test("an invalid success response is recoverable and cancellation remains distinct", async (context) => {
  context.mock.method(
    globalThis,
    "fetch",
    async () => new Response("", { status: 200 }),
  );
  await assert.rejects(requestApi("/api/session"), { status: 503 });
  const controller = new AbortController();
  controller.abort();
  context.mock.method(
    globalThis,
    "fetch",
    async (_url: string, options: RequestInit) => {
      assert.equal(options.signal?.aborted, true);
      throw new DOMException("Cancelled", "AbortError");
    },
  );
  await assert.rejects(
    requestApi("/api/session", "GET", undefined, controller.signal),
    { name: "AbortError" },
  );
});

test("cancelling a response body keeps the cancellation error", async (context) => {
  context.mock.method(
    globalThis,
    "fetch",
    async (_url: string, options: RequestInit) => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          options.signal?.addEventListener(
            "abort",
            () => {
              controller.error(new DOMException("Cancelled", "AbortError"));
            },
            { once: true },
          );
        },
      });
      return new Response(stream);
    },
  );
  const controller = new AbortController();
  const result = requestApi("/api/rooms", "GET", undefined, controller.signal);
  await new Promise<void>((resolve) => setImmediate(resolve));
  controller.abort();
  await assert.rejects(result, { name: "AbortError" });
});
