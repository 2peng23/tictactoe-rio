import type { Metadata, Viewport } from "next";
import "@fontsource-variable/outfit";
import "./globals.css";

export const metadata: Metadata = {
  title: "TacTix — Tic-Tac-Toe for two",
  description: "Play Tic-Tac-Toe together. Create a public or private room, invite a friend, and play from separate browsers.",
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#6a28d9" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
