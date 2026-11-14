import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { getDatabase } from "../src/lib/database";
import { changeRoom, createRoom, getRoom, joinRoom, leaveRoom, listRooms, ONLINE_WINDOW } from "../src/lib/rooms";
import type { RoomView, StarterChoice } from "../src/lib/types";

const directory = await mkdtemp(path.join(tmpdir(), "tactix-test-"));
process.env.TURSO_DATABASE_URL = `file:${path.join(directory, "test.db")}`;
delete process.env.VERCEL;

after(async () => { (await getDatabase()).close(); await rm(directory, { recursive: true, force: true }); });

test("local writes wait for a brief database lock held by another server", { timeout: 10_000 }, async () => {
  const database = await getDatabase();
  const locker = spawn(process.execPath, ["--input-type=module", "-e", `
    import { createClient } from "@libsql/client";
    const client = createClient({ url: process.env.TURSO_DATABASE_URL });
    const transaction = await client.transaction("write");
    process.stdout.write("locked\\n");
    setTimeout(async () => { await transaction.commit(); client.close(); }, 200);
  `], { stdio: ["ignore", "pipe", "pipe"], timeout: 5000 });
  const finished = once(locker, "exit");
  try {
    await Promise.race([
      once(locker.stdout, "data"),
      finished.then(() => { throw new Error("The other server failed to acquire its write lock."); }),
    ]);
    await database.execute({ sql: "INSERT INTO rate_limits (identity, window_started, requests) VALUES (?, ?, 1)", args: ["lock-check", Date.now()] });
    assert.equal((await finished)[0], 0);
  } finally {
    if (locker.exitCode === null) locker.kill();
  }
});

async function begin(room: RoomView, token: string, choice: StarterChoice = "bolt") {
  const chosen = await changeRoom(room.code, { action: "starter", starterChoice: choice, revision: room.revision, roundId: room.roundId }, token);
  return changeRoom(room.code, { action: "start", revision: chosen.revision, roundId: chosen.roundId }, token);
}

test("private rooms stay unlisted and nonmembers cannot read or mutate them", async () => {
  const room = await createRoom({ playerName: "Fox", name: "Secret clubhouse", visibility: "private" }, "private-host");
  assert.equal((await listRooms("outsider")).some((entry) => entry.code === room.code), false);
  await assert.rejects(getRoom(room.code, "outsider", false), { status: 403 });
  await assert.rejects(changeRoom(room.code, { action: "reset", revision: room.revision, roundId: room.roundId }, "outsider"), { status: 403 });
  assert.equal(JSON.stringify(room).includes("private-host"), false);
});

