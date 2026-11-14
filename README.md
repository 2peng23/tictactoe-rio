# TacTix

Two-player Tic-Tac-Toe built with React 19, Next.js 16, and TypeScript. Mint Bolt and orange Flame pieces, public/private rooms, shared starter selection, rematches, animation, and optional sound.

[Play TacTix](https://tactix-kappa.vercel.app)

## Run locally

Requires Node.js 20.9 or newer.

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). Use separate browsers, browser profiles, or devices for the two players. Regular tabs in one browser share a player identity.

Local development needs no database account or environment file. SQLite is created at `.data/arcade.db`; games survive server restarts. To play across devices on the same network, open the host computer’s LAN address on port 3000 before copying the invite link.

## Architecture

| Area                            | Responsibility                                                        |
| ------------------------------- | --------------------------------------------------------------------- |
| `src/app/`                      | Page, layout, styles, metadata, and thin HTTP route handlers          |
| `src/components/`               | Lobby, match, starter controls, game pieces, and accessible dialogs   |
| `src/hooks/use-arcade.ts`       | Session restoration, active match synchronization, and player actions |
| `src/hooks/use-public-rooms.ts` | Public directory requests, loading/error state, and cancellation      |
| `src/hooks/use-game-audio.ts`   | Sound preference and cues for newly accepted events                   |
| `src/lib/game.ts`               | Pure game rules and round transitions                                 |
| `src/lib/rooms.ts`              | Authorized room operations, presence checks, and revision conflicts   |
| `src/lib/database.ts`           | Database initialization, persistence, presence, and rate limits       |
| `src/lib/api.ts`                | HTTP identity, origin checks, bounded JSON bodies, and safe errors    |
| `src/lib/client-api.ts`         | Browser requests, timeouts, cancellation, and response errors         |
| `src/lib/player-preferences.ts` | Optional name/room storage and migration from older browser keys      |
| `src/lib/polling.ts`            | One-second request cadence and reconnect/focus refresh                |
| `src/lib/types.ts`              | Shared room views and typed player actions                            |
| `tests/`                        | Game, database, HTTP, client transport, and browser regression tests  |

The server owns identity, seats, turns, scores, and starting-player decisions. The browser renders accepted state; browser storage remembers only the display name and last room. Session tokens use HttpOnly, SameSite cookies. Only token hashes are persisted, and those hashes are excluded from responses.

Room changes use compare-and-swap writes against an increasing revision. Round identifiers reject requests from an earlier round. These boundaries protect competing joins, moves, starts, resets, and departures without process-local game state. The game functions remain independent of HTTP and database clients. Existing stored rooms and browser identities retain their compatibility handling.

The controller accepts a discriminated action type: moves require a position, starter choices require a choice, and reset/start/leave carry no unrelated fields. API handlers still validate untrusted input at runtime. Temporary startup or restore failures retry without discarding an invitation or remembered seat. Requests owned by a screen are cancelled when it closes.

## Multiplayer behavior

- Create a public room or share a private invite/code. Public listings include the original creator’s name. The directory returns the latest 18 recently active rooms, displayed two per page.
- Either player can choose Bolt, Flame, or Random before starting. The server resolves Random once per round.
- Win/loss/draw dialogs offer Play again and Leave room. Rematches and in-game resets preserve scores.
- Leaving releases the seat, clears both scores and draws, and returns the remaining player to a waiting room with the same invitation. An empty room closes.
- Refreshing preserves the seat. Presence becomes offline after 15 seconds; play waits for the opponent to reconnect. Rooms expire six hours after creation.
- Both browsers poll on a one-second start cadence without page reloads. Slow requests finish before the next starts. Focus, visibility, and network recovery trigger a prompt refresh; browsers may throttle background tabs.
- Sound and placement effects respond to accepted events. Restoring an existing board does not replay old moves. Muting persists, and reduced motion removes particles and expressive movement.

This is near-real-time HTTP synchronization. One-second polling is appropriate for this project; a larger deployment should account for database request volume and consider managed push updates.

## Verify changes

```sh
npm run check        # formatting, lint, generated route types, TypeScript, unit/integration tests
npm run build        # production build
npm run test:e2e     # full multiplayer and responsive browser flows
npm run format       # apply the repository’s formatting
```

The default browser suite starts its own server at `127.0.0.1:3101` with a disposable SQLite database. It does not reuse your development server or local games. The database is removed when the test server exits. Tests cover separate player sessions, starter choices, results, simultaneous rematches, replacement players, restore/startup outages, sound, keyboard dialogs, branding, and desktop/mobile/landscape layouts.

On macOS the tests use installed Google Chrome when available. Otherwise run `npx playwright install chromium`, or set `CHROME_PATH` to a compatible executable. `PLAYWRIGHT_BASE_URL` explicitly targets an existing server and bypasses the disposable server; use it only with a test environment.

The targeted `minimatch` override pins the ESLint TypeScript dependency to 11.0.1 for [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249). Remove the override when the upstream TypeScript ESLint dependency includes the fix. It does not change the application framework or runtime dependencies.

Next.js generates `next-env.d.ts` and route types during `dev`, `build`, or `typecheck`. Generated type files, screenshots, traces, local databases, and environment files are ignored by Git.

## Deployment

The Vercel project `tactix` is connected to `2peng23/tictactoe-rio`; pushes to `main` trigger production deployments. Vercel uses a shared Turso database. Configure these server-only variables for any deployment environment that needs multiplayer:

```text
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-server-only-token
```

The schema initializes automatically. Vercel rejects missing remote database configuration instead of falling back to a temporary local file. See `.env.example`; keep credentials out of Git and never prefix them with `NEXT_PUBLIC_`.

## Brand and video files

The supplied master artwork is preserved at `public/brand/tactix-original.png`. The remaining brand sizes, web manifest, and Next.js icon files serve distinct browser/header/home-screen uses. Outfit is hosted locally through the font package.

The generated reel, editable project archive, poster, captions, and verification record live in **`TacTix Video/`**. That folder is ignored by Git and is outside the app’s source/type-check scope.

[Original assignment](https://tremendous-tiger-a4a.notion.site/Test-1-Tic-Tac-Toe-React-App-22200bbdfc3b80d089deee909ae597e4)
