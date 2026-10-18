// src/lib/authErrors.ts
//
// Pure helpers (unit-tested in node, scripts/test-auth-errors.mjs) for what the signed-out screens say when the
// network is the problem.
//
// Before this, every failure on Login read "Incorrect email or password." — including a request that never left the
// phone — and the reset screen announced "check your inbox" for an email that was never sent. With no signal, the
// honest message is the connection, not the person's password.
import { isNetworkError, raceWithTimeout, type Raced } from "./offlineBoot";

export const NETWORK_AUTH_MESSAGE = "No internet connection. Check your connection and try again.";
export const SLOW_AUTH_MESSAGE = "This is taking too long. Check your connection and try again.";

/** A sign-in / sign-up request that hasn't answered by now is on a dead network, not a slow server. */
export const AUTH_REQUEST_TIMEOUT_MS = 20_000;

/**
 * The message for a failed auth request: the connection message when the server couldn't be reached, otherwise
 * `fallback` (the screen's own wording for a real refusal — wrong password, taken username, …).
 */
export function authErrorMessage(error: unknown, fallback: string): string {
  return isNetworkError(error) ? NETWORK_AUTH_MESSAGE : fallback;
}

/** Races an auth request against AUTH_REQUEST_TIMEOUT_MS. Accepts the thenables supabase-js builders return. */
export function raceAuth<T>(request: PromiseLike<T>): Promise<Raced<T>> {
  return raceWithTimeout(Promise.resolve(request), AUTH_REQUEST_TIMEOUT_MS);
}
