# TacTix

A two-player Tic-Tac-Toe app built with React 19, Next.js 16, and TypeScript. A mint lightning bolt and orange flame replace X and O. Create a public room or invite a friend to a private one, then play from separate browsers or devices.

Play online at [tactix-kappa.vercel.app](https://tactix-kappa.vercel.app). The production app runs on Vercel with a shared Turso database. Create a room and send its invitation link to the other player.

## Run locally

Requires Node.js 20.9 or newer.

```sh
npm install
npm run dev
```

Open [localhost:3000](http://localhost:3000). Create a room in one browser, then open its invitation in another browser or an incognito window. Normal tabs in the same browser share a player identity; use separate browser profiles to play against yourself.

No database account or environment file is needed locally. The server automatically creates a persistent SQLite database at `.data/arcade.db`. The game is shared through the server, not browser storage, and survives a server restart. The development server listens on all interfaces, so devices on the same network can use the host computer’s LAN address with port 3000. Open the app through that LAN address before copying an invitation for another device.

## What is included

- Public lobby discovery, creator names, occupancy, pagination, and full-room handling. The creator’s name stays attached to the room even if they leave; older records without that metadata display “Creator unavailable.”
- Unlisted private rooms with copyable invitation links and 16-character random codes.
- Server-validated moves, alternating turns, all eight winning lines, draws, and protected finished rounds.
- Character-specific placement: a quick snap and mint sparks for Bolt, a rising flicker and embers for Flame. Only newly accepted moves animate; restoring a board does not replay old placements. Reduced motion removes particles and expressive movement.
- Locally synthesized electric and warm percussive move sounds, a starter cue, and win/loss/draw sounds. Sound unlocks on user interaction, can be muted, and remembers the preference. Polling, refreshes, and unmuting do not replay past moves. Voices have short envelopes, bounded gain, and cleanup after completion.
- Shared first-player controls before each round: Bolt, Flame, or Random. Either player may choose and start once both players are connected. The server resolves Random once and locks the starter for the round.
- Personal win, loss, and draw dialogs with Play again and Leave room actions. Result dialogs stay dismissed through live updates and close for both players when a rematch starts.
- Reset Game during play and Play again after a result both clear the shared board while preserving scores. Simultaneous rematch requests start a single new round.
- Per-browser guest identities, reconnecting players, connection feedback, and reserved seats after refresh.
- Viewport-fitted desktop, mobile and landscape layouts, keyboard controls, native modal focus management, and announced game status.
- The supplied TacTix artwork as the site logo, multi-size favicon, browser icon, and home-screen icons.

Either seated player can reset during play. Each fresh round returns to the starter controls; the previous choice is retained, while Random is drawn again only when the next round starts. Leaving releases only that player’s seat, clears both scores and draws, and resets the board to round one with Random preselected. The remaining player stays in the same room and can invite a replacement through the existing link or code. This also works when the original creator leaves. Public rooms become joinable again; private rooms remain unlisted. An empty room closes. Rooms expire six hours after creation.

A refresh or temporary disconnect does not count as leaving. The player keeps their seat, with an offline status after 15 seconds. Play pauses until both players are connected. Empty and connection states use real data; the lobby’s illustrated board is a preview of the pieces. Long room lists are paginated, and the main screens fit a normal viewport without page scrolling. Enlarged-text/very short viewport fallbacks preserve access rather than clipping controls.

## Shared state and synchronization

Next.js Route Handlers are authoritative. Player tokens are random, HttpOnly, SameSite cookies; only their SHA-256 hashes are stored in game records, and hashes are excluded from responses. Private rooms are excluded from the public directory, and only seated players can read their game state or perform actions.

Moves, starter choices, starts, resets, seat reservations, and departures use database compare-and-swap updates against a monotonically increasing revision. Random uses a server-side cryptographic draw; concurrent starts commit one result, and reads never reroll it. Moves are rejected before start, out of turn, and after completion. Reset and departure create new round identifiers. Competing joins cannot claim the same seat, duplicate actions cannot score twice, and an in-flight move from a previous match cannot change a reset board. Departed players lose access until they join again. A departure can retry around simultaneous moves without closing an occupied room.

Game state, presence, and public rooms refresh on a 1,000 ms start cadence, with no browser-page reload. A slow request finishes before another starts, and tab focus, visibility changes, and network reconnection trigger a prompt refresh. Requests are cancelled when leaving a view. Offline browsers wait for connectivity; browsers may throttle background timers. Input, focus, and result-dialog state stay intact during updates.

This is near-real-time HTTP synchronization, not a WebSocket connection. Each browser reads the same durable database; no process-local room state or filesystem persistence is used on Vercel. A larger deployment should budget the database requests generated by one-second polling and consider managed push updates.

Existing browser identities and saved rooms migrate from the original name to TacTix without changing player authorization or discarding active rooms.

Expired room and presence records, and rate-limit records older than a day, are cleaned up when a room is created. Public listings hide rooms without recent player presence. Browser storage only remembers a display name and the most recent room; it never authorizes a player.

## Deploy on Vercel

The current production deployment was uploaded directly from the committed source. The GitHub repository is not yet connected to Vercel for automatic deployments. Production database credentials are managed by the Turso integration and are scoped to Production; local development continues to use its own SQLite file.

1. Create a persistent database in [Turso](https://turso.tech/) and obtain its `libsql://` database URL and an authentication token.
2. Add this project to a Git repository and import it into [Vercel](https://vercel.com/new), selecting the Next.js preset. Alternatively, use Vercel’s CLI from this directory.
3. In the Vercel project’s environment settings, set:

   ```text
   TURSO_DATABASE_URL=libsql://your-database.turso.io
   TURSO_AUTH_TOKEN=your-server-only-token
   ```

4. Set the values for each deployment environment that should support multiplayer. Deploy with `npm run build`; the framework’s normal output settings are sufficient. The schema is initialized automatically on the first database request.
5. Open the deployed URL in two separate browsers, create a room, share its link, and verify one complete round and a reset.

Never prefix database credentials with `NEXT_PUBLIC_` or commit them. `.env.example` documents the variables; local environment files and runtime data are ignored. Vercel deployments fail clearly with a configuration message if a remote database is missing rather than falling back to an ephemeral local file. Remote hosting and Turso connectivity must be verified against the actual configured deployment; local checks do not establish them.

## Checks

```sh
npm test             # game rules, privacy, atomic joins/moves, reconnects, stale resets
npm run lint
npm run typecheck
npm run build
npm run test:e2e     # real browser sessions, responsive layouts, keyboard dialogs
```

The browser tests use installed Google Chrome on macOS when available. On another system, run `npx playwright install chromium`, or set `CHROME_PATH` to a compatible Chrome executable. Tests start the development server if one is not already running. Set `PLAYWRIGHT_BASE_URL` to exercise another running instance.

Browser tests create isolated player sessions and cover private invitations, public creator names, capacity, synchronized starter selection, wins and draws, rematches, refresh recovery, replacement opponents, one-second polling, branding assets, and viewport fit from 320×568 to 1440×900 including phone landscape. Large-screen preview alignment is checked up to 2560px wide. Audio checks observe scheduled Web Audio voices and signal levels, distinguish the move sounds, and verify mute persistence and no polling/restore replay. Service tests use a disposable SQLite database and include competing joins/moves/starts/departures, score resets, and old-request rejection. Generated screenshots and traces are ignored under `artifacts/` and `test-results/`.

## Project layout

```text
src/app/           Page, layout, styles, and API endpoints
src/components/    Lobby, match, character art, and accessible dialogs
src/hooks/         Browser session, synchronization, and action coordination
src/lib/           Game rules, database access, room operations, and API boundary
tests/             Unit, database integration, and browser tests
```

Design and responsive/accessibility checks use AestheticForge MCP. REA MCP inspected the original assignment and exercised two isolated player sessions. The interface uses a locally hosted Outfit variable font, short labels, and functional SVG icons. Bolt, Flame, sparks, and embers are authored SVG components. The original supplied logo is preserved at `public/brand/tactix-original.png`; size variants are in the same directory, and Next.js serves the favicon, app icon, and Apple icon from `src/app/`.

Original brief: [Test 1: Tic-Tac-Toe React App](https://tremendous-tiger-a4a.notion.site/Test-1-Tic-Tac-Toe-React-App-22200bbdfc3b80d089deee909ae597e4).
