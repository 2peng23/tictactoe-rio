import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { checkRateLimit, getDatabase, loadRoom, readPresence, saveRoom, touchPresence } from "./database";
import { applyMove, chooseStarter, findSeat, GameError, normalizeRoom, releaseSeat, resetRound, startRound, validateName } from "./game";
import { normalizeCode, type LobbySummary, type RoomView, type Seat, type StoredRoom, type Visibility } from "./types";

const ROOM_LIFETIME = 6 * 60 * 60 * 1000;
export const ONLINE_WINDOW = 15_000;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function parseCode(value: string): string {
  const code = normalizeCode(value);
  if (!/^[A-HJ-NP-Z2-9]{16}$/.test(code)) throw new GameError("Enter the full 16-character room code from your invitation.");
  return code;
}

async function roomView(room: StoredRoom, tokenHash: string): Promise<RoomView> {
  const yourSeat = findSeat(room, tokenHash);
  const presence = await readPresence(room.code);
  const now = Date.now();
  const players = room.players.map((player) => player ? {
    name: player.name,
    online: now - (presence.get(player.tokenHash) ?? 0) < ONLINE_WINDOW,
  } : null) as RoomView["players"];
  return {
    ...room, players, yourSeat,
    status: room.closed ? "closed" : room.players.some((player) => player === null) ? "waiting" : room.winner !== null ? "finished" : !room.roundStarted ? "ready" : "playing",
  };
}

export async function createRoom(input: Record<string, unknown>, tokenHash: string): Promise<RoomView> {
  const playerName = validateName(input.playerName, "your name", 18);
  const name = validateName(input.name, "room name", 32);
  if (input.visibility !== "public" && input.visibility !== "private") throw new GameError("Choose a public or private room.");
  await checkRateLimit(`create:${tokenHash}`, 12, 10 * 60_000);
  const bytes = randomBytes(16);
  const code = [...bytes].map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
  const now = Date.now();
  const room: StoredRoom = {
    code, name, visibility: input.visibility as Visibility, creatorName: playerName,
    players: [{ name: playerName, tokenHash }, null],
    board: Array(9).fill(null), turn: 0, winner: null, winningLine: [],
    starterChoice: "random", roundStarted: false, startingSeat: null,
    scores: [0, 0], draws: 0, round: 1, roundId: randomUUID(), revision: 1,
    createdAt: now, expiresAt: now + ROOM_LIFETIME, closed: false,
  };
  const database = await getDatabase();
  await database.batch([
    { sql: "DELETE FROM presence WHERE code IN (SELECT code FROM rooms WHERE expires_at <= ?)", args: [now] },
    { sql: "DELETE FROM rooms WHERE expires_at <= ?", args: [now] },
    { sql: "DELETE FROM rate_limits WHERE window_started < ?", args: [now - 24 * 60 * 60_000] },
  ], "write");
  await database.execute({
    sql: "INSERT INTO rooms (code, visibility, revision, created_at, expires_at, state) VALUES (?, ?, ?, ?, ?, ?)",
    args: [code, room.visibility, room.revision, now, room.expiresAt, JSON.stringify(room)],
  });
  await touchPresence(code, tokenHash);
  return roomView(room, tokenHash);
}

export async function joinRoom(rawCode: string, playerName: unknown, tokenHash: string): Promise<RoomView> {
  const code = parseCode(rawCode);
  const name = validateName(playerName, "your name", 18);
  await checkRateLimit(`join:${tokenHash}`, 60, 60_000);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const room = await loadRoom(code);
    if (room.closed) throw new GameError("This room has closed. Create a new one to play again.", 410);
    if (room.players.some((player) => player?.tokenHash === tokenHash)) {
      await touchPresence(code, tokenHash);
      return roomView(room, tokenHash);
    }
    const availableSeat = room.players.findIndex((player) => player === null);
    if (availableSeat !== 0 && availableSeat !== 1) throw new GameError("This room is full. Only two players can join.", 409);
    const joined = structuredClone(room);
    joined.players[availableSeat] = { name, tokenHash };
    joined.revision += 1;
    if (await saveRoom(joined, room.revision)) {
      await touchPresence(code, tokenHash);
      return roomView(joined, tokenHash);
    }
  }
  throw new GameError("The room changed while you were joining. Please try again.", 409);
}

