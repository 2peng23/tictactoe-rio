import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { handleApi, readBody } from "../src/lib/api";

function bodyRequest(body: string): Request {
  return new Request("http://localhost/api/rooms", { method: "POST", body });
}

test("API bodies must be JSON objects", async () => {
  assert.deepEqual(await readBody(bodyRequest('{"name":"A room"}')), {
    name: "A room",
  });
  for (const invalid of ["", "{", "null", "[]", '"name"', "1"]) {
    await assert.rejects(readBody(bodyRequest(invalid)), { status: 400 });
  }
});

test("the body limit measures UTF-8 bytes without trusting Content-Length", async () => {
  const request = bodyRequest(JSON.stringify({ name: "💚".repeat(1500) }));
  assert.equal(request.headers.get("content-length"), null);
  await assert.rejects(readBody(request), { status: 413 });
});

test("an oversized request stops consuming its stream", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(4097));
    },
    cancel() {
      cancelled = true;
    },
  });
  const request = new Request("http://localhost/api/rooms", {
    method: "POST",
    body: stream,
    duplex: "half",
  } as RequestInit);
  await assert.rejects(readBody(request), { status: 413 });
  assert.equal(cancelled, true);
});

test("API responses keep player tokens HttpOnly and reject cross-site mutations", async () => {
  const session = await handleApi(
    new NextRequest("http://localhost/api/session"),
    async (tokenHash) => {
      assert.match(tokenHash, /^[a-f0-9]{64}$/);
      return { ready: true };
    },
  );
  assert.equal(
    session.headers.get("cache-control"),
    "private, no-store, max-age=0",
  );
  assert.match(session.headers.get("set-cookie") ?? "", /HttpOnly/i);
  const denied = await handleApi(
    new NextRequest("http://localhost/api/rooms", {
      method: "POST",
      headers: {
        origin: "https://another.example",
        "content-type": "application/json",
      },
      body: "{}",
    }),
    async () => {
      throw new Error("Cross-site requests must not reach the operation.");
    },
  );
  assert.equal(denied.status, 403);
});
