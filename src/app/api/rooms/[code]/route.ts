import type { NextRequest } from "next/server";
import { handleApi, readBody } from "@/lib/api";
import { changeRoom, getRoom, joinRoom, leaveRoom } from "@/lib/rooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ code: string }> };

export async function GET(request: NextRequest, context: Context) {
  return handleApi(request, async (tokenHash) => {
    const { code } = await context.params;
    return { room: await getRoom(code, tokenHash, request.nextUrl.searchParams.get("heartbeat") === "1") };
  });
}
export async function POST(request: NextRequest, context: Context) {
  return handleApi(request, async (tokenHash) => {
    const { code } = await context.params;
    const input = await readBody(request);
    return { room: await joinRoom(code, input.playerName, tokenHash) };
  });
}
export async function PATCH(request: NextRequest, context: Context) {
  return handleApi(request, async (tokenHash) => {
    const { code } = await context.params;
    const input = await readBody(request);
    if (input.action === "leave") {
      await leaveRoom(code, tokenHash);
      return { left: true };
    }
    return { room: await changeRoom(code, input, tokenHash) };
  });
}
