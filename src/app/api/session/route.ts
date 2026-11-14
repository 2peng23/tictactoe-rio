import type { NextRequest } from "next/server";
import { handleApi } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: NextRequest) {
  return handleApi(request, async () => ({ ready: true }));
}
