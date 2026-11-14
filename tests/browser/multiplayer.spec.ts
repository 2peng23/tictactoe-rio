import { expect, test, type Page, type Route } from "@playwright/test";

async function makeRoom(
  page: Page,
  visibility: "public" | "private",
  name: string,
) {
  await page.goto("/");
  await page.locator("#player-name").fill("Alex");
  await page.locator("#room-name").fill(name);
  await page
    .getByRole("radio", {
      name: visibility === "public" ? /Public room/ : /Private room/,
    })
    .check();
  await page.getByRole("button", { name: "Create room", exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  return new URL(page.url()).searchParams.get("room")!;
}

async function move(
  active: Page,
  other: Page,
  position: number,
  character: string,
) {
  const cell = active.locator(`[data-cell="${position}"]`);
  await expect(cell).toBeEnabled();
  await cell.click();
  await expect(other.locator(`[data-cell="${position}"]`)).toHaveAttribute(
    "aria-label",
    new RegExp(character),
  );
}

async function playRound(host: Page, rival: Page, positions: number[]) {
  await beginRound(host, rival);
  for (const [index, position] of positions.entries()) {
    await move(
      index % 2 === 0 ? host : rival,
      index % 2 === 0 ? rival : host,
      position,
      index % 2 === 0 ? "Bolt" : "Flame",
    );
  }
}

async function beginRound(
  player: Page,
  other: Page,
  choice: "Bolt" | "Flame" | "Random" = "Bolt",
) {
  await player
    .getByRole("button", { name: `${choice} plays first`, exact: true })
    .click();
  await expect(
    player.getByRole("button", { name: "Start round", exact: true }),
  ).toBeEnabled();
  await player
    .getByRole("button", { name: "Start round", exact: true })
    .click();
  await expect(player.locator(".starter-picker")).toHaveCount(0);
  await expect(other.locator(".starter-picker")).toHaveCount(0);
}

test("personal result dialogs, simultaneous rematches, draws, refresh and leaving stay synchronized", async ({
  browser,
  page,
}) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const code = await makeRoom(page, "private", "Browser rivalry");
  const rivalContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const rival = await rivalContext.newPage();
  rival.on("pageerror", (error) => errors.push(error.message));
  await rival.goto(`/?room=${code}`);
  await rival.locator("#player-name").fill("Sam");
  await expect(rival.locator("#join-code")).toHaveValue(code);
  await rival.getByRole("button", { name: "Join room", exact: true }).click();
  await expect(page.getByText("Sam", { exact: true })).toBeVisible();
  await playRound(page, rival, [0, 3, 1, 4, 2]);
  const victory = page.getByRole("dialog", { name: "You won.", exact: true });
  const loss = rival.getByRole("dialog", { name: "You lost.", exact: true });
  await expect(victory).toBeVisible();
  await expect(loss).toBeVisible();
  await expect(
    victory.getByRole("button", { name: "Play again" }),
  ).toBeFocused();
  await expect(page.locator(".winning-cell")).toHaveCount(3);
  await expect(page.locator(".board-cell:not(:disabled)")).toHaveCount(0);
  await expect(page.locator(".player-score").first()).toHaveText("1");
  await page.screenshot({
    path: "artifacts/result-win-desktop.png",
    fullPage: true,
  });
  await rival.screenshot({
    path: "artifacts/result-loss-mobile.png",
    fullPage: true,
  });

  const pendingResets: Route[] = [];
  const synchronizeResets = async (route: Route) => {
    if (
      route.request().method() === "PATCH" &&
      route.request().postDataJSON().action === "reset"
    ) {
      pendingResets.push(route);
      if (pendingResets.length === 2)
        await Promise.all(pendingResets.map((pending) => pending.continue()));
    } else await route.continue();
  };
  await Promise.all([
    page.route("**/api/rooms/*", synchronizeResets),
    rival.route("**/api/rooms/*", synchronizeResets),
  ]);
  await Promise.all([
    victory.getByRole("button", { name: "Play again" }).click(),
    loss.getByRole("button", { name: "Play again" }).click(),
  ]);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(rival.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".match-board")).toHaveAttribute("data-round", "2");
  await expect(rival.locator(".match-board")).toHaveAttribute(
    "data-round",
    "2",
  );
  await expect(page.locator(".board-cell.occupied")).toHaveCount(0);
  await expect(page.locator(".player-score").first()).toHaveText("1");
  await expect(page.locator(".form-error")).toHaveCount(0);
  await expect(rival.locator(".form-error")).toHaveCount(0);
  await Promise.all([
    page.unroute("**/api/rooms/*", synchronizeResets),
    rival.unroute("**/api/rooms/*", synchronizeResets),
  ]);

  await playRound(page, rival, [0, 1, 2, 4, 3, 5, 7, 6, 8]);
  await expect(
    page.getByRole("dialog", { name: "It’s a draw." }),
  ).toBeVisible();
  await expect(
    rival.getByRole("dialog", { name: "It’s a draw." }),
  ).toBeVisible();
  await rival.getByRole("button", { name: "Close dialog" }).click();
  await expect(rival.getByRole("dialog")).toHaveCount(0);
  await rival.waitForTimeout(1900);
  await expect(rival.getByRole("dialog")).toHaveCount(0);
  await rival.getByRole("button", { name: "View result" }).click();
  await expect(
    rival.getByRole("dialog", { name: "It’s a draw." }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Play again" })
    .click();
  await expect(rival.getByRole("dialog")).toHaveCount(0);
  await expect(rival.locator(".match-board")).toHaveAttribute(
    "data-round",
    "3",
  );
  await expect(rival.locator(".draw-count")).toHaveText("1 draw");
  await beginRound(page, rival);
  await move(page, rival, 4, "Bolt");
  await rival.reload();
  await expect(
    rival.getByRole("heading", { name: "Browser rivalry", exact: true }),
  ).toBeVisible();
  await expect(rival.locator('[data-cell="4"]')).toHaveAttribute(
    "aria-label",
    /Bolt/,
  );
  await expect(rival.locator(".player-identity").last()).toContainText("You");
  await rival.getByRole("button", { name: "Reset Game" }).click();
  await expect(page.locator(".board-cell.occupied")).toHaveCount(0);
  await expect(page.locator(".match-board")).toHaveAttribute("data-round", "4");
  expect(
    await rival.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/clean-match-desktop.png",
    fullPage: true,
  });
  await rival.screenshot({
    path: "artifacts/clean-match-mobile.png",
    fullPage: true,
  });
  await playRound(page, rival, [0, 3, 1, 4, 2]);
  await expect(rival.getByRole("dialog", { name: "You lost." })).toBeVisible();
  await rival
    .getByRole("dialog")
    .getByRole("button", { name: "Leave room", exact: true })
    .click();
  await expect(
    page.getByText("Waiting for another player", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".player-score").first()).toHaveText("0");
  await expect(page.locator(".player-score").last()).toHaveText("0");
  await expect(page.locator(".draw-count")).toHaveText("0 draws");
  await expect(page.locator(".board-cell.occupied")).toHaveCount(0);
  await expect(page.locator(".match-board")).toHaveAttribute("data-round", "1");
  expect(new URL(page.url()).searchParams.get("room")).toBe(code);
  await expect(
    rival.getByRole("heading", { name: "Tic-tac-toe", exact: true }),
  ).toBeVisible();
  const replacementContext = await browser.newContext();
  const replacement = await replacementContext.newPage();
  await replacement.goto(`/?room=${code}`);
  await replacement.locator("#player-name").fill("Jo");
  await replacement
    .getByRole("button", { name: "Join room", exact: true })
    .click();
  await expect(page.getByText("Jo", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Leave room", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Leave room", exact: true })
    .click();
  await expect(
    replacement.getByText("Waiting for another player", { exact: true }),
  ).toBeVisible();
  await rival.goto(`/?room=${code}`);
  await rival.locator("#player-name").fill("Kim");
  await rival.getByRole("button", { name: "Join room", exact: true }).click();
  await expect(rival.locator(".player-identity").first()).toContainText("You");
  await beginRound(rival, replacement);
  await move(rival, replacement, 0, "Bolt");
  expect(errors).toEqual([]);
  await Promise.all([
    rivalContext.request.patch(`/api/rooms/${code}`, {
      data: { action: "leave" },
    }),
    replacementContext.request.patch(`/api/rooms/${code}`, {
      data: { action: "leave" },
    }),
  ]);
  await replacementContext.close();
  await rivalContext.close();
});

test("public rooms are discoverable, full rooms reject a third player, private rooms remain hidden", async ({
  browser,
  page,
}) => {
  const publicName = `Open arcade ${Date.now().toString(36)}`;
  const code = await makeRoom(page, "public", publicName);
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto("/");
  await guest.locator("#player-name").fill("Taylor");
  await guest.getByRole("button", { name: /Public rooms/ }).click();
  const roomRow = guest.locator(".public-room").filter({ hasText: publicName });
  await expect(roomRow).toBeVisible();
  await expect(
    roomRow.getByText("Created by Alex", { exact: true }),
  ).toBeVisible();
  await roomRow.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page.getByText("Taylor", { exact: true })).toBeVisible();
  const thirdContext = await browser.newContext();
  const third = await thirdContext.newPage();
  await third.goto(`/?room=${code}`);
  await third.locator("#player-name").fill("Third player");
  await third.getByRole("button", { name: "Join room", exact: true }).click();
  await expect(third.locator(".form-error[role=alert]")).toContainText(
    "room is full",
  );
  await third.getByRole("button", { name: /Public rooms/ }).click();
  const listed = third.locator(".public-room").filter({ hasText: publicName });
  await expect(listed.getByRole("button", { name: "Full" })).toBeDisabled();
  const privateContext = await browser.newContext();
  const privatePage = await privateContext.newPage();
  const privateCode = await makeRoom(
    privatePage,
    "private",
    "Invisible clubhouse",
  );
  const response = await thirdContext.request.get("/api/rooms");
  expect(JSON.stringify(await response.json())).not.toContain(privateCode);
  const crossOrigin = await thirdContext.request.post("/api/rooms", {
    headers: { origin: "https://another-site.example" },
    data: {
      playerName: "Outsider",
      name: "Blocked room",
      visibility: "public",
    },
  });
  expect(crossOrigin.status()).toBe(403);
  for (const activePage of [page, privatePage]) {
    await activePage
      .getByRole("button", { name: "Leave room", exact: true })
      .click();
    await activePage
      .getByRole("dialog")
      .getByRole("button", { name: "Leave room", exact: true })
      .click();
    await expect(
      activePage.getByRole("heading", { name: "Tic-tac-toe", exact: true }),
    ).toBeVisible();
  }
  await guestContext.request.patch(`/api/rooms/${code}`, {
    data: { action: "leave" },
  });
  await Promise.all([
    guestContext.close(),
    thirdContext.close(),
    privateContext.close(),
  ]);
});

