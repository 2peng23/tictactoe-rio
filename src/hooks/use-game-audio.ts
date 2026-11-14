"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GameAudio } from "@/lib/game-audio";
import type { RoomView, Seat } from "@/lib/types";

export function useGameAudio(room: RoomView | null) {
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [audioSupported, setAudioSupported] = useState(true);
  const enabledReference = useRef(true);
  const audioReference = useRef<GameAudio | null>(null);
  const previousRoom = useRef<RoomView | null>(null);

  const audio = useCallback(() => {
    if (!audioReference.current) {
      try { audioReference.current = new GameAudio(); }
      catch { enabledReference.current = false; setSoundEnabled(false); setAudioSupported(false); return null; }
    }
    return audioReference.current;
  }, []);

  useEffect(() => {
    let disposed = false;
    Promise.resolve().then(() => {
      if (disposed) return;
      try {
        const enabled = localStorage.getItem("tactix-sound") !== "off";
        enabledReference.current = enabled;
        setSoundEnabled(enabled);
        audioReference.current?.setMuted(!enabled);
      } catch { /* Audio preferences are optional. */ }
    });
    const unlock = () => { if (enabledReference.current) void audio()?.unlock().catch(() => {}); };
    document.addEventListener("pointerdown", unlock, true);
    document.addEventListener("keydown", unlock, true);
    return () => {
      disposed = true;
      document.removeEventListener("pointerdown", unlock, true);
      document.removeEventListener("keydown", unlock, true);
      audioReference.current?.dispose();
      audioReference.current = null;
    };
  }, [audio]);

  useEffect(() => {
    const previous = previousRoom.current;
    previousRoom.current = room;
    if (!room || !previous || room.code !== previous.code || room.roundId !== previous.roundId || !enabledReference.current) return;
    const player = audioReference.current;
    if (!player) return;
    const newMoveCount = room.board.filter((cell, position) => cell !== null && previous.board[position] === null).length;
    const first = previous.roundStarted ? previous.turn : room.startingSeat ?? previous.turn;
    for (let index = 0; index < newMoveCount; index += 1) player.playMove(((first + index) % 2) as Seat, index * 0.05);
    if (!previous.roundStarted && room.roundStarted && room.startingSeat !== null && newMoveCount === 0) player.playStart(room.startingSeat, room.starterChoice === "random");
    if (previous.winner === null && room.winner !== null) player.playResult(room.winner === "draw" ? "draw" : room.winner === room.yourSeat ? "win" : "loss");
  }, [room]);

  const toggleSound = () => {
    const enabled = !enabledReference.current;
    enabledReference.current = enabled;
    setSoundEnabled(enabled);
    try { localStorage.setItem("tactix-sound", enabled ? "on" : "off"); } catch { /* Optional preference. */ }
    const player = enabled ? audio() : audioReference.current;
    player?.setMuted(!enabled);
    if (enabled) void player?.unlock().then(() => player.playEnabled()).catch(() => {});
  };

  return { soundEnabled, toggleSound, audioSupported };
}
