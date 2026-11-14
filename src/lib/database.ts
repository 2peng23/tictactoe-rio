import type { Client } from "@libsql/client";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { GameError, normalizeRoom } from "./game";
import type { StoredRoom } from "./types";

let databasePromise: Promise<Client> | undefined;

async function initializeDatabase(): Promise<Client> {
  const remoteUrl = process.env.TURSO_DATABASE_URL;
  if (process.env.VERCEL && (!remoteUrl || !process.env.TURSO_AUTH_TOKEN)) {
    throw new GameError(
      "The arcade needs its shared database. Configure TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Vercel.",
      503,
    );
  }
  if (process.env.VERCEL && remoteUrl?.startsWith("file:")) {
    throw new GameError(
      "Vercel needs a remote database; local files cannot synchronize deployed games.",
      503,
    );
  }
  const directory = path.join(process.cwd(), ".data");
  if (!remoteUrl) mkdirSync(directory, { recursive: true });
  const { createClient } =
    !remoteUrl || remoteUrl.startsWith("file:")
      ? await import("@libsql/client")
      : await import("@libsql/client/web");
  const database = createClient({
    url: remoteUrl || `file:${path.join(directory, "arcade.db")}`,
    authToken: process.env.TURSO_AUTH_TOKEN || undefined,
    // Local servers can briefly share a write lock; remote clients ignore this.
    timeout: 3000,
  });
  try {
    await database.batch(
      [
        `CREATE TABLE IF NOT EXISTS rooms (
      code TEXT PRIMARY KEY, visibility TEXT NOT NULL, revision INTEGER NOT NULL,
      created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, closed INTEGER NOT NULL DEFAULT 0,
      state TEXT NOT NULL
    )`,
        "CREATE INDEX IF NOT EXISTS rooms_public ON rooms(visibility, closed, expires_at, created_at)",
        `CREATE TABLE IF NOT EXISTS presence (
      code TEXT NOT NULL, token_hash TEXT NOT NULL, last_seen INTEGER NOT NULL,
      PRIMARY KEY (code, token_hash)
    )`,
        "CREATE INDEX IF NOT EXISTS presence_seen ON presence(last_seen)",
        `CREATE TABLE IF NOT EXISTS rate_limits (
      identity TEXT PRIMARY KEY, window_started INTEGER NOT NULL, requests INTEGER NOT NULL
    )`,
      ],
      "write",
    );
  } catch (failure) {
    database.close();
    throw failure;
  }
  return database;
}

export function getDatabase(): Promise<Client> {
  if (!databasePromise) {
    databasePromise = initializeDatabase().catch((error: unknown) => {
      databasePromise = undefined;
      throw error;
    });
  }
  return databasePromise;
}

export async function loadRoom(code: string): Promise<StoredRoom> {
  const database = await getDatabase();
  const result = await database.execute({
    sql: "SELECT state FROM rooms WHERE code = ? AND expires_at > ?",
    args: [code, Date.now()],
  });
  if (!result.rows[0])
    throw new GameError(
      "That room does not exist or its invitation has expired. Check the code or create a new room.",
      404,
    );
  return normalizeRoom(JSON.parse(String(result.rows[0].state)) as StoredRoom);
}

export async function saveRoom(
  room: StoredRoom,
  expectedRevision: number,
): Promise<boolean> {
  const database = await getDatabase();
  const result = await database.execute({
    sql: "UPDATE rooms SET state = ?, revision = ?, closed = ? WHERE code = ? AND revision = ? AND expires_at > ?",
    args: [
      JSON.stringify(room),
      room.revision,
      Number(room.closed),
      room.code,
      expectedRevision,
      Date.now(),
    ],
  });
  return result.rowsAffected === 1;
}

export async function touchPresence(
  code: string,
  tokenHash: string,
): Promise<void> {
  const database = await getDatabase();
  await database.execute({
    sql: "INSERT INTO presence (code, token_hash, last_seen) VALUES (?, ?, ?) ON CONFLICT(code, token_hash) DO UPDATE SET last_seen = excluded.last_seen",
    args: [code, tokenHash, Date.now()],
  });
}

export async function readPresence(code: string): Promise<Map<string, number>> {
  const database = await getDatabase();
  const result = await database.execute({
    sql: "SELECT token_hash, last_seen FROM presence WHERE code = ?",
    args: [code],
  });
  return new Map(
    result.rows.map((row) => [String(row.token_hash), Number(row.last_seen)]),
  );
}

export async function checkRateLimit(
  identity: string,
  maximum: number,
  windowMs: number,
): Promise<void> {
  const database = await getDatabase();
  const now = Date.now();
  const result = await database.execute({
    sql: `INSERT INTO rate_limits (identity, window_started, requests) VALUES (?, ?, 1)
      ON CONFLICT(identity) DO UPDATE SET
      requests = CASE WHEN window_started < ? THEN 1 ELSE requests + 1 END,
      window_started = CASE WHEN window_started < ? THEN excluded.window_started ELSE window_started END
      RETURNING requests`,
    args: [identity, now, now - windowMs, now - windowMs],
  });
  if (Number(result.rows[0].requests) > maximum)
    throw new GameError("Too many requests. Try again shortly.", 429);
}
