"use client";

import type { RoomView } from "@/lib/types";
import { Character } from "./character";
import { Dialog } from "./dialog";

interface RoundResultProps {
  room: RoomView;
  busyAction: string | null;
  connected: boolean;
  error: string;
  onPlayAgain: () => void;
  onLeave: () => void;
  onClose: () => void;
}

export function RoundResult({ room, busyAction, connected, error, onPlayAgain, onLeave, onClose }: RoundResultProps) {
  const draw = room.winner === "draw";
  const won = room.winner === room.yourSeat;
  const winningName = typeof room.winner === "number" ? room.players[room.winner]?.name : "";
  const title = draw ? "It’s a draw." : won ? "You won." : "You lost.";
  return <Dialog title={title} onClose={onClose} className={`result-dialog ${draw ? "result-draw" : won ? "result-win" : "result-loss"}`}>
    <div className="result-characters" aria-hidden="true">{draw ? <><Character seat={0}/><Character seat={1}/></> : typeof room.winner === "number" ? <Character seat={room.winner}/> : null}</div>
    <p className="result-description">{draw ? "No one takes this round." : won ? `Round ${room.round} is yours.` : `${winningName} won round ${room.round}.`}</p>
    <p className="result-score" aria-label="Match score">{room.players[0]?.name} <strong>{room.scores[0]}</strong><span>–</span><strong>{room.scores[1]}</strong> {room.players[1]?.name}</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!connected && <p className="connection-message" role="status">Reconnecting…</p>}
    <div className="result-actions"><button className="button button-primary" data-dialog-autofocus disabled={!!busyAction || !connected} onClick={onPlayAgain}>{busyAction === "reset" ? "Starting…" : "Play again"}</button><button className="button button-secondary" disabled={!!busyAction} onClick={onLeave}>{busyAction === "leave" ? "Leaving…" : "Leave room"}</button></div>
  </Dialog>;
}
