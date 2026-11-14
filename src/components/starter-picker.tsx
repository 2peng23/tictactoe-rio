"use client";

import type { ArcadeController } from "@/hooks/use-arcade";
import type { RoomView, StarterChoice } from "@/lib/types";
import { Character } from "./character";
import { Icon } from "./icon";

export function StarterPicker({
  arcade,
  room,
}: {
  arcade: ArcadeController;
  room: RoomView;
}) {
  const waiting = room.status === "waiting";
  const unavailable = !!arcade.busyAction || !arcade.connected;
  const options: { value: StarterChoice; label: string }[] = [
    { value: "bolt", label: "Bolt" },
    { value: "flame", label: "Flame" },
    { value: "random", label: "Random" },
  ];
  return (
    <div className="starter-picker">
      <p className="setup-status" role="status">
        {waiting ? "Waiting for another player" : "Choose who plays first"}
      </p>
      <div className="starter-row">
        <div
          className="starter-options"
          role="group"
          aria-label="Who plays first?"
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className="starter-option"
              aria-pressed={room.starterChoice === option.value}
              aria-label={`${option.label} plays first`}
              disabled={unavailable}
              onClick={() => {
                void arcade.act({
                  action: "starter",
                  starterChoice: option.value,
                });
              }}
            >
              {option.value === "random" ? (
                <Icon name="dice" size={16} />
              ) : (
                <Character seat={option.value === "bolt" ? 0 : 1} />
              )}
              {option.label}
            </button>
          ))}
        </div>
        <button
          className="button button-primary start-round"
          disabled={
            unavailable ||
            waiting ||
            room.players.some((player) => !player?.online)
          }
          onClick={() => {
            void arcade.act({ action: "start" });
          }}
          aria-label="Start round"
        >
          {arcade.busyAction === "start" ? "Starting…" : "Start"}
          <Icon name="right" size={15} />
        </button>
      </div>
    </div>
  );
}