export async function getRoom(rawCode: string, tokenHash: string, heartbeat: boolean): Promise<RoomView> {
  const room = await loadRoom(parseCode(rawCode));
  findSeat(room, tokenHash);
  if (heartbeat && !room.closed) await touchPresence(room.code, tokenHash);
  return roomView(room, tokenHash);
}

export async function listRooms(tokenHash: string): Promise<LobbySummary[]> {
  const database = await getDatabase();
  const now = Date.now();
  const result = await database.execute({
    sql: `SELECT state FROM rooms WHERE visibility = 'public' AND closed = 0 AND expires_at > ?
      AND EXISTS (SELECT 1 FROM presence WHERE presence.code = rooms.code AND last_seen > ?
        AND token_hash IN (json_extract(rooms.state, '$.players[0].tokenHash'), json_extract(rooms.state, '$.players[1].tokenHash')))
      ORDER BY created_at DESC LIMIT 18`,
    args: [now, now - 90_000],
  });
  return result.rows.map((row) => {
    const room = normalizeRoom(JSON.parse(String(row.state)) as StoredRoom);
    return {
      code: room.code, name: room.name, creatorName: room.creatorName, occupied: room.players.filter(Boolean).length,
      status: room.players.some((player) => player === null) ? "waiting" : room.winner !== null ? "finished" : !room.roundStarted ? "ready" : "playing",
      yours: room.players.some((player) => player?.tokenHash === tokenHash),
    };
  });
}

export async function changeRoom(rawCode: string, input: Record<string, unknown>, tokenHash: string): Promise<RoomView> {
  const code = parseCode(rawCode);
  await checkRateLimit(`action:${tokenHash}`, 120, 60_000);
  const room = await loadRoom(code);
  const seat = findSeat(room, tokenHash);
  if (room.closed) throw new GameError("This room is closed.", 410);
  if (input.roundId !== room.roundId || input.revision !== room.revision) {
    throw new GameError("The board just changed. Try again with the latest round.", 409);
  }
  let next: StoredRoom;
  if (input.action === "starter") {
    next = chooseStarter(room, input.starterChoice);
  } else if (input.action === "start") {
    const presence = await readPresence(code);
    if (room.players.some((player) => !player || Date.now() - (presence.get(player.tokenHash) ?? 0) >= ONLINE_WINDOW)) {
      throw new GameError("Both players must be connected to start.", 409);
    }
    next = startRound(room, randomInt(0, 2) as Seat);
  } else if (input.action === "move") {
    const presence = await readPresence(code);
    const opponent = room.players[seat === 0 ? 1 : 0];
    if (opponent && Date.now() - (presence.get(opponent.tokenHash) ?? 0) >= ONLINE_WINDOW) {
      throw new GameError("Your opponent is reconnecting. Wait for them to return.", 409);
    }
    if (typeof input.position !== "number") throw new GameError("Choose a square on the board.");
    next = applyMove(room, seat, input.position);
  } else if (input.action === "reset") {
    if (room.players.some((player) => player === null)) throw new GameError("Wait for another player before starting a round.", 409);
    next = resetRound(room, randomUUID());
  }
  else throw new GameError("That game action is not supported.");
  next.revision = room.revision + 1;
  if (!await saveRoom(next, room.revision)) throw new GameError("The board just changed. Please try again.", 409);
  await touchPresence(code, tokenHash);
  return roomView(next, tokenHash);
}

export async function leaveRoom(rawCode: string, tokenHash: string): Promise<void> {
  const code = parseCode(rawCode);
  await checkRateLimit(`action:${tokenHash}`, 120, 60_000);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const room = await loadRoom(code);
    const seat = findSeat(room, tokenHash);
    const next = releaseSeat(room, seat, randomUUID());
    next.revision = room.revision + 1;
    if (await saveRoom(next, room.revision)) {
      const database = await getDatabase();
      await database.execute({ sql: "DELETE FROM presence WHERE code = ? AND token_hash = ?", args: [code, tokenHash] });
      return;
    }
  }
  throw new GameError("The room changed while you were leaving. Please try again.", 409);
}
