import type { CSSProperties } from "react";

const paths = {
  dice: ["M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z", "M8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01"],
  sound: ["M11 5 6 9H3v6h3l5 4V5Z", "M15 8a6 6 0 0 1 0 8", "M18 5a10 10 0 0 1 0 14"],
  muted: ["M11 5 6 9H3v6h3l5 4V5Z", "m16 9 5 6", "m21 9-5 6"],
  book: ["M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Z", "M12 6v14"],
  globe: ["M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z", "M3 12h18", "M12 3c-5 5-5 13 0 18 5-5 5-13 0-18Z"],
  lock: ["M7 10V7a5 5 0 0 1 10 0v3", "M5 10h14v11H5V10Z", "M12 14v3"],
  copy: ["M8 8h13v13H8V8Z", "M16 4V2H2v14h2"],
  check: ["m5 12 4 4L19 6"],
  link: ["m10 13 4-4", "m8 16-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0", "m16 8 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"],
  reset: ["M3 10a9 9 0 1 1 2 9", "M3 3v7h7"],
  leave: ["M9 3H3v18h6", "M9 12h13", "m17 7 5 5-5 5"],
  refresh: ["M20 8a8 8 0 0 0-14-3L3 8", "M3 2v6h6", "M4 16a8 8 0 0 0 14 3l3-3", "M21 22v-6h-6"],
  right: ["M4 12h16", "m14 6 6 6-6 6"],
  previous: ["m15 6-6 6 6 6"],
  next: ["m9 6 6 6-6 6"],
  plus: ["M12 5v14", "M5 12h14"],
} as const;

export function Icon({ name, size = 18, className = "", style }: { name: keyof typeof paths; size?: number; className?: string; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden="true" focusable="false">{paths[name].map((path, index) => <path d={path} key={index}/>)}</svg>;
}
