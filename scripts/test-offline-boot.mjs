// scripts/test-offline-boot.mjs — run: node scripts/test-offline-boot.mjs
// Verifies the pure helpers that keep the app from waiting forever on a network that isn't answering:
// what counts as a network failure (and what must NOT), the timeout race, and the grace-period arithmetic.
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
const b = load("lib/offlineBoot");

// ── isNetworkError: only "couldn't reach the server" ──
assert.equal(b.isNetworkError({ name: "AuthRetryableFetchError", message: "x" }), true, "supabase-js unreachable");
assert.equal(b.isNetworkError(new TypeError("Network request failed")), true, "react native fetch");
assert.equal(b.isNetworkError({ message: "TypeError: Failed to fetch", code: "" }), true, "postgrest-js wrapping a fetch failure");
assert.equal(b.isNetworkError({ message: "The request timed out." }), true, "timeout");
assert.equal(b.isNetworkError({ code: "ETIMEDOUT", message: "" }), true, "socket code");
assert.equal(b.isNetworkError({ message: "permission denied for table profiles", code: "42501" }), false, "server said no");
assert.equal(b.isNetworkError({ message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" }), false, "not found");
assert.equal(b.isNetworkError({ message: "Request failed", status: 503 }), false, "an HTTP answer means the network worked");
assert.equal(b.isNetworkError({ message: "network error", status: 0 }), true, "status 0 is no answer at all");
assert.equal(b.isNetworkError(null), false);
assert.equal(b.isNetworkError(undefined), false);
assert.equal(b.isNetworkError("Network request failed"), false, "only error-shaped values");

// ── raceWithTimeout ──
const fast = await b.raceWithTimeout(new Promise((r) => setTimeout(() => r("ok"), 5)), 200);
assert.deepEqual(fast, { timedOut: false, value: "ok" }, "a prompt answer wins");
const slow = await b.raceWithTimeout(new Promise((r) => setTimeout(() => r("late"), 300)), 20);
assert.deepEqual(slow, { timedOut: true }, "a hung request loses to the clock");
const never = await b.raceWithTimeout(new Promise(() => {}), 20);
assert.equal(never.timedOut, true, "a promise that never settles still returns");
await assert.rejects(b.raceWithTimeout(Promise.reject(new Error("boom")), 50), /boom/, "a real rejection still surfaces");

// ── remainingMs ──
assert.equal(b.remainingMs(1000, 4000, 1000), 4000, "full budget at the start");
assert.equal(b.remainingMs(1000, 4000, 3000), 2000, "counts down");
assert.equal(b.remainingMs(1000, 4000, 5000), 0, "exactly spent");
assert.equal(b.remainingMs(1000, 4000, 99999), 0, "never negative");

console.log("offline-boot: all checks passed");
