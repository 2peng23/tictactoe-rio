export const POLL_INTERVAL = 1000;

/** One active request, a one-second start cadence, and an immediate reconnect refresh. */
export function startPolling(
  operation: (signal: AbortSignal) => Promise<void>,
  onOffline?: () => void,
): () => void {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  let stopped = false;
  let running = false;
  let queued = false;

  async function poll() {
    if (stopped) return;
    if (running) {
      queued = true;
      return;
    }
    if (!navigator.onLine) {
      onOffline?.();
      timer = setTimeout(poll, POLL_INTERVAL);
      return;
    }
    running = true;
    const started = performance.now();
    try {
      await operation(controller.signal);
    } finally {
      running = false;
      if (!stopped) {
        const delay = queued
          ? 0
          : Math.max(0, POLL_INTERVAL - (performance.now() - started));
        queued = false;
        timer = setTimeout(poll, delay);
      }
    }
  }

  const wake = () => {
    if (document.hidden || stopped) return;
    clearTimeout(timer);
    void poll();
  };
  const offline = () => {
    onOffline?.();
  };
  document.addEventListener("visibilitychange", wake);
  window.addEventListener("focus", wake);
  window.addEventListener("online", wake);
  window.addEventListener("offline", offline);
  void poll();
  return () => {
    stopped = true;
    controller.abort();
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", wake);
    window.removeEventListener("focus", wake);
    window.removeEventListener("online", wake);
    window.removeEventListener("offline", offline);
  };
}
