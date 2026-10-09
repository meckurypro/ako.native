// src/lib/accountSessions.ts
// ============================================================
// Per-device "accounts signed into on this browser" cache — what
// actually powers instant account switching (Instagram/TikTok-style).
// Nothing here talks to the server; see hooks/useAccountSwitcher.ts
// for the mutations that call supabase.auth on top of this.
//
// On the web, refresh tokens in localStorage match what supabase-js does for
// the active session. On native that's not good enough: these are bearer
// credentials for EVERY saved account, so they're AES-encrypted at rest
// (lib/secureStorage.ts; key in the Keychain/Keystore). Older plain-text values
// are migrated the first time they're read.
//
// Deliberately NOT React state / a hook of its own: reads and writes
// are synchronous and cheap, and the couple of places that need to
// react to changes (AccountSwitcher's list) just re-read after a
// mutation succeeds rather than needing a subscription.
// ============================================================

import { decryptSync, encryptSync, isEncrypted } from "./secureStorage";

const STORAGE_KEY = "ako.saved_accounts.v1";

export interface SavedAccount {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  access_token: string;
  refresh_token: string;
}

/** Decrypts a stored value; a legacy plain-text one is returned as-is and immediately re-saved encrypted. */
function readProtected(key: string, stored: string): string | null {
  if (isEncrypted(stored)) return decryptSync(stored);
  localStorage.setItem(key, encryptSync(stored));
  return stored;
}

function writeAccounts(accounts: SavedAccount[]): void {
  localStorage.setItem(STORAGE_KEY, encryptSync(JSON.stringify(accounts)));
}

export function listSavedAccounts(): SavedAccount[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const raw = readProtected(STORAGE_KEY, stored);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Upserts by user_id — re-adding an account you've already saved just
// refreshes its cached tokens/profile snapshot rather than duplicating it.
export function saveAccount(account: SavedAccount): void {
  const accounts = listSavedAccounts().filter((a) => a.user_id !== account.user_id);
  accounts.push(account);
  writeAccounts(accounts);
}

export function removeSavedAccount(userId: string): void {
  const accounts = listSavedAccounts().filter((a) => a.user_id !== userId);
  writeAccounts(accounts);
}

export function getSavedAccount(userId: string): SavedAccount | undefined {
  return listSavedAccounts().find((a) => a.user_id === userId);
}

// Keeps a saved account's cached tokens in sync with whatever Supabase
// does to that session in the background. Supabase rotates the refresh
// token on every silent auto-refresh — without this, a saved account's
// cached token pair goes stale the moment it refreshes while active
// (even if the user never manually re-saves it), and switching back to
// it later fails on setSession with no obvious cause. No-ops if this
// user has nothing saved yet — there's nothing to keep in sync.
export function updateSavedAccountTokens(
  userId: string,
  tokens: { access_token: string; refresh_token: string }
): void {
  const accounts = listSavedAccounts();
  const idx = accounts.findIndex((a) => a.user_id === userId);
  if (idx === -1) return;
  accounts[idx] = { ...accounts[idx], ...tokens };
  writeAccounts(accounts);
}

// ------------------------------------------------------------
// Pending "add account via sign-up" handoff.
//
// Signing up doesn't establish a session until the confirmation link
// is clicked (see SignUp.tsx), so unlike the login path there's no
// single call where "the account that was active before this" can be
// captured and saved in one go — the confirmation click that finally
// creates the new session might even land in a different tab. This
// stashes the outgoing account in localStorage right before the
// sign-up call so AuthCallback can find it again once the new
// account's SIGNED_IN event actually fires, and finish the same
// save-both-accounts-and-link flow the login path does inline.
// ------------------------------------------------------------

const PENDING_ADD_KEY = "ako.pending_add_account.v1";

export function setPendingAddAccount(account: SavedAccount): void {
  localStorage.setItem(PENDING_ADD_KEY, encryptSync(JSON.stringify(account)));
}

// Reads and clears in one step — this is only ever meant to be
// consumed once, by the next SIGNED_IN event after it's set.
export function takePendingAddAccount(): SavedAccount | null {
  try {
    const stored = localStorage.getItem(PENDING_ADD_KEY);
    localStorage.removeItem(PENDING_ADD_KEY);
    if (!stored) return null;
    const raw = isEncrypted(stored) ? decryptSync(stored) : stored;
    return raw ? (JSON.parse(raw) as SavedAccount) : null;
  } catch {
    return null;
  }
}