test("lobby fits desktop, mobile and landscape; rules support keyboard focus and Escape", async ({
  page,
}) => {
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [568, 320],
    [844, 390],
    [768, 600],
    [1024, 768],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(page.locator("#player-name")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      `overflow at ${width}px`,
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= window.innerHeight,
      ),
      `vertical overflow at ${width}×${height}`,
    ).toBe(true);
    const submit = await page.locator(".create-button").boundingBox();
    expect(submit!.y + submit!.height).toBeLessThanOrEqual(height);
  }
  for (const width of [1440, 1920, 2560]) {
    await page.setViewportSize({ width, height: 1100 });
    const title = await page.locator(".lobby-heading").boundingBox();
    const preview = await page.locator(".preview-board").boundingBox();
    expect(
      Math.abs(title!.x - preview!.x),
      `preview alignment at ${width}px`,
    ).toBeLessThan(25);
  }
  await page.getByRole("button", { name: "How to play", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.activeElement?.closest("dialog") !== null,
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "How to play", exact: true }),
  ).toBeFocused();
});

test("starter choices sync, random stays fixed, and sounds and effects reflect new accepted moves", async ({
  page,
  browser,
}) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    const recording = {
      voices: [] as { frequency: number; type: string }[],
      peak: 0,
      contexts: [] as AudioContext[],
    };
    Object.assign(window, { __tactixAudio: recording });
    window.AudioContext = new Proxy(window.AudioContext, {
      construct(Target, argumentsList) {
        const context = Reflect.construct(
          Target,
          argumentsList,
        ) as AudioContext;
        recording.contexts.push(context);
        const makeOscillator = context.createOscillator.bind(context);
        context.createOscillator = () => {
          const oscillator = makeOscillator();
          let initialFrequency = 0;
          const setFrequency = oscillator.frequency.setValueAtTime.bind(
            oscillator.frequency,
          );
          oscillator.frequency.setValueAtTime = (value, time) => {
            initialFrequency = value;
            return setFrequency(value, time);
          };
          const start = oscillator.start.bind(oscillator);
          oscillator.start = (time = 0) => {
            recording.voices.push({
              frequency: initialFrequency,
              type: oscillator.type,
            });
            start(time);
          };
          return oscillator;
        };
        const makeCompressor = context.createDynamicsCompressor.bind(context);
        context.createDynamicsCompressor = () => {
          const compressor = makeCompressor();
          const analyser = context.createAnalyser();
          analyser.fftSize = 256;
          compressor.connect(analyser);
          const samples = new Float32Array(analyser.fftSize);
          const sample = () => {
            if (context.state === "closed") return;
            analyser.getFloatTimeDomainData(samples);
            for (const amplitude of samples)
              recording.peak = Math.max(recording.peak, Math.abs(amplitude));
            requestAnimationFrame(sample);
          };
          requestAnimationFrame(sample);
          return compressor;
        };
        return context;
      },
    });
  });
  const readSound = () =>
    page.evaluate(
      () =>
        (
          window as unknown as {
            __tactixAudio: {
              voices: { frequency: number; type: string }[];
              peak: number;
            };
          }
        ).__tactixAudio,
    );
  const code = await makeRoom(page, "private", "Sound and starters");
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await other.goto(`/?room=${code}`);
  await other.locator("#player-name").fill("Sam");
  await other.getByRole("button", { name: "Join room", exact: true }).click();
  await other
    .getByRole("button", { name: "Flame plays first", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Flame plays first", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Start round" }).click();
  await expect(other.locator('[data-cell="4"]')).toBeEnabled();
  await expect(page.locator('[data-cell="4"]')).toBeDisabled();
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    (
      window as unknown as {
        __tactixAudio: { voices: unknown[]; peak: number };
      }
    ).__tactixAudio.voices = [];
  });
  await move(other, page, 4, "Flame");
  await expect
    .poll(async () =>
      (await readSound()).voices.some(
        (voice) => voice.frequency === 200 && voice.type === "triangle",
      ),
    )
    .toBe(true);
  await move(page, other, 0, "Bolt");
  await expect
    .poll(async () =>
      (await readSound()).voices.some((voice) => voice.frequency === 1150),
    )
    .toBe(true);
  await expect
    .poll(async () => (await readSound()).peak)
    .toBeGreaterThan(0.001);
  expect((await readSound()).peak).toBeLessThan(0.95);
  const voices = (await readSound()).voices.length;
  await page.waitForTimeout(2100);
  expect((await readSound()).voices.length).toBe(voices);
  const boltDuration = await page
    .locator('[data-cell="0"] .move-pop')
    .evaluate((element) => getComputedStyle(element).animationDuration);
  expect(parseFloat(boltDuration)).toBeGreaterThan(0.1);
  await page
    .getByRole("button", { name: "Turn sound off", exact: true })
    .click();
  await move(other, page, 1, "Flame");
  await move(page, other, 2, "Bolt");
  expect((await readSound()).voices.length).toBe(voices);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Turn sound on", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".board-cell .move-static")).toHaveCount(4);
  await expect(page.locator(".placement-effects")).toHaveCount(0);
  expect((await readSound()).voices.length).toBe(0);
  await page
    .getByRole("button", { name: "Turn sound on", exact: true })
    .click();
  await page.waitForTimeout(300);
  const enabledVoices = (await readSound()).voices.length;
  await page.waitForTimeout(1200);
  expect((await readSound()).voices.length).toBe(enabledVoices);
  await other.emulateMedia({ reducedMotion: "reduce" });
  await move(other, page, 3, "Flame");
  const reducedDuration = await other
    .locator('[data-cell="3"] .move-pop')
    .evaluate((element) => getComputedStyle(element).animationDuration);
  expect(parseFloat(reducedDuration)).toBeLessThan(0.001);
  await expect(other.locator('[data-cell="3"] .placement-effects')).toHaveCSS(
    "display",
    "none",
  );
  await page.getByRole("button", { name: "Reset Game" }).click();
  await beginRound(other, page, "Random");
  const firstState = (
    await (await page.request.get(`/api/rooms/${code}`)).json()
  ).room;
  expect([0, 1]).toContain(firstState.startingSeat);
  await page.waitForTimeout(1700);
  const otherState = (
    await (await otherContext.request.get(`/api/rooms/${code}`)).json()
  ).room;
  expect(otherState.startingSeat).toBe(firstState.startingSeat);
  expect(await page.locator('[data-cell="0"]').isEnabled()).toBe(
    firstState.startingSeat === 0,
  );
  expect(await other.locator('[data-cell="0"]').isEnabled()).toBe(
    firstState.startingSeat === 1,
  );
  await Promise.all([
    page.request.patch(`/api/rooms/${code}`, { data: { action: "leave" } }),
    otherContext.request.patch(`/api/rooms/${code}`, {
      data: { action: "leave" },
    }),
  ]);
  await otherContext.close();
});

