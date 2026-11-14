import type { NextRequest } from "next/server";
import { handleApi, readBody } from "@/lib/api";
import { createRoom, listRooms } from "@/lib/rooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: NextRequest) {
  return handleApi(request, async (tokenHash) => ({
    rooms: await listRooms(tokenHash),
  }));
}
export function POST(request: NextRequest) {
  return handleApi(request, async (tokenHash) => ({
    room: await createRoom(await readBody(request), tokenHash),
  }));
}
