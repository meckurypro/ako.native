// src/lib/downloadFile.ts
// The "preparing" step before a file download: confirm the file is still there, then let the caller hand the URL to
// the system. A HEAD request is enough — the file itself is streamed by the system browser / download manager, so a
// 100 MB file never has to fit in the app's memory. If the check can't run (blocked, flaky signal) we still go ahead.

export type PrepareResult = { ok: true; bytes: number | null } | { ok: false; reason: "missing" | "slow" };

const CHECK_TIMEOUT_MS = 8000;
/** So the loading state reads as a state, not a flicker. */
const MIN_PREPARE_MS = 450;

export async function prepareDownload(url: string): Promise<PrepareResult> {
  const started = Date.now();
  const wait = async () => {
    const left = MIN_PREPARE_MS - (Date.now() - started);
    if (left > 0) await new Promise<void>((r) => setTimeout(() => r(), left));
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CHECK_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: "HEAD", signal: ctrl.signal });
    await wait();
    if (res.status === 404 || res.status === 400 || res.status === 403) return { ok: false, reason: "missing" };
    const len = Number(res.headers.get("content-length"));
    return { ok: true, bytes: Number.isFinite(len) && len > 0 ? len : null };
  } catch (err) {
    await wait();
    if ((err as { name?: string })?.name === "AbortError") return { ok: false, reason: "slow" };
    return { ok: true, bytes: null };
  } finally {
    clearTimeout(timer);
  }
}