test("the game board fits the viewport and both polling streams refresh every second", async ({
  browser,
  page,
}) => {
  const code = await makeRoom(page, "private", "Viewport test");
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await other.goto(`/?room=${code}`);
  await other.locator("#player-name").fill("Sam");
  await other.getByRole("button", { name: "Join room", exact: true }).click();
  await expect(page.getByText("Sam", { exact: true })).toBeVisible();
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [568, 320],
    [844, 390],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= window.innerWidth &&
          document.documentElement.scrollHeight <= window.innerHeight,
      ),
      `game overflow at ${width}×${height}`,
    ).toBe(true);
    const board = await page.locator(".match-board").boundingBox();
    expect(Math.abs(board!.width - board!.height)).toBeLessThan(2);
    expect(board!.y + board!.height).toBeLessThanOrEqual(height);
    const cell = await page.locator('[data-cell="0"]').boundingBox();
    expect(cell!.width).toBeGreaterThanOrEqual(40);
    await page.screenshot({ path: `artifacts/tactix-match-${width}.png` });
  }
  const gameTimes: number[] = [];
  page.on("request", (request) => {
    if (
      request.url().includes(`/api/rooms/${code}?heartbeat=1`) &&
      request.method() === "GET"
    )
      gameTimes.push(Date.now());
  });
  const lobby = await browser.newPage();
  const lobbyTimes: number[] = [];
  let navigations = 0;
  lobby.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === lobby.mainFrame())
      navigations += 1;
  });
  lobby.on("request", (request) => {
    if (
      new URL(request.url()).pathname === "/api/rooms" &&
      request.method() === "GET"
    )
      lobbyTimes.push(Date.now());
  });
  await lobby.goto("/");
  await lobby.locator("#player-name").fill("Keep this name");
  await lobby.waitForTimeout(4300);
  expect(gameTimes.length).toBeGreaterThanOrEqual(3);
  expect(lobbyTimes.length).toBeGreaterThanOrEqual(4);
  for (const stream of [gameTimes, lobbyTimes]) {
    const intervals = stream
      .slice(1)
      .map((time, index) => time - stream[index]);
    const regular = intervals.filter((duration) => duration > 500);
    expect(regular.length).toBeGreaterThanOrEqual(2);
    expect(Math.max(...regular)).toBeLessThan(1700);
  }
  await expect(lobby.locator("#player-name")).toHaveValue("Keep this name");
  expect(navigations).toBe(1);
  await Promise.all([
    page.request.patch(`/api/rooms/${code}`, { data: { action: "leave" } }),
    otherContext.request.patch(`/api/rooms/${code}`, {
      data: { action: "leave" },
    }),
  ]);
  await otherContext.close();
  await lobby.close();
});

