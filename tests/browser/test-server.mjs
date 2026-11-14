import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Browser tests must never reuse the developer's server or shared database.
const directory = await mkdtemp(path.join(tmpdir(), "tactix-browser-"));
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3101",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      VERCEL: "",
      TURSO_DATABASE_URL: `file:${path.join(directory, "game.db")}`,
      TURSO_AUTH_TOKEN: "",
    },
  },
);

for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.kill(signal));
server.on("error", (failure) => {
  console.error(failure);
  process.exitCode = 1;
});
server.on("close", async (code) => {
  await rm(directory, { recursive: true, force: true });
  process.exitCode = code ?? 0;
});
