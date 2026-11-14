import type { Cell, Seat, StarterChoice, StoredRoom } from "./types";

export class GameError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "GameError";
  }
}

export const WINNING_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
] as const;

export function getResult(board: readonly Cell[]) {
  for (const line of WINNING_LINES) {
    const first = board[line[0]];
    if (first !== null && line.every((position) => board[position] === first)) {
      return { winner: first, winningLine: [...line] };
    }
  }
  return { winner: board.every((cell) => cell !== null) ? "draw" as const : null, winningLine: [] };
}

export function findSeat(room: StoredRoom, tokenHash: string): Seat {
  const seat = room.players.findIndex((player) => player?.tokenHash === tokenHash);
  if (seat !== 0 && seat !== 1) throw new GameError("You are not a player in this room. Join it first.", 403);
  return seat;
}

export function applyMove(room: StoredRoom, seat: Seat, position: number): StoredRoom {
  if (room.closed) throw new GameError("This room is closed.", 410);
  if (!room.players[0] || !room.players[1]) throw new GameError("Your opponent has not joined yet.", 409);
  if (!room.roundStarted) throw new GameError("Choose who plays first and start the round.", 409);
  if (room.winner !== null) throw new GameError("This round is over. Choose Play again to start another.", 409);
  if (room.turn !== seat) throw new GameError("It is your opponent’s turn.", 409);
  if (!Number.isInteger(position) || position < 0 || position > 8) throw new GameError("Choose a square on the board.");
  if (room.board[position] !== null) throw new GameError("That square is already taken.", 409);
  const next = structuredClone(room);
  next.board[position] = seat;
  const result = getResult(next.board);
  next.winner = result.winner;
  next.winningLine = result.winningLine;
  if (result.winner === "draw") next.draws += 1;
  else if (result.winner !== null) next.scores[result.winner] += 1;
  else next.turn = seat === 0 ? 1 : 0;
  return next;
}

export function resetRound(room: StoredRoom, roundId: string): StoredRoom {
  if (room.closed) throw new GameError("This room has closed.", 410);
  return { ...room, board: Array<Cell>(9).fill(null), turn: 0, winner: null, winningLine: [], round: room.round + 1, roundId, roundStarted: false, startingSeat: null };
}

export function chooseStarter(room: StoredRoom, choice: unknown): StoredRoom {
  if (room.roundStarted) throw new GameError("The round has started. Choose the starter next round.", 409);
  if (choice !== "bolt" && choice !== "flame" && choice !== "random") throw new GameError("Choose Bolt, Flame, or Random.");
  return { ...room, starterChoice: choice as StarterChoice };
}

export function startRound(room: StoredRoom, randomSeat: Seat): StoredRoom {
  if (room.closed) throw new GameError("This room is closed.", 410);
  if (room.players.some((player) => player === null)) throw new GameError("Wait for another player to join.", 409);
  if (room.roundStarted) throw new GameError("This round has already started.", 409);
  const startingSeat = room.starterChoice === "random" ? randomSeat : room.starterChoice === "bolt" ? 0 : 1;
  return { ...room, turn: startingSeat, startingSeat, roundStarted: true };
}

/** Older saved games retain their board and historical first-player rule. */
export function normalizeRoom(room: StoredRoom): StoredRoom {
  const alreadyPlaying = room.board.some((cell) => cell !== null) || room.winner !== null;
  return {
    ...room,
    creatorName: room.creatorName ?? null,
    starterChoice: room.starterChoice ?? (alreadyPlaying ? "bolt" : "random"),
    roundStarted: room.roundStarted ?? alreadyPlaying,
    startingSeat: room.startingSeat === undefined ? alreadyPlaying ? 0 : null : room.startingSeat,
  };
}

export function releaseSeat(room: StoredRoom, seat: Seat, roundId: string): StoredRoom {
  const next = resetRound(room, roundId);
  next.players = [...room.players];
  next.players[seat] = null;
  next.scores = [0, 0];
  next.draws = 0;
  next.round = 1;
  next.starterChoice = "random";
  next.closed = next.players.every((player) => player === null);
  return next;
}

export function validateName(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string") throw new GameError(`Enter ${label}.`);
  const name = value.trim().replace(/\s+/g, " ");
  if (!name || [...name].length > maximum || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new GameError(`${label[0].toUpperCase()}${label.slice(1)} must be 1–${maximum} characters.`);
  }
  return name;
}
