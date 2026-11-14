import type { Seat } from "@/lib/types";
import { Character } from "./character";

export function MovePiece({ seat, animate }: { seat: Seat; animate: boolean }) {
  return (
    <span
      className={`move-pop ${animate ? `move-${seat === 0 ? "bolt" : "flame"}` : "move-static"}`}
    >
      <Character seat={seat} />
      {animate && (
        <svg
          className="placement-effects"
          viewBox="0 0 100 100"
          fill="none"
          aria-hidden="true"
          focusable="false"
        >
          {seat === 0 ? (
            <g
              className="spark-rays"
              stroke="#9CFFE0"
              strokeWidth="3"
              strokeLinecap="round"
            >
              <path d="m18 18-6-6m66 66 7 7M81 20l7-7M20 80l-7 7M8 48h9M83 52h9" />
            </g>
          ) : (
            <g fill="#FFBD62">
              <circle className="ember ember-one" cx="24" cy="42" r="3" />
              <circle className="ember ember-two" cx="74" cy="38" r="2.5" />
              <circle className="ember ember-three" cx="58" cy="20" r="2" />
            </g>
          )}
        </svg>
      )}
    </span>
  );
}
