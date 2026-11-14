import assert from "node:assert/strict";
import { test } from "node:test";
import { applyMove, chooseStarter, findSeat, GameError, getResult, normalizeRoom, resetRound, startRound, validateName, WINNING_LINES } from "../src/lib/game";
import type { Cell, Seat, StoredRoom } from "../src/lib/types";

function fixture(): StoredRoom {
  return {
    code: "ABCDEFGHJKLMNPQR", name: "A friendly rivalry", visibility: "public", creatorName: "Alex",
    players: [{ name: "Alex", tokenHash: "host" }, { name: "Sam", tokenHash: "rival" }],
    board: Array<Cell>(9).fill(null), turn: 0, winner: null, winningLine: [],
    starterChoice: "bolt", roundStarted: true, startingSeat: 0,
    scores: [0, 0], draws: 0, round: 1, roundId: "first", revision: 1,
    createdAt: 1, expiresAt: Date.now() + 60_000, closed: false,
  };
}

for (const seat of [0, 1] as Seat[]) {
  for (const [lineIndex, line] of WINNING_LINES.entries()) {
    test(`recognizes winning line ${lineIndex + 1} for player ${seat + 1}`, () => {
      const board = Array<Cell>(9).fill(null);
      line.forEach((position) => { board[position] = seat; });
      assert.deepEqual(getResult(board), { winner: seat, winningLine: [...line] });
    });
  }
}

test("a valid move changes turn and leaves the previous board intact", () => {
  const original = fixture();
  const moved = applyMove(original, 0, 4);
  assert.equal(moved.board[4], 0);
  assert.equal(moved.turn, 1);
  assert.equal(original.board[4], null);
});

test("rejects out-of-turn moves, occupied cells and invalid positions", () => {
  const room = fixture();
  assert.throws(() => applyMove(room, 1, 0), /opponent’s turn/);
  for (const position of [-1, 9, 1.5, NaN]) assert.throws(() => applyMove(room, 0, position), GameError);
  const moved = applyMove(room, 0, 0);
  assert.throws(() => applyMove(moved, 1, 0), /already taken/);
});

test("rejects play before a rival joins and after closure", () => {
  const room = fixture();
  room.players[1] = null;
  assert.throws(() => applyMove(room, 0, 0), /not joined/);
  room.closed = true;
  assert.throws(() => applyMove(room, 0, 0), /closed/);
});

test("a win scores once and prevents further moves", () => {
  let room = fixture();
  for (const position of [0, 3, 1, 4, 2]) room = applyMove(room, room.turn, position);
  assert.equal(room.winner, 0);
  assert.deepEqual(room.scores, [1, 0]);
  assert.throws(() => applyMove(room, 1, 8), /round is over/);
});

test("a draw scores once and a ninth-square win takes priority over a draw", () => {
  let room = fixture();
  for (const position of [0, 1, 2, 4, 3, 5, 7, 6, 8]) room = applyMove(room, room.turn, position);
  assert.equal(room.winner, "draw");
  assert.equal(room.draws, 1);
  assert.deepEqual(room.scores, [0, 0]);
  assert.throws(() => applyMove(room, 1, 0), /round is over/);
  assert.equal(getResult([0, 1, 0, 1, 0, 1, 0, 0, 1]).winner, 0);
});

test("reset clears an unfinished or finished round, preserves scores, and invalidates its identity", () => {
  const room = fixture();
  room.board[0] = 0; room.scores = [2, 3]; room.draws = 4; room.winner = 1;
  const reset = resetRound(room, "second");
  assert.deepEqual(reset.board, Array(9).fill(null));
  assert.deepEqual(reset.scores, [2, 3]);
  assert.equal(reset.draws, 4);
  assert.equal(reset.roundId, "second");
  assert.equal(reset.winner, null);
  assert.equal(reset.round, 2);
  assert.equal(reset.turn, 0);
  assert.equal(reset.roundStarted, false);
  assert.equal(reset.startingSeat, null);
});

test("manual starter choices select the right player and lock once started", () => {
  const ready = { ...fixture(), roundStarted: false, startingSeat: null };
  const flame = startRound(chooseStarter(ready, "flame"), 0);
  assert.equal(flame.turn, 1);
  assert.equal(flame.startingSeat, 1);
  assert.equal(applyMove(flame, 1, 4).board[4], 1);
  assert.throws(() => chooseStarter(flame, "bolt"), /round has started/);
  assert.throws(() => startRound(flame, 0), /already started/);
  const bolt = startRound(chooseStarter(ready, "bolt"), 1);
  assert.equal(bolt.turn, 0);
  assert.throws(() => chooseStarter(ready, "someone"), GameError);
  assert.throws(() => applyMove(ready, 0, 4), /start the round/);
});

test("both random outcomes resolve deterministically from the server draw", () => {
  const ready = chooseStarter({ ...fixture(), roundStarted: false, startingSeat: null }, "random");
  for (const result of [0, 1] as Seat[]) {
    const started = startRound(ready, result);
    assert.equal(started.turn, result);
    assert.equal(started.startingSeat, result);
    assert.equal(ready.roundStarted, false);
  }
});

test("legacy rooms preserve active boards and do not invent creator metadata", () => {
  const legacy = { ...fixture(), board: [0, null, null, null, null, null, null, null, null] } as Partial<StoredRoom>;
  delete legacy.creatorName; delete legacy.starterChoice; delete legacy.roundStarted; delete legacy.startingSeat;
  const active = normalizeRoom(legacy as StoredRoom);
  assert.equal(active.roundStarted, true);
  assert.equal(active.starterChoice, "bolt");
  assert.equal(active.startingSeat, 0);
  assert.equal(active.creatorName, null);
  assert.equal(active.board[0], 0);
  const empty = normalizeRoom({ ...legacy, board: Array(9).fill(null) } as StoredRoom);
  assert.equal(empty.roundStarted, false);
  assert.equal(empty.starterChoice, "random");
});

test("requires membership and validates names without interpreting markup", () => {
  assert.equal(findSeat(fixture(), "rival"), 1);
  assert.throws(() => findSeat(fixture(), "outsider"), /not a player/);
  assert.equal(validateName("  Great   Rival  ", "your name", 18), "Great Rival");
  assert.throws(() => validateName("", "your name", 18), GameError);
  assert.throws(() => validateName("long".repeat(10), "your name", 18), GameError);
});
