"use client";

import { useState } from "react";
import { useGameAudio } from "@/hooks/use-game-audio";
import Image from "next/image";
import { useArcade } from "@/hooks/use-arcade";
import { Character } from "./character";
import { Dialog } from "./dialog";
import { Lobby } from "./lobby";
import { Match } from "./match";
import { Icon } from "./icon";

export function Arcade() {
  const arcade = useArcade();
  const [rulesOpen, setRulesOpen] = useState(false);
  const { soundEnabled, toggleSound, audioSupported } = useGameAudio(
    arcade.room,
  );

  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="site-header">
        <div className="header-inner">
          <a
            className="brand"
            href={arcade.room ? "#match-title" : "#lobby"}
            aria-label="TacTix home"
          >
            <Image
              src="/brand/tactix-logo.png"
              alt=""
              width={50}
              height={50}
              priority
            />
            <span>
              Tac<span className="brand-accent">Tix</span>
            </span>
          </a>
          <nav aria-label="Main navigation">
            <button
              className="text-button nav-rules"
              onClick={() => setRulesOpen(true)}
              aria-label="How to play"
            >
              <Icon name="book" />
              <span>How to play</span>
            </button>
            <button
              className="sound-toggle"
              disabled={!audioSupported}
              onClick={toggleSound}
              aria-pressed={soundEnabled}
              aria-label={soundEnabled ? "Turn sound off" : "Turn sound on"}
              title={soundEnabled ? "Turn sound off" : "Turn sound on"}
            >
              <Icon name={soundEnabled ? "sound" : "muted"} />
              <span>Sound {soundEnabled ? "on" : "off"}</span>
            </button>
          </nav>
        </div>
      </header>
      <main
        id="main"
        className="page-container"
        tabIndex={-1}
        aria-busy={!arcade.ready}
      >
        {arcade.room ? (
          <Match arcade={arcade} room={arcade.room} />
        ) : (
          <Lobby arcade={arcade} />
        )}
      </main>
      {rulesOpen && (
        <Dialog title="How to play" onClose={() => setRulesOpen(false)}>
          <div className="rules-characters" aria-hidden="true">
            <Character seat={0} />
            <Character seat={1} />
          </div>
          <ol className="rules-list">
            <li>
              Create a room or join with a code. Use separate browsers or
              devices for each player.
            </li>
            <li>
              Choose Bolt, Flame, or Random to go first, then start the round.
              Take turns placing a piece in an empty square.
            </li>
            <li>
              Get three in a row, column, or diagonal to win. A full board
              without a winner is a draw.
            </li>
            <li>
              Play again keeps your scores. Leaving resets the match and opens
              your seat for someone new.
            </li>
          </ol>
          <button
            className="button button-primary"
            onClick={() => setRulesOpen(false)}
          >
            Got it
          </button>
        </Dialog>
      )}
    </div>
  );
}
