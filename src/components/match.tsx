"use client";

import { useEffect, useRef, useState } from "react";
import type { ArcadeController } from "@/hooks/use-arcade";
import { CHARACTERS, type RoomView, type Seat } from "@/lib/types";
import { Character } from "./character";
import { Dialog } from "./dialog";
import { RoomInvitation } from "./room-invitation";
import { RoundResult } from "./round-result";
import { Icon } from "./icon";
import { MovePiece } from "./move-piece";
import { StarterPicker } from "./starter-picker";

export function Match({
  arcade,
  room,
}: {
  arcade: ArcadeController;
  room: RoomView;
}) {
  const [leaving, setLeaving] = useState(false);
  const [dismissedRound, setDismissedRound] = useState<string | null>(null);
  const titleReference = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titleReference.current?.focus({ preventScroll: true });
  }, [room.roundId]);
  const waiting = room.status === "waiting";
  const finished = room.status === "finished";
  const closed = room.status === "closed";
  const allOnline = room.players.every((player) => player?.online);
  const yourTurn = room.turn === room.yourSeat;
  const canPlay =
    room.status === "playing" &&
    allOnline &&
    arcade.connected &&
    yourTurn &&
    !arcade.busyAction;
  const winnerName =
    typeof room.winner === "number" ? room.players[room.winner]?.name : "";
  const resultOpen = finished && dismissedRound !== room.roundId && !leaving;
  const status = closed
    ? "Your opponent left the room."
    : !arcade.connected
      ? "Reconnecting…"
      : waiting
        ? "Waiting for another player"
        : finished
          ? room.winner === "draw"
            ? "Draw"
            : `${winnerName} won`
          : !allOnline
            ? "Your opponent is reconnecting…"
            : yourTurn
              ? "Your turn"
              : `${room.players[room.turn]?.name}’s turn`;

  return (
    <section className="match-section" aria-labelledby="match-title">
      <div className="match-heading">
        <div>
          <h1 id="match-title" ref={titleReference} tabIndex={-1}>
            {room.name}
          </h1>
          <p>
            <Icon
              name={room.visibility === "private" ? "lock" : "globe"}
              size={13}
            />
            {room.visibility === "private" ? "Private room" : "Public room"}
          </p>
        </div>
        <button
          className="text-button leave-button"
          disabled={!!arcade.busyAction}
          onClick={() => {
            if (closed) void arcade.act({ action: "leave" });
            else setLeaving(true);
          }}
        >
          <Icon name="leave" size={16} />
          {closed ? "Return to lobby" : "Leave room"}
        </button>
      </div>
      <div className="game-panel">
        <div className="player-versus">
          {([0, 1] as Seat[]).map((seat) => {
            const player = room.players[seat];
            return (
              <div
                key={seat}
                className={`player-card team-${seat} ${room.turn === seat && room.status === "playing" ? "current-player" : ""}`}
              >
                <Character seat={seat} />
                <div className="player-identity">
                  <strong>{player?.name || "Open seat"}</strong>
                  <span>
                    {CHARACTERS[seat].name}
                    {room.yourSeat === seat
                      ? " · You"
                      : player && !player.online && !closed
                        ? " · Offline"
                        : ""}
                  </span>
                </div>
                <span
                  className="player-score"
                  aria-label={`${player?.name || CHARACTERS[seat].name}: ${room.scores[seat]} wins`}
                >
                  {room.scores[seat]}
                </span>
              </div>
            );
          })}
        </div>
        {waiting || room.status === "ready" ? (
          <StarterPicker arcade={arcade} room={room} />
        ) : (
          <p
            key={`${room.roundId}-${room.roundStarted}`}
            className={`turn-banner ${finished ? "finished" : ""} ${room.roundStarted && room.board.every((cell) => cell === null) ? "starter-reveal" : ""}`}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {room.roundStarted &&
            room.startingSeat !== null &&
            room.board.every((cell) => cell === null) &&
            !closed ? (
              <>
                <span className="starter-result-icon">
                  <Character seat={room.startingSeat} />
                </span>
                {room.starterChoice === "random" && (
                  <Icon name="dice" size={15} />
                )}
                <span>
                  {room.turn === room.yourSeat
                    ? "You go first"
                    : `${room.players[room.turn]?.name} goes first`}
                </span>
              </>
            ) : (
              status
            )}
          </p>
        )}
        <div className="board-stage">
          <div
            className="match-board"
            role="group"
            aria-label="Tic-Tac-Toe board"
            data-round={room.round}
          >
            {room.board.map((cell, position) => (
              <button
                key={`${room.roundId}-${position}`}
                type="button"
                data-cell={position}
                className={`board-cell ${cell !== null ? "occupied" : ""} ${room.winningLine.includes(position) ? "winning-cell" : ""}`}
                aria-label={`Row ${Math.floor(position / 3) + 1}, column ${(position % 3) + 1}: ${cell === null ? "empty" : CHARACTERS[cell].name}`}
                disabled={!canPlay || cell !== null}
                onClick={() => {
                  void arcade.act({ action: "move", position });
                }}
              >
                {cell !== null && (
                  <MovePiece
                    seat={cell}
                    animate={arcade.animatedMoves.includes(position)}
                  />
                )}
              </button>
            ))}
          </div>
        </div>
        {arcade.error && !resultOpen && (
          <p className="form-error game-error" role="alert">
            {arcade.error}
          </p>
        )}
        <div className="game-bottom">
          <p>
            Round {room.round}
            <span className="draw-count">
              {room.draws} {room.draws === 1 ? "draw" : "draws"}
            </span>
          </p>
          {finished ? (
            <button
              className="text-button"
              onClick={() => setDismissedRound(null)}
            >
              View result
            </button>
          ) : (
            <button
              className="text-button reset-button"
              disabled={
                !!arcade.busyAction ||
                !arcade.connected ||
                closed ||
                !room.roundStarted
              }
              onClick={() => {
                void arcade.act({ action: "reset" });
              }}
            >
              <Icon name="reset" size={15} />
              {arcade.busyAction === "reset" ? "Resetting…" : "Reset Game"}
            </button>
          )}
        </div>
      </div>
      {!closed && <RoomInvitation code={room.code} waiting={waiting} />}
      {resultOpen && (
        <RoundResult
          room={room}
          busyAction={arcade.busyAction}
          connected={arcade.connected}
          error={arcade.error}
          onPlayAgain={() => {
            void arcade.act({ action: "reset" });
          }}
          onLeave={() => {
            void arcade.act({ action: "leave" });
          }}
          onClose={() => setDismissedRound(room.roundId)}
        />
      )}
      {leaving && (
        <Dialog title="Leave this room?" onClose={() => setLeaving(false)}>
          <p className="dialog-description">
            Scores reset. The other player stays and can invite someone new.
          </p>
          {arcade.error && (
            <p className="form-error" role="alert">
              {arcade.error}
            </p>
          )}
          <div className="dialog-actions">
            <button
              className="button button-secondary"
              onClick={() => setLeaving(false)}
            >
              Stay
            </button>
            <button
              className="button button-primary"
              disabled={!!arcade.busyAction}
              onClick={() => {
                void arcade.act({ action: "leave" });
              }}
            >
              {arcade.busyAction === "leave" ? "Leaving…" : "Leave room"}
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
