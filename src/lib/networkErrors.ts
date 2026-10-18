// src/lib/networkErrors.ts
// True when an error means "couldn't reach the server" (offline, DNS, dead data, timeout) rather than "the server said
// no". Screens use it to say "you're offline" instead of printing a raw "Network request failed", or worse, concluding
// there is nothing to show.
const NETWORK_MESSAGE = /network request failed|failed to fetch|fetch failed|network error|networkerror|timed out|timeout|offline|internet connection|econn|enotfound/i;

export function isNetworkError(error: unknown): boolean {
  if (!error) return false;
  const e = error as { name?: unknown; message?: unknown };
  if (e.name === "AuthRetryableFetchError") return true;
  const text = `${typeof e.message === "string" ? e.message : ""} ${typeof error === "string" ? error : ""}`;
  return NETWORK_MESSAGE.test(text);
}
