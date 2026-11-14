"use client";

import { useEffect, useRef, useState } from "react";
import type { ArcadeController } from "@/hooks/use-arcade";
import { CHARACTERS, normalizeCode, type Visibility } from "@/lib/types";
import { Character } from "./character";
import { Icon } from "./icon";

export function Lobby({ arcade }: { arcade: ArcadeController }) {
  const [mode, setMode] = useState<"create" | "join" | "public">("create");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [roomName, setRoomName] = useState("");
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [invitationDismissed, setInvitationDismissed] = useState(false);
  const [page, setPage] = useState(0);
  const nameReference = useRef<HTMLInputElement>(null);
  const invitation = arcade.invitationCode;
  const activeMode = invitation && !invitationDismissed ? "join" : mode;
  const effectiveCode = joinCode ?? invitation;
  const pageCount = Math.max(1, Math.ceil(arcade.rooms.length / 2));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleRooms = arcade.rooms.slice(currentPage * 2, currentPage * 2 + 2);

  useEffect(() => {
    if (invitation) nameReference.current?.focus({ preventScroll: true });
  }, [invitation]);
  const ensureName = () => {
    if (arcade.playerName.trim()) return true;
    nameReference.current?.focus();
    nameReference.current?.reportValidity();
    return false;
  };

  return (
    <section className="lobby-section" id="lobby" aria-labelledby="lobby-title">
      <div className="lobby-intro">
        <div className="lobby-heading">
          <p className="game-category">A GAME FOR TWO</p>
          <h1 id="lobby-title">
            Tic-tac-toe<span aria-hidden="true">.</span>
          </h1>
          <p>Create a room or join a friend.</p>
        </div>
        <div
          className="piece-preview"
          role="img"
          aria-label="Mint lightning bolt and orange flame pieces on a Tic-Tac-Toe board"
        >
          <div className="preview-board">
            {([0, null, 1, null, 0, null, 1, null, null] as const).map(
              (seat, index) => (
                <div key={index}>
                  {seat !== null && <Character seat={seat} />}
                </div>
              ),
            )}
          </div>
          <div className="piece-labels">
            <span>
              <Character seat={0} />
              {CHARACTERS[0].name}
            </span>
            <span>vs</span>
            <span>
              <Character seat={1} />
              {CHARACTERS[1].name}
            </span>
          </div>
        </div>
      </div>
      <div className="lobby-panel">
        <div className="panel-top">
          <span className="panel-title">Let’s play</span>
          <span
            className={`live-status ${arcade.lobbyError || arcade.loadingRooms ? "unavailable" : ""}`}
          >
            <i />
            {arcade.lobbyError
              ? "Offline"
              : arcade.loadingRooms
                ? "Connecting"
                : "Live"}
          </span>
        </div>
        <div className="field name-field">
          <label htmlFor="player-name">Your name</label>
          <input
            ref={nameReference}
            id="player-name"
            name="playerName"
            autoComplete="nickname"
            value={arcade.playerName}
            onChange={(event) => arcade.setPlayerName(event.target.value)}
            maxLength={18}
            disabled={!arcade.ready}
            required
          />
        </div>
        <div className="creator-tabs" role="group" aria-label="Room action">
          <button
            type="button"
            aria-pressed={activeMode === "create"}
            onClick={() => {
              setMode("create");
              setInvitationDismissed(true);
            }}
          >
            Create
          </button>
          <button
            type="button"
            aria-pressed={activeMode === "join"}
            onClick={() => {
              setMode("join");
              setInvitationDismissed(true);
            }}
          >
            Join
          </button>
          <button
            type="button"
            aria-pressed={activeMode === "public"}
            onClick={() => {
              setMode("public");
              setInvitationDismissed(true);
            }}
          >
            Public rooms
            <span className="room-count">{arcade.rooms.length}</span>
          </button>
        </div>
        {activeMode === "public" ? (
          <section className="public-rooms" aria-label="Public rooms">
            <div className="public-heading">
              <span>
                {arcade.rooms.length}{" "}
                {arcade.rooms.length === 1 ? "room" : "rooms"} available
              </span>
              <button
                className="icon-button"
                aria-label="Refresh public rooms"
                title="Refresh rooms"
                onClick={() => {
                  void arcade.refreshRooms();
                }}
                disabled={arcade.refreshingRooms}
              >
                <Icon name="refresh" size={16} />
              </button>
            </div>
            <div
              className="room-list"
              aria-live="polite"
              aria-busy={arcade.loadingRooms}
            >
              {arcade.loadingRooms ? (
                <p className="room-empty">Loading rooms…</p>
              ) : arcade.lobbyError ? (
                <div className="room-empty">
                  <p>{arcade.lobbyError}</p>
                  <button
                    className="text-button"
                    onClick={() => {
                      void arcade.refreshRooms();
                    }}
                  >
                    Try again
                  </button>
                </div>
              ) : arcade.rooms.length === 0 ? (
                <div className="room-empty">
                  <p>No public rooms yet.</p>
                  <p className="muted">Create one and invite a player.</p>
                </div>
              ) : (
                visibleRooms.map((room) => (
                  <div className="public-room" key={room.code}>
                    <div className="room-details">
                      <strong>{room.name}</strong>
                      <span className="room-creator-name">
                        {room.creatorName
                          ? `Created by ${room.creatorName}`
                          : "Creator unavailable"}
                      </span>
                      <span className="room-occupancy">
                        {room.occupied} of 2 players
                        {room.occupied === 2 ? " · Full" : " · Open seat"}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="button button-secondary room-join"
                      disabled={
                        !!arcade.busyAction ||
                        (room.occupied === 2 && !room.yours)
                      }
                      onClick={() => {
                        if (ensureName()) void arcade.join(room.code);
                      }}
                    >
                      {room.yours
                        ? "Resume"
                        : room.occupied === 2
                          ? "Full"
                          : "Join"}
                    </button>
                  </div>
                ))
              )}
            </div>
            {pageCount > 1 && (
              <div className="room-pagination">
                <button
                  className="icon-button"
                  aria-label="Previous rooms"
                  disabled={currentPage === 0}
                  onClick={() => setPage(currentPage - 1)}
                >
                  <Icon name="previous" />
                </button>
                <span>
                  {currentPage + 1} / {pageCount}
                </span>
                <button
                  className="icon-button"
                  aria-label="Next rooms"
                  disabled={currentPage === pageCount - 1}
                  onClick={() => setPage(currentPage + 1)}
                >
                  <Icon name="next" />
                </button>
              </div>
            )}
            {arcade.error && (
              <p className="form-error" role="alert">
                {arcade.error}
              </p>
            )}
          </section>
        ) : (
          <form
            className="room-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!ensureName()) return;
              if (activeMode === "join") void arcade.join(effectiveCode);
              else void arcade.create(roomName, visibility);
            }}
          >
            {invitation && activeMode === "join" && (
              <p className="invitation-note">
                You’re invited. Enter your name to join.
              </p>
            )}
            {activeMode === "create" ? (
              <>
                <div className="field">
                  <label htmlFor="room-name">Room name</label>
                  <input
                    id="room-name"
                    name="roomName"
                    value={roomName}
                    onChange={(event) => setRoomName(event.target.value)}
                    maxLength={32}
                    required
                  />
                </div>
                <fieldset className="visibility-field">
                  <legend>Visibility</legend>
                  <div className="visibility-options">
                    <label className="visibility-option">
                      <input
                        type="radio"
                        name="visibility"
                        value="public"
                        checked={visibility === "public"}
                        onChange={() => setVisibility("public")}
                      />
                      <Icon name="globe" />
                      <span>
                        <strong>Public room</strong>
                        <small>Anyone can join</small>
                      </span>
                    </label>
                    <label className="visibility-option">
                      <input
                        type="radio"
                        name="visibility"
                        value="private"
                        checked={visibility === "private"}
                        onChange={() => setVisibility("private")}
                      />
                      <Icon name="lock" />
                      <span>
                        <strong>Private room</strong>
                        <small>Invitation only</small>
                      </span>
                    </label>
                  </div>
                </fieldset>
              </>
            ) : (
              <div className="field">
                <label htmlFor="join-code">Room code</label>
                <input
                  id="join-code"
                  className="code-input"
                  name="code"
                  value={effectiveCode}
                  onChange={(event) =>
                    setJoinCode(event.target.value.toUpperCase())
                  }
                  maxLength={24}
                  autoComplete="off"
                  spellCheck={false}
                  required
                />
              </div>
            )}
            {arcade.error && (
              <p className="form-error" role="alert">
                {arcade.error}
              </p>
            )}
            <button
              className="button button-primary create-button"
              disabled={
                !arcade.ready ||
                !!arcade.busyAction ||
                (activeMode === "join" &&
                  normalizeCode(effectiveCode).length !== 16)
              }
              type="submit"
            >
              {arcade.busyAction === "create"
                ? "Creating…"
                : arcade.busyAction === "join"
                  ? "Joining…"
                  : activeMode === "create"
                    ? "Create room"
                    : "Join room"}
              <Icon name="right" />
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