test("competing joins reserve exactly one remaining seat; refresh resumes it", async () => {
  const room = await createRoom({ playerName: "Alex", name: "Seat race", visibility: "public" }, "race-host");
  const results = await Promise.allSettled([
    joinRoom(room.code, "Sam", "race-sam"), joinRoom(room.code, "Jo", "race-jo"),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const success = results.find((result) => result.status === "fulfilled");
  assert.ok(success?.status === "fulfilled");
  const winnerToken = success.value.players[1]?.name === "Sam" ? "race-sam" : "race-jo";
  const resumed = await joinRoom(room.code, "A refreshed name", winnerToken);
  assert.equal(resumed.yourSeat, 1);
  assert.equal(resumed.players.filter(Boolean).length, 2);
  await assert.rejects(joinRoom(room.code, "Third", "race-third"), { status: 409 });
});

test("simultaneous moves commit one square; reset invalidates old in-flight moves", async () => {
  let room = await createRoom({ playerName: "Alex", name: "Move race", visibility: "private" }, "move-host");
  await joinRoom(room.code, "Sam", "move-rival");
  room = await getRoom(room.code, "move-host", true);
  room = await begin(room, "move-host");
  const oldRound = room.roundId;
  const results = await Promise.allSettled([0, 1].map((position) => changeRoom(room.code, { action: "move", position, revision: room.revision, roundId: room.roundId }, "move-host")));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  room = await getRoom(room.code, "move-host", true);
  assert.equal(room.board.filter((cell) => cell !== null).length, 1);
  const reset = await changeRoom(room.code, { action: "reset", revision: room.revision, roundId: oldRound }, "move-rival");
  await assert.rejects(changeRoom(room.code, { action: "move", position: 2, revision: room.revision, roundId: oldRound }, "move-host"), { status: 409 });
  assert.notEqual(reset.roundId, oldRound);
  assert.equal((await getRoom(room.code, "move-host", true)).board.filter((cell) => cell !== null).length, 0);
});

test("offline players pause moves, refresh resumes play, and leaving opens a fresh seat", async () => {
  let room = await createRoom({ playerName: "Alex", name: "Reconnect", visibility: "public" }, "offline-host");
  await joinRoom(room.code, "Sam", "offline-rival");
  room = await getRoom(room.code, "offline-host", true);
  room = await begin(room, "offline-host");
  const database = await getDatabase();
  await database.execute({ sql: "UPDATE presence SET last_seen = ? WHERE code = ? AND token_hash = ?", args: [Date.now() - ONLINE_WINDOW - 1000, room.code, "offline-rival"] });
  const paused = await getRoom(room.code, "offline-host", false);
  assert.equal(paused.players[1]?.online, false);
  await assert.rejects(changeRoom(room.code, { action: "move", position: 0, revision: room.revision, roundId: room.roundId }, "offline-host"), /reconnecting/);
  await getRoom(room.code, "offline-rival", true);
  room = await changeRoom(room.code, { action: "move", position: 0, revision: room.revision, roundId: room.roundId }, "offline-host");
  await leaveRoom(room.code, "offline-rival");
  room = await getRoom(room.code, "offline-host", false);
  assert.equal(room.status, "waiting");
  assert.equal(room.players[1], null);
  assert.equal(room.board.filter((cell) => cell !== null).length, 0);
  assert.deepEqual(room.scores, [0, 0]);
  assert.equal(room.round, 1);
  assert.equal((await listRooms("outsider")).find((entry) => entry.code === room.code)?.occupied, 1);
  const joined = await joinRoom(room.code, "New player", "offline-new");
  assert.equal(joined.yourSeat, 1);
  assert.equal(joined.status, "ready");
});

test("creator departure resets wins and draws, keeps the invite, and lets a new Bolt join", async () => {
  let room = await createRoom({ playerName: "Alex", name: "Persistent invite", visibility: "private" }, "creator-host");
  await joinRoom(room.code, "Sam", "creator-rival");
  room = await getRoom(room.code, "creator-host", true);
  room = await begin(room, "creator-host");
  for (const position of [0, 3, 1, 4, 2]) {
    room = await changeRoom(room.code, { action: "move", position, revision: room.revision, roundId: room.roundId }, room.turn === 0 ? "creator-host" : "creator-rival");
  }
  room = await changeRoom(room.code, { action: "reset", revision: room.revision, roundId: room.roundId }, "creator-host");
  room = await begin(room, "creator-host");
  for (const position of [0, 1, 2, 4, 3, 5, 7, 6, 8]) {
    room = await changeRoom(room.code, { action: "move", position, revision: room.revision, roundId: room.roundId }, room.turn === 0 ? "creator-host" : "creator-rival");
  }
  assert.deepEqual(room.scores, [1, 0]);
  assert.equal(room.draws, 1);
  const previousRound = room.roundId;
  const previousRevision = room.revision;
  await leaveRoom(room.code, "creator-host");
  const waiting = await getRoom(room.code, "creator-rival", true);
  assert.equal(waiting.status, "waiting");
  assert.equal(waiting.yourSeat, 1);
  assert.equal(waiting.code, room.code);
  assert.equal(waiting.visibility, "private");
  assert.equal(waiting.players[0], null);
  assert.deepEqual(waiting.scores, [0, 0]);
  assert.equal(waiting.draws, 0);
  assert.equal(waiting.round, 1);
  assert.equal(waiting.winner, null);
  assert.notEqual(waiting.roundId, previousRound);
  await assert.rejects(changeRoom(room.code, { action: "move", position: 8, revision: previousRevision, roundId: previousRound }, "creator-host"), { status: 403 });
  const replacements = await Promise.allSettled([joinRoom(room.code, "Jo", "creator-new-1"), joinRoom(room.code, "Lee", "creator-new-2")]);
  assert.equal(replacements.filter((result) => result.status === "fulfilled").length, 1);
  const replacement = replacements.find((result) => result.status === "fulfilled");
  assert.ok(replacement?.status === "fulfilled");
  assert.equal(replacement.value.yourSeat, 0);
  assert.equal(replacement.value.status, "ready");
  assert.equal(replacement.value.turn, 0);
  await assert.rejects(changeRoom(room.code, { action: "move", position: 8, revision: previousRevision, roundId: previousRound }, "creator-rival"), { status: 409 });
  assert.equal((await listRooms("outsider")).some((entry) => entry.code === room.code), false);
});

test("starter controls are shared, authorized, and fixed after the round starts", async () => {
  let room = await createRoom({ playerName: "Alex", name: "Starter choices", visibility: "private" }, "starter-host");
  await joinRoom(room.code, "Sam", "starter-rival");
  room = await getRoom(room.code, "starter-host", true);
  assert.equal(room.status, "ready");
  await assert.rejects(changeRoom(room.code, { action: "move", position: 0, revision: room.revision, roundId: room.roundId }, "starter-host"), /start the round/);
  await assert.rejects(changeRoom(room.code, { action: "starter", starterChoice: "flame", revision: room.revision, roundId: room.roundId }, "outsider"), { status: 403 });
  room = await begin(room, "starter-rival", "flame");
  assert.equal(room.turn, 1);
  assert.equal((await getRoom(room.code, "starter-host", true)).startingSeat, 1);
  await assert.rejects(changeRoom(room.code, { action: "move", position: 0, revision: room.revision, roundId: room.roundId }, "starter-host"), /opponent’s turn/);
  await assert.rejects(changeRoom(room.code, { action: "starter", starterChoice: "bolt", revision: room.revision, roundId: room.roundId }, "starter-host"), /round has started/);
  room = await changeRoom(room.code, { action: "move", position: 0, revision: room.revision, roundId: room.roundId }, "starter-rival");
  assert.equal(room.board[0], 1);
});

test("simultaneous random starts commit one result that polling never rerolls", async () => {
  let room = await createRoom({ playerName: "Alex", name: "Random draw", visibility: "private" }, "random-host");
  await joinRoom(room.code, "Sam", "random-rival");
  room = await getRoom(room.code, "random-host", true);
  const results = await Promise.allSettled(["random-host", "random-rival"].map((token) => changeRoom(room.code, { action: "start", revision: room.revision, roundId: room.roundId }, token)));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const started = await getRoom(room.code, "random-host", true);
  assert.ok(started.startingSeat === 0 || started.startingSeat === 1);
  for (let index = 0; index < 5; index += 1) assert.equal((await getRoom(room.code, "random-rival", true)).startingSeat, started.startingSeat);
});

test("public creator names remain the original creator after their seat is replaced", async () => {
  const room = await createRoom({ playerName: "Alex", name: "Creator metadata", visibility: "public" }, "metadata-host");
  await joinRoom(room.code, "Sam", "metadata-rival");
  await leaveRoom(room.code, "metadata-host");
  await joinRoom(room.code, "Jo", "metadata-new");
  assert.equal((await listRooms("metadata-viewer")).find((entry) => entry.code === room.code)?.creatorName, "Alex");
  assert.equal((await getRoom(room.code, "metadata-new", true)).players[0]?.name, "Jo");
});

test("simultaneous departures close only the empty room", async () => {
  const room = await createRoom({ playerName: "Alex", name: "Both leaving", visibility: "public" }, "both-host");
  await joinRoom(room.code, "Sam", "both-rival");
  await Promise.all([leaveRoom(room.code, "both-host"), leaveRoom(room.code, "both-rival")]);
  assert.equal((await listRooms("outsider")).some((entry) => entry.code === room.code), false);
  await assert.rejects(joinRoom(room.code, "New", "both-new"), { status: 410 });
});

test("expired and invalid invitations fail clearly", async () => {
  const room = await createRoom({ playerName: "Alex", name: "Expired", visibility: "private" }, "expiry-host");
  const database = await getDatabase();
  await database.execute({ sql: "UPDATE rooms SET expires_at = ? WHERE code = ?", args: [Date.now() - 1, room.code] });
  await assert.rejects(joinRoom(room.code, "Sam", "expiry-rival"), { status: 404 });
  await assert.rejects(joinRoom("ABC", "Sam", "expiry-rival"), { status: 400 });
});
