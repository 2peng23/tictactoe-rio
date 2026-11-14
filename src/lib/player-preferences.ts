const NAME_KEY = "tactix-name";
const ROOM_KEY = "tactix-room";

function remember(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* Preferences are optional; the server owns identity and game state. */
  }
}

export function rememberPlayerName(name: string): void {
  remember(NAME_KEY, name.trim());
}

export function rememberRoom(code: string | null): void {
  remember(ROOM_KEY, code);
}

export function readPlayerPreferences(): { name: string; roomCode: string } {
  try {
    const name =
      localStorage.getItem(NAME_KEY) ||
      localStorage.getItem("afterhours-name") ||
      "";
    const roomCode =
      localStorage.getItem(ROOM_KEY) ||
      localStorage.getItem("afterhours-room") ||
      "";
    rememberPlayerName(name);
    rememberRoom(roomCode || null);
    localStorage.removeItem("afterhours-name");
    localStorage.removeItem("afterhours-room");
    return { name, roomCode };
  } catch {
    return { name: "", roomCode: "" };
  }
}
