"use client";

import { useEffect, useRef, useState } from "react";
import { formatCode } from "@/lib/types";
import { Icon } from "./icon";

export function RoomInvitation({
  code,
  waiting,
}: {
  code: string;
  waiting: boolean;
}) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [error, setError] = useState("");
  const timerReference = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timerReference.current) clearTimeout(timerReference.current);
    },
    [],
  );
  async function copy(kind: "code" | "link") {
    try {
      await navigator.clipboard.writeText(
        kind === "code"
          ? formatCode(code)
          : `${window.location.origin}/?room=${code}`,
      );
      setCopied(kind);
      setError("");
      if (timerReference.current) clearTimeout(timerReference.current);
      timerReference.current = setTimeout(() => setCopied(null), 2200);
    } catch {
      setError("Select and copy the room code to share it.");
    }
  }
  return (
    <section
      className={`room-invitation ${waiting ? "invitation-waiting" : ""}`}
      aria-label="Room invitation"
    >
      <div className="share-code">
        <label className="sr-only" htmlFor="share-code">
          Room code
        </label>
        <input
          id="share-code"
          readOnly
          value={formatCode(code)}
          onFocus={(event) => event.currentTarget.select()}
        />
        <button
          className="icon-button"
          aria-label="Copy room code"
          title={copied === "code" ? "Copied" : "Copy room code"}
          onClick={() => {
            void copy("code");
          }}
        >
          <Icon name={copied === "code" ? "check" : "copy"} />
        </button>
        <button
          className="button button-secondary invite-link"
          aria-label="Copy invite link"
          onClick={() => {
            void copy("link");
          }}
        >
          <Icon name={copied === "link" ? "check" : "link"} size={16} />
          {copied === "link" ? "Copied" : "Invite"}
        </button>
      </div>
      <span className="sr-only" role="status">
        {copied === "code"
          ? "Room code copied"
          : copied === "link"
            ? "Invite link copied"
            : ""}
      </span>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
