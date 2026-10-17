// scripts/test-auth-offline.mjs — run: node scripts/test-auth-offline.mjs
// Verifies the pure helpers behind "start offline while signed in": the storage key supabase-js uses, which errors
// mean "server unreachable" (and which must NOT), and that only a usable stored session is ever trusted.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const ts = require(path.join(root, "node_modules/typescript"));
function load(rel) {
  const src = readFileSync(path.join(root, "src", rel + ".ts"), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: "commonjs", target: "es2022" } }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", "require", js)(mod, mod.exports, require);
  return mod.exports;
}
const a = load("lib/authOffline");

// ── storage key matches what supabase-js writes ──
assert.equal(a.authStorageKey("https://khxrbutzwkhrqzuolfvp.supabase.co"), "sb-khxrbutzwkhrqzuolfvp-auth-token");
assert.equal(a.authStorageKey("https://khxrbutzwkhrqzuolfvp.supabase.co/"), "sb-khxrbutzwkhrqzuolfvp-auth-token", "trailing slash");
assert.equal(a.authStorageKey("http://localhost:54321"), "sb-localhost-auth-token", "local dev");
assert.equal(a.authStorageKey("not a url"), null);
assert.equal(a.authStorageKey(""), null);

// ── only a network/5xx failure counts as "couldn't reach the server" ──
assert.equal(a.isUnreachableError({ name: "AuthRetryableFetchError", status: 0 }), true, "offline");
assert.equal(a.isUnreachableError({ name: "AuthRetryableFetchError", status: 503 }), true, "server down");
assert.equal(a.isUnreachableError({ name: "AuthApiError", status: 400, message: "Invalid Refresh Token" }), false, "revoked/invalid session must still sign out");
assert.equal(a.isUnreachableError({ name: "AuthSessionMissingError" }), false, "genuinely no session");
assert.equal(a.isUnreachableError(null), false, "no error");
assert.equal(a.isUnreachableError(undefined), false);
assert.equal(a.isUnreachableError("AuthRetryableFetchError"), false, "a string isn't an error object");

// ── only a complete stored session is trusted ──
const good = { access_token: "a", refresh_token: "r", expires_at: 1, token_type: "bearer", user: { id: "u1", email: "x@y.z" } };
assert.equal(a.parseStoredSession(JSON.stringify(good)).user.id, "u1");
assert.equal(a.parseStoredSession(null), null);
assert.equal(a.parseStoredSession(undefined), null);
assert.equal(a.parseStoredSession(""), null);
assert.equal(a.parseStoredSession("not json{"), null, "corrupt storage never throws");
assert.equal(a.parseStoredSession("[]"), null, "array");
assert.equal(a.parseStoredSession("null"), null);
assert.equal(a.parseStoredSession("42"), null);
assert.equal(a.parseStoredSession(JSON.stringify({ ...good, access_token: "" })), null, "empty access token");
assert.equal(a.parseStoredSession(JSON.stringify({ ...good, refresh_token: undefined })), null, "no refresh token → nothing could ever renew it");
assert.equal(a.parseStoredSession(JSON.stringify({ ...good, user: undefined })), null, "no user");
assert.equal(a.parseStoredSession(JSON.stringify({ ...good, user: { email: "x" } })), null, "user without id");
assert.equal(a.parseStoredSession(JSON.stringify({ ...good, user: "u1" })), null, "user of the wrong type");

console.log("auth-offline: all assertions passed");
