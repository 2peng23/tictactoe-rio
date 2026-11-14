"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeCode, type LobbySummary, type RoomView, type StarterChoice, type Visibility } from "@/lib/types";
import { startPolling } from "@/lib/polling";

export class RequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function requestApi<Result>(url: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<Result> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 10_000);
  try {
    const response = await fetch(url, {
      method, cache: "no-store", credentials: "same-origin", signal: controller.signal,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json();
    if (!response.ok) throw new RequestError(result.error || "Something interrupted the game. Please try again.", response.status);
    return result as Result;
  } catch (failure) {
    if (controller.signal.aborted && !signal?.aborted) throw new RequestError("The connection took too long. Please try again.", 503);
    throw failure;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

function remember(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* The game also works when browser storage is unavailable. */ }
}

export function useArcade() {
  const [ready, setReady] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [room, setRoom] = useState<RoomView | null>(null);
  const [animatedMoves, setAnimatedMoves] = useState<number[]>([]);
  const [rooms, setRooms] = useState<LobbySummary[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [refreshingRooms, setRefreshingRooms] = useState(false);
  const [lobbyError, setLobbyError] = useState("");
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);
  const [invitationCode, setInvitationCode] = useState("");
  const workingReference = useRef(false);
  const roomReference = useRef<RoomView | null>(null);
  const lobbyFetchingReference = useRef(false);

  const acceptRoom = useCallback((next: RoomView) => {
    const current = roomReference.current;
    if (current?.code === next.code && current.revision > next.revision) return;
    if (current?.code !== next.code || current.roundId !== next.roundId) setAnimatedMoves([]);
    else {
      const placed = next.board.flatMap((cell, position) => cell !== null && current.board[position] === null ? [position] : []);
      if (placed.length) setAnimatedMoves((previous) => [...new Set([...previous, ...placed])]);
    }
    roomReference.current = next;
    setRoom(next);
  }, []);

  useEffect(() => {
    let disposed = false;
    async function initialize() {
      await requestApi("/api/session");
      if (disposed) return;
      let rememberedRoom = "";
      try {
        const name = localStorage.getItem("tactix-name") || localStorage.getItem("afterhours-name") || "";
        setPlayerName(name);
        rememberedRoom = localStorage.getItem("tactix-room") || localStorage.getItem("afterhours-room") || "";
        remember("tactix-name", name);
        remember("tactix-room", rememberedRoom || null);
        localStorage.removeItem("afterhours-name");
        localStorage.removeItem("afterhours-room");
      } catch { /* Optional local preferences. */ }
      const invitedRoom = new URL(window.location.href).searchParams.get("room") || "";
      const code = normalizeCode(invitedRoom || rememberedRoom);
      if (code) {
        try {
          const result = await requestApi<{ room: RoomView }>(`/api/rooms/${encodeURIComponent(code)}?heartbeat=1`);
          if (!disposed) {
            acceptRoom(result.room);
            remember("tactix-room", code);
          }
        } catch (failure) {
          if (disposed) return;
          if (invitedRoom) setInvitationCode(code);
          else remember("tactix-room", null);
          if (!(failure instanceof RequestError && failure.status === 403 && invitedRoom)) {
            setError(failure instanceof Error ? failure.message : "Could not restore that room.");
          }
        }
      }
      if (!disposed) setReady(true);
    }
    initialize().catch((failure: unknown) => {
      if (!disposed) {
        setError(failure instanceof Error ? failure.message : "Could not connect. Please try again.");
        setReady(true);
      }
    });
    return () => { disposed = true; };
  }, [acceptRoom]);

  const refreshRooms = useCallback(async (signal?: AbortSignal) => {
    if (lobbyFetchingReference.current || signal?.aborted) return;
    lobbyFetchingReference.current = true;
    setRefreshingRooms(true);
    try {
      const result = await requestApi<{ rooms: LobbySummary[] }>("/api/rooms", "GET", undefined, signal);
      if (signal?.aborted || roomReference.current) return;
      setRooms(result.rooms);
      setLobbyError("");
    } catch (failure) {
      if (!signal?.aborted && !roomReference.current) setLobbyError(failure instanceof Error ? failure.message : "Could not load public rooms.");
    } finally {
      lobbyFetchingReference.current = false;
      setRefreshingRooms(false);
      if (!signal?.aborted) setLoadingRooms(false);
    }
  }, []);

  useEffect(() => {
    if (!ready || room) return;
    return startPolling(refreshRooms, () => setLobbyError("You’re offline. Reconnect to see available rooms."));
  }, [ready, room, refreshRooms]);

  const activeCode = room?.code;
  useEffect(() => {
    if (!ready || !activeCode) return;
    let disposed = false;
    const stop = startPolling(async (signal) => {
      try {
        const result = await requestApi<{ room: RoomView }>(`/api/rooms/${activeCode}?heartbeat=1`, "GET", undefined, signal);
        if (disposed || roomReference.current?.code !== activeCode) return;
        acceptRoom(result.room);
        setConnected(true);
      } catch (failure) {
        if (disposed) return;
        setConnected(false);
        if (failure instanceof RequestError && [403, 404].includes(failure.status)) {
          setError(failure.message);
          remember("tactix-room", null);
          roomReference.current = null;
          setRoom(null);
          return;
        }
      }
    }, () => setConnected(false));
    return () => { disposed = true; stop(); };
  }, [ready, activeCode, acceptRoom]);

  const startRoom = useCallback((next: RoomView) => {
    acceptRoom(next);
    remember("tactix-name", playerName.trim());
    remember("tactix-room", next.code);
    setInvitationCode("");
    setConnected(true);
    const url = new URL(window.location.href);
    url.searchParams.set("room", next.code);
    window.history.replaceState(null, "", url);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [acceptRoom, playerName]);

  const perform = useCallback(async (action: string, operation: () => Promise<void>) => {
    if (workingReference.current) return;
    workingReference.current = true;
    setBusyAction(action);
    setError("");
    try { await operation(); }
    catch (failure) {
      setError(failure instanceof Error ? failure.message : "That did not go through. Please try again.");
      const current = roomReference.current;
      if (current && failure instanceof RequestError && failure.status === 409) {
        try {
          const result = await requestApi<{ room: RoomView }>(`/api/rooms/${current.code}?heartbeat=1`);
          acceptRoom(result.room);
          if (action === "reset" && result.room.roundId !== current.roundId && result.room.winner === null) setError("");
          if (action === "start" && result.room.roundId === current.roundId && result.room.roundStarted) setError("");
        } catch { /* The connection indicator supplies recovery feedback. */ }
      }
    } finally { workingReference.current = false; setBusyAction(null); }
  }, [acceptRoom]);

  const create = (name: string, visibility: Visibility) => perform("create", async () => {
    const result = await requestApi<{ room: RoomView }>("/api/rooms", "POST", { playerName, name, visibility });
    startRoom(result.room);
  });

  const join = (rawCode: string) => perform("join", async () => {
    const code = normalizeCode(rawCode);
    const result = await requestApi<{ room: RoomView }>(`/api/rooms/${encodeURIComponent(code)}`, "POST", { playerName });
    startRoom(result.room);
  });

  const clearRoom = useCallback(() => {
    roomReference.current = null;
    setRoom(null);
    setError("");
    remember("tactix-room", null);
    const url = new URL(window.location.href);
    url.searchParams.delete("room");
    window.history.replaceState(null, "", url);
  }, []);

  const act = (action: "move" | "reset" | "leave" | "starter" | "start", position?: number, starterChoice?: StarterChoice) => perform(action, async () => {
    const current = roomReference.current;
    if (!current) return;
    if (current.closed && action === "leave") { clearRoom(); return; }
    if (action === "leave") {
      await requestApi<{ left: true }>(`/api/rooms/${current.code}`, "PATCH", { action: "leave" });
      clearRoom();
      return;
    }
    const result = await requestApi<{ room: RoomView }>(`/api/rooms/${current.code}`, "PATCH", {
      action, position, starterChoice, revision: current.revision, roundId: current.roundId,
    });
    acceptRoom(result.room);
  });

  return { ready, playerName, setPlayerName, room, animatedMoves, rooms, loadingRooms, refreshingRooms, lobbyError, error, busyAction, connected, invitationCode, refreshRooms, create, join, act };
}
