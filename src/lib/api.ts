import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { GameError } from "./game";

const COOKIE_NAME = "tactix-player";

export async function readBody(request: NextRequest): Promise<Record<string, unknown>> {
  if (Number(request.headers.get("content-length")) > 4096) throw new GameError("That request is too large.", 413);
  const text = await request.text();
  if (text.length > 4096) throw new GameError("That request is too large.", 413);
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch { throw new GameError("Please send a valid game request."); }
}

export async function handleApi(
  request: NextRequest,
  operation: (tokenHash: string) => Promise<unknown>,
): Promise<NextResponse> {
  const existingToken = request.cookies.get(COOKIE_NAME)?.value || request.cookies.get("afterhours-player")?.value;
  const token = existingToken && /^[a-f0-9]{64}$/.test(existingToken) ? existingToken : randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  let response: NextResponse;
  try {
    if (request.method !== "GET") {
      const origin = request.headers.get("origin");
      const requestUrl = new URL(request.url);
      const publicOrigin = `${requestUrl.protocol}//${request.headers.get("host") || requestUrl.host}`;
      if ((origin && origin !== publicOrigin) || request.headers.get("sec-fetch-site") === "cross-site") {
        throw new GameError("Open this game directly to continue.", 403);
      }
      if (!request.headers.get("content-type")?.includes("application/json")) throw new GameError("Send a JSON game request.", 415);
    }
    response = NextResponse.json(await operation(tokenHash));
  } catch (error) {
    if (error instanceof GameError) response = NextResponse.json({ error: error.message }, { status: error.status });
    else {
      console.error("TacTix request failed:", error instanceof Error ? error.message : "Unknown database error");
      response = NextResponse.json({ error: "Could not connect. Please try again." }, { status: 503 });
    }
  }
  if (token !== existingToken || !request.cookies.get(COOKIE_NAME)?.value) response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true, sameSite: "lax", secure: new URL(request.url).protocol === "https:", path: "/", maxAge: 60 * 60 * 24 * 30,
  });
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}