test("TacTix uses the supplied brand artwork and exposes browser and home-screen icons", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page).toHaveTitle("TacTix — Tic-Tac-Toe for two");
  const logo = page.locator(".brand img");
  await expect(logo).toBeVisible();
  expect(
    await logo.evaluate(
      (element) => (element as HTMLImageElement).naturalWidth,
    ),
  ).toBeGreaterThan(0);
  await expect(
    page.locator('link[rel="icon"][href*="favicon.ico"]'),
  ).toHaveCount(1);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  const favicon = await request.get("/favicon.ico");
  expect(favicon.status()).toBe(200);
  const icon = await request.get("/icon.png");
  expect(icon.status()).toBe(200);
  expect(icon.headers()["content-type"]).toContain("image/png");
  const manifest = await request.get("/manifest.webmanifest");
  expect((await manifest.json()).name).toBe("TacTix");
});

test("paginated public rooms keep creator names and controls inside small viewports", async ({
  page,
}) => {
  await page.request.get("/api/session");
  const codes: string[] = [];
  try {
    for (let index = 1; index <= 3; index += 1) {
      const response = await page.request.post("/api/rooms", {
        data: {
          playerName: `Creator ${index}`,
          name: `Listing ${index} ${Date.now().toString(36)}`,
          visibility: "public",
        },
      });
      expect(response.status()).toBe(200);
      codes.push((await response.json()).room.code);
    }
    await page.goto("/");
    await page.locator("#player-name").fill("Viewer");
    await page.getByRole("button", { name: /Public rooms/ }).click();
    await expect(page.locator(".public-room")).toHaveCount(2);
    await expect(
      page.getByText("Created by Creator 3", { exact: true }),
    ).toBeVisible();
    for (const [width, height] of [
      [320, 568],
      [390, 844],
      [568, 320],
      [1440, 900],
    ]) {
      await page.setViewportSize({ width, height });
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollHeight <= window.innerHeight &&
            document.documentElement.scrollWidth <= window.innerWidth,
        ),
        `public room overflow at ${width}×${height}`,
      ).toBe(true);
      const next = await page
        .getByRole("button", { name: "Next rooms" })
        .boundingBox();
      expect(next!.y + next!.height).toBeLessThanOrEqual(height);
    }
  } finally {
    await Promise.all(
      codes.map((code) =>
        page.request.patch(`/api/rooms/${code}`, { data: { action: "leave" } }),
      ),
    );
  }
});

