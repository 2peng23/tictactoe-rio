"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { requestApi } from "@/lib/client-api";
import { startPolling } from "@/lib/polling";
import type { LobbySummary } from "@/lib/types";

export function usePublicRooms(enabled: boolean) {
  const [rooms, setRooms] = useState<LobbySummary[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [refreshingRooms, setRefreshingRooms] = useState(false);
  const [lobbyError, setLobbyError] = useState("");
  const requestReference = useRef<AbortController | null>(null);

  const refreshRooms = useCallback(async (signal?: AbortSignal) => {
    if (requestReference.current || signal?.aborted) return;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    requestReference.current = controller;
    setRefreshingRooms(true);
    try {
      const result = await requestApi<{ rooms: LobbySummary[] }>(
        "/api/rooms",
        "GET",
        undefined,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setRooms(result.rooms);
      setLobbyError("");
    } catch (failure) {
      if (!controller.signal.aborted)
        setLobbyError(
          failure instanceof Error
            ? failure.message
            : "Could not load public rooms.",
        );
    } finally {
      signal?.removeEventListener("abort", abort);
      requestReference.current = null;
      if (!controller.signal.aborted) {
        setRefreshingRooms(false);
        setLoadingRooms(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const stop = startPolling(refreshRooms, () =>
      setLobbyError("You’re offline. Reconnect to see available rooms."),
    );
    return () => {
      stop();
      requestReference.current?.abort();
    };
  }, [enabled, refreshRooms]);

  return { rooms, loadingRooms, refreshingRooms, lobbyError, refreshRooms };
}
