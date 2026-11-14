"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  normalizeCode,
  type BusyAction,
  type RoomAction,
  type RoomView,
  type Visibility,
} from "@/lib/types";
import { startPolling } from "@/lib/polling";
import { requestApi, RequestError } from "@/lib/client-api";
import {
  readPlayerPreferences,
  rememberPlayerName,
  rememberRoom,
} from "@/lib/player-preferences";
import { usePublicRooms } from "./use-public-rooms";

export function useArcade() {
  const [ready, setReady] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [room, setRoom] = useState<RoomView | null>(null);
  const [animatedMoves, setAnimatedMoves] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState<BusyAction | null>(null);
  const [connected, setConnected] = useState(true);
  const [invitationCode, setInvitationCode] = useState("");
  const workingReference = useRef(false);
  const roomReference = useRef<RoomView | null>(null);
  const publicRooms = usePublicRooms(ready && room === null);

  const acceptRoom = useCallback((next: RoomView) => {
    const current = roomReference.current;
    if (current?.code === next.code && current.revision > next.revision) return;
    if (current?.code !== next.code || current.roundId !== next.roundId)
      setAnimatedMoves([]);
    else {
      const placed = next.board.flatMap((cell, position) =>
        cell !== null && current.board[position] === null ? [position] : [],
      );
      if (placed.length)
        setAnimatedMoves((previous) => [...new Set([...previous, ...placed])]);
    }
    roomReference.current = next;
    setRoom(next);
  }, []);

  useEffect(() => {
    let preferences: ReturnType<typeof readPlayerPreferences> | undefined;
    let sessionReady = false;
    const invitedRoom =
      new URL(window.location.href).searchParams.get("room") || "";
    const stop = startPolling(
      async (signal) => {
        // Yield before setting state so Strict Mode cleanup can cancel initialization.
        await Promise.resolve();
        if (signal.aborted) return;
        if (!preferences) {
          preferences = readPlayerPreferences();
          setPlayerName(preferences.name);
          setInvitationCode(normalizeCode(invitedRoom));
        }
        try {
          if (!sessionReady) {
            await requestApi("/api/session", "GET", undefined, signal);
            sessionReady = true;
          }
          const code = normalizeCode(invitedRoom || preferences.roomCode);
          let restoreError = "";
          if (code) {
            try {
              const result = await requestApi<{ room: RoomView }>(
                `/api/rooms/${encodeURIComponent(code)}?heartbeat=1`,
                "GET",
                undefined,
                signal,
              );
              if (signal.aborted) return;
              acceptRoom(result.room);
              rememberRoom(code);
            } catch (failure) {
              if (signal.aborted) return;
              // A temporary outage must not discard a reserved seat or invitation.
              if (!(failure instanceof RequestError) || failure.status >= 500)
                throw failure;
              if (!invitedRoom) rememberRoom(null);
              if (!(failure.status === 403 && invitedRoom))
                restoreError = failure.message;
            }
          }
          if (signal.aborted) return;
          setError(restoreError);
          setReady(true);
          stop?.();
        } catch (failure) {
          if (!signal.aborted)
            setError(
              failure instanceof Error
                ? failure.message
                : "Could not connect. Retrying…",
            );
        }
      },
      () => setError("You’re offline. Reconnect to continue."),
    );
    return () => stop?.();
  }, [acceptRoom]);

  const activeCode = room?.code;
  useEffect(() => {
    if (!ready || !activeCode) return;
    let disposed = false;
    const stop = startPolling(
      async (signal) => {
        try {
          const result = await requestApi<{ room: RoomView }>(
            `/api/rooms/${activeCode}?heartbeat=1`,
            "GET",
            undefined,
            signal,
          );
          if (disposed || roomReference.current?.code !== activeCode) return;
          acceptRoom(result.room);
          setConnected(true);
        } catch (failure) {
          if (disposed) return;
          setConnected(false);
          if (
            failure instanceof RequestError &&
            [403, 404].includes(failure.status)
          ) {
            setError(failure.message);
            rememberRoom(null);
            roomReference.current = null;
            setRoom(null);
            return;
          }
        }
      },
      () => setConnected(false),
    );
    return () => {
      disposed = true;
      stop();
    };
  }, [ready, activeCode, acceptRoom]);

  const startRoom = useCallback(
    (next: RoomView) => {
      acceptRoom(next);
      rememberPlayerName(playerName);
      rememberRoom(next.code);
      setInvitationCode("");
      setConnected(true);
      const url = new URL(window.location.href);
      url.searchParams.set("room", next.code);
      window.history.replaceState(null, "", url);
      window.scrollTo({ top: 0, behavior: "instant" });
    },
    [acceptRoom, playerName],
  );

  const perform = useCallback(
    async (action: BusyAction, operation: () => Promise<void>) => {
      if (workingReference.current) return;
      workingReference.current = true;
      setBusyAction(action);
      setError("");
      try {
        await operation();
      } catch (failure) {
        setError(
          failure instanceof Error
            ? failure.message
            : "That did not go through. Please try again.",
        );
        const current = roomReference.current;
        if (
          current &&
          failure instanceof RequestError &&
          failure.status === 409
        ) {
          try {
            const result = await requestApi<{ room: RoomView }>(
              `/api/rooms/${current.code}?heartbeat=1`,
            );
            acceptRoom(result.room);
            if (
              action === "reset" &&
              result.room.roundId !== current.roundId &&
              result.room.winner === null
            )
              setError("");
            if (
              action === "start" &&
              result.room.roundId === current.roundId &&
              result.room.roundStarted
            )
              setError("");
          } catch {
            /* The connection indicator supplies recovery feedback. */
          }
        }
      } finally {
        workingReference.current = false;
        setBusyAction(null);
      }
    },
    [acceptRoom],
  );

  const create = (name: string, visibility: Visibility) =>
    perform("create", async () => {
      const result = await requestApi<{ room: RoomView }>(
        "/api/rooms",
        "POST",
        { playerName, name, visibility },
      );
      startRoom(result.room);
    });

  const join = (rawCode: string) =>
    perform("join", async () => {
      const code = normalizeCode(rawCode);
      const result = await requestApi<{ room: RoomView }>(
        `/api/rooms/${encodeURIComponent(code)}`,
        "POST",
        { playerName },
      );
      startRoom(result.room);
    });

  const clearRoom = useCallback(() => {
    roomReference.current = null;
    setRoom(null);
    setError("");
    rememberRoom(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("room");
    window.history.replaceState(null, "", url);
  }, []);

  const act = (input: RoomAction) =>
    perform(input.action, async () => {
      const current = roomReference.current;
      if (!current) return;
      const { action } = input;
      if (current.closed && action === "leave") {
        clearRoom();
        return;
      }
      if (action === "leave") {
        await requestApi<{ left: true }>(
          `/api/rooms/${current.code}`,
          "PATCH",
          { action: "leave" },
        );
        clearRoom();
        return;
      }
      const result = await requestApi<{ room: RoomView }>(
        `/api/rooms/${current.code}`,
        "PATCH",
        {
          ...input,
          revision: current.revision,
          roundId: current.roundId,
        },
      );
      acceptRoom(result.room);
    });

  return {
    ready,
    playerName,
    setPlayerName,
    room,
    animatedMoves,
    ...publicRooms,
    error,
    busyAction,
    connected,
    invitationCode,
    create,
    join,
    act,
  };
}

export type ArcadeController = ReturnType<typeof useArcade>;