test("an invitation survives a startup outage and joins after automatic recovery", async ({
  page,
  browser,
}) => {
  const code = await makeRoom(page, "private", "Invitation recovery");
  const guestContext = await browser.newContext();
  try {
    const guest = await guestContext.newPage();
    let failedSession = false;
    await guest.route("**/api/session", async (route) => {
      if (!failedSession) {
        failedSession = true;
        await route.fulfill({
          status: 503,
          contentType: "text/html",
          body: "<html>Temporarily unavailable</html>",
        });
      } else await route.continue();
    });
    await guest.goto(`/?room=${code}`);
    await expect(guest.locator("#join-code")).toHaveValue(code);
    await expect(guest.locator("#player-name")).toBeEnabled();
    await guest.locator("#player-name").fill("Sam");
    await guest.getByRole("button", { name: "Join room", exact: true }).click();
    await expect(
      guest.getByRole("heading", { name: "Invitation recovery", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Sam", { exact: true })).toBeVisible();
    await expect(guest.locator(".form-error")).toHaveCount(0);
    expect(failedSession).toBe(true);
  } finally {
    await guestContext.request.patch(`/api/rooms/${code}`, {
      data: { action: "leave" },
    });
    await page.request.patch(`/api/rooms/${code}`, {
      data: { action: "leave" },
    });
    await guestContext.close();
  }
});

test("a temporary restore outage preserves the remembered seat and name", async ({
  page,
}) => {
  const code = await makeRoom(page, "private", "Restore recovery");
  let failedRestore = false;
  await page.route("**/api/rooms/*", async (route) => {
    if (!failedRestore && route.request().method() === "GET") {
      failedRestore = true;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Temporarily unavailable" }),
      });
    } else await route.continue();
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Restore recovery", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("tactix-room"))).toBe(
    code,
  );
  await expect(page.locator(".player-identity").first()).toContainText("Alex");
  expect(failedRestore).toBe(true);
  await page.request.patch(`/api/rooms/${code}`, { data: { action: "leave" } });
});
