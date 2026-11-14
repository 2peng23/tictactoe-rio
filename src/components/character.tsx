import type { Seat } from "@/lib/types";

export function Character({
  seat,
  className = "",
}: {
  seat: Seat;
  className?: string;
}) {
  if (seat === 0)
    return (
      <svg
        className={`character bolt ${className}`}
        viewBox="0 0 100 100"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <path
          className="bolt-core"
          d="M58 7 19 55h25l-9 38 47-55H57L70 7H58Z"
          fill="#20E6AF"
          stroke="#154D43"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <path d="m58 15-28 33h24l-9 27 26-30H47l13-30h-2Z" fill="#83FFDA" />
        <path d="m58 15-28 33h12l18-33h-2Z" fill="#C7FFED" />
      </svg>
    );
  return (
    <svg
      className={`character flame ${className}`}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        className="flame-outer"
        d="M52 6c4 20-4 23-1 36 6-4 10-12 10-19 9 12 23 23 23 40 0 19-15 31-34 31S16 81 16 63c0-16 11-26 17-40 0 12 5 15 8 19C46 28 55 24 52 6Z"
        fill="#FF8B3D"
        stroke="#71391F"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <path
        className="flame-inner"
        d="M51 47c3 13 15 17 15 29 0 10-7 17-16 17s-17-7-17-17c0-9 8-16 10-23 0 7 3 9 4 10 2-6 6-10 4-16Z"
        fill="#FFDB88"
      />
      <path
        d="M49 69c0 8 7 10 7 16 0 4-3 8-7 8s-7-4-7-8c0-6 6-10 7-16Z"
        fill="#FFF2CE"
      />
    </svg>
  );
}
