export type Seat = 0 | 1;
export type Cell = Seat | null;
export type Visibility = "public" | "private";
export type StarterChoice = "bolt" | "flame" | "random";
export type GameResult = Seat | "draw" | null;

export interface StoredPlayer {
  name: string;
  tokenHash: string;
}

export interface StoredRoom {
  code: string;
  name: string;
  visibility: Visibility;
  creatorName: string | null;
  players: [StoredPlayer | null, StoredPlayer | null];
  board: Cell[];
  turn: Seat;
  starterChoice: StarterChoice;
  roundStarted: boolean;
  startingSeat: Seat | null;
  winner: GameResult;
  winningLine: number[];
  scores: [number, number];
  draws: number;
  round: number;
  roundId: string;
  revision: number;
  createdAt: number;
  expiresAt: number;
  closed: boolean;
}

export interface RoomView extends Omit<StoredRoom, "players"> {
  players: [{ name: string; online: boolean } | null, { name: string; online: boolean } | null];
  yourSeat: Seat;
  status: "waiting" | "ready" | "playing" | "finished" | "closed";
}

export interface LobbySummary {
  code: string;
  name: string;
  creatorName: string | null;
  occupied: number;
  status: "waiting" | "ready" | "playing" | "finished";
  yours: boolean;
}

export const CHARACTERS = [
  { name: "Bolt", label: "Team Bolt", color: "mint" },
  { name: "Flame", label: "Team Flame", color: "orange" },
] as const;

export function formatCode(code: string): string {
  return code.match(/.{1,4}/g)?.join("-") ?? code;
}

export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, "");
}
