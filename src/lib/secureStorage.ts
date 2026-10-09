// src/lib/secureStorage.ts
// At-rest encryption for the few things that must never sit on disk in plain text: the Supabase session
// (access + refresh token) and the account switcher's saved sessions.
//
// Design (the documented Supabase React Native pattern): a random 256-bit master key lives in the OS
// secure enclave-backed store (iOS Keychain / Android Keystore via expo-secure-store) and is loaded into memory once at
// startup; values are AES-256-CTR encrypted with a fresh random 128-bit counter each time and the ciphertext
// is what lands in AsyncStorage / SQLite. A magic prefix inside the plaintext makes a wrong/lost key read back as
// "no data" (the user simply signs in again) rather than as garbage.
//
// Why not SecureStore directly: it caps value size (~2 KB on Android) and a Supabase session is bigger.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as aesjs from "aes-js";
import { getRandomBytes } from "expo-crypto";
import * as SecureStore from "expo-secure-store";

const MASTER_KEY_NAME = "ako.master-key.v1";
/** Marks a stored value as ciphertext (anything else is legacy plaintext awaiting migration). */
export const ENCRYPTED_PREFIX = "enc:v1:";
const PLAINTEXT_MAGIC = "AKO1";

let masterKey: Uint8Array | null = null;
let initPromise: Promise<void> | null = null;

/** Load (or create) the master key. Idempotent — await it before any encrypt/decrypt. */
export function initSecureStorage(): Promise<void> {
  initPromise ??= (async () => {
    let hex: string | null = null;
    try {
      hex = await SecureStore.getItemAsync(MASTER_KEY_NAME);
    } catch {
      hex = null; // a corrupted keystore entry: fall through and mint a new key (old ciphertext becomes unreadable → re-login)
    }
    if (!hex || hex.length !== 64) {
      hex = aesjs.utils.hex.fromBytes(getRandomBytes(32));
      await SecureStore.setItemAsync(MASTER_KEY_NAME, hex, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
    }
    masterKey = aesjs.utils.hex.toBytes(hex);
  })().catch((e) => {
    initPromise = null; // allow a retry
    throw e;
  });
  return initPromise;
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(ENCRYPTED_PREFIX);
}

export function encryptSync(plaintext: string): string {
  if (!masterKey) throw new Error("secureStorage used before initSecureStorage() resolved");
  const iv = getRandomBytes(16);
  const cipher = new aesjs.ModeOfOperation.ctr(masterKey, new aesjs.Counter(iv));
  const bytes = cipher.encrypt(aesjs.utils.utf8.toBytes(PLAINTEXT_MAGIC + plaintext));
  return ENCRYPTED_PREFIX + aesjs.utils.hex.fromBytes(iv) + aesjs.utils.hex.fromBytes(bytes);
}

/** null when the value isn't ours, is corrupt, or was written under a different key. */
export function decryptSync(payload: string): string | null {
  if (!masterKey || !isEncrypted(payload)) return null;
  try {
    const body = payload.slice(ENCRYPTED_PREFIX.length);
    const iv = aesjs.utils.hex.toBytes(body.slice(0, 32));
    const cipherBytes = aesjs.utils.hex.toBytes(body.slice(32));
    const cipher = new aesjs.ModeOfOperation.ctr(masterKey, new aesjs.Counter(iv));
    const text = aesjs.utils.utf8.fromBytes(cipher.decrypt(cipherBytes));
    return text.startsWith(PLAINTEXT_MAGIC) ? text.slice(PLAINTEXT_MAGIC.length) : null;
  } catch {
    return null;
  }
}

/**
 * Supabase auth storage adapter. Existing installs hold the session in plain text; the first read re-writes
 * it encrypted, so nobody is signed out by this change.
 */
export const encryptedAuthStorage = {
  async getItem(key: string): Promise<string | null> {
    await initSecureStorage();
    const raw = await AsyncStorage.getItem(key);
    if (raw == null) return null;
    if (isEncrypted(raw)) return decryptSync(raw);
    await AsyncStorage.setItem(key, encryptSync(raw)); // legacy plaintext → migrate
    return raw;
  },
  async setItem(key: string, value: string): Promise<void> {
    await initSecureStorage();
    await AsyncStorage.setItem(key, encryptSync(value));
  },
  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
  },
};
