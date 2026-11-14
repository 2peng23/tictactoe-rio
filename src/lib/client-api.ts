export class RequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "RequestError";
  }
}

/** Shared browser transport: callers own cancellation and recovery policy. */
export async function requestApi<Result>(
  url: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<Result> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 10_000);
  try {
    const response = await fetch(url, {
      method,
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
      headers:
        body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result: unknown = await response.json().catch((failure: unknown) => {
      if (controller.signal.aborted) throw failure;
      return null;
    });
    if (!response.ok) {
      const message =
        result &&
        typeof result === "object" &&
        "error" in result &&
        typeof result.error === "string"
          ? result.error
          : "Something interrupted the game. Please try again.";
      throw new RequestError(message, response.status);
    }
    if (result === null)
      throw new RequestError(
        "The server returned an incomplete response. Please try again.",
        503,
      );
    return result as Result;
  } catch (failure) {
    if (controller.signal.aborted && !signal?.aborted) {
      throw new RequestError(
        "The connection took too long. Please try again.",
        503,
      );
    }
    throw failure;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
