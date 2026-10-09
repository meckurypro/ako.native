// src/lib/secureDb.ts
// An encrypted (SQLCipher) SQLite database for the offline cache — separate from the plain `localStorage`
// store, which holds only non-sensitive UI preferences.
//
//   • Key: a random 256-bit key in the Keychain/Keystore (expo-secure-store), applied as a raw SQLCipher key
//     (`PRAGMA key = "x'…'"`) so there's no per-open KDF cost.
//   • Fail closed: SQLCipher is a native build option (expo-sqlite plugin `useSQLCipher`). If this build lacks it,
//     `PRAGMA key` silently does nothing and data would be written in the clear — so in a release build we refuse
//     to open the DB at all (callers get null and simply don't cache). Dev builds warn and continue.
//   • The cache is disposable: a wrong key (reinstall / restored backup) or corruption → delete and start over.
import { getRandomBytes } from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import * as SQLite from "expo-sqlite";

const DB_NAME = "ako-secure.db";
const DB_KEY_NAME = "ako.db-key.v1";

async function loadKeyHex(): Promise<string> {
  let hex: string | null = null;
  try {
    hex = await SecureStore.getItemAsync(DB_KEY_NAME);
  } catch {
    hex = null;
  }
  if (!hex || !/^[0-9a-f]{64}$/.test(hex)) {
    hex = Array.from(getRandomBytes(32), (b) => b.toString(16).padStart(2, "0")).join("");
    await SecureStore.setItemAsync(DB_KEY_NAME, hex, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
  }
  return hex;
}

async function openAndVerify(keyHex: string): Promise<SQLite.SQLiteDatabase | null> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  try {
    // Must be the first statement on the connection.
    await db.execAsync(`PRAGMA key = "x'${keyHex}'";`);
    const cipher = await db.getFirstAsync<{ cipher_version?: string }>("PRAGMA cipher_version;");
    if (!cipher?.cipher_version) {
      if (!__DEV__) {
        await db.closeAsync();
        return null; // no SQLCipher in this build: refuse to store anything unencrypted
      }
      console.warn("[secureDb] SQLCipher not present in this build — the offline cache is NOT encrypted (dev only).");
    }
    await db.getFirstAsync("SELECT count(*) AS c FROM sqlite_master;"); // throws on a wrong key / corrupt file
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA secure_delete = ON;
      CREATE TABLE IF NOT EXISTS kv_cache (
        namespace  TEXT NOT NULL,
        key        TEXT NOT NULL,
        value      TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (namespace, key)
      ) WITHOUT ROWID;
    `);
    return db;
  } catch (e) {
    await db.closeAsync().catch(() => {});
    throw e;
  }
}

let dbPromise: Promise<SQLite.SQLiteDatabase | null> | null = null;

/** null when the encrypted DB is unavailable — callers must treat caching as best-effort. */
export function getSecureDb(): Promise<SQLite.SQLiteDatabase | null> {
  dbPromise ??= (async () => {
    try {
      return await openAndVerify(await loadKeyHex());
    } catch {
      try {
        await SQLite.deleteDatabaseAsync(DB_NAME);
        return await openAndVerify(await loadKeyHex());
      } catch (e) {
        if (__DEV__) console.warn("[secureDb] unavailable", e);
        return null;
      }
    }
  })();
  return dbPromise;
}

export async function secureKvGet(namespace: string, key: string): Promise<string | null> {
  const db = await getSecureDb();
  if (!db) return null;
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM kv_cache WHERE namespace = ? AND key = ?;", [namespace, key]);
  return row?.value ?? null;
}

// After a wipe (sign-out) nothing may be written until the next sign-in resumes caching — otherwise a
// throttled write that was already queued could put the data right back on disk.
let writesPaused = false;

export function resumeSecureCache(): void {
  writesPaused = false;
}

export async function secureKvSet(namespace: string, key: string, value: string): Promise<void> {
  if (writesPaused) return;
  const db = await getSecureDb();
  if (!db) return;
  await db.runAsync("INSERT OR REPLACE INTO kv_cache (namespace, key, value, updated_at) VALUES (?, ?, ?, ?);", [namespace, key, value, Date.now()]);
}

export async function secureKvDelete(namespace: string, key: string): Promise<void> {
  const db = await getSecureDb();
  if (!db) return;
  await db.runAsync("DELETE FROM kv_cache WHERE namespace = ? AND key = ?;", [namespace, key]);
}

/** Sign-out / account removal: drop every cached row and truncate the WAL so nothing lingers on disk. */
export async function wipeSecureCache(): Promise<void> {
  writesPaused = true; // set first: block queued writes even while the DELETE is still opening the DB
  try {
    const db = await getSecureDb();
    if (!db) return;
    await db.execAsync("DELETE FROM kv_cache; PRAGMA wal_checkpoint(TRUNCATE);");
  } catch {
    /* best-effort */
  }
}
