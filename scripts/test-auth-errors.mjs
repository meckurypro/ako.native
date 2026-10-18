// scripts/test-auth-errors.mjs — run: node scripts/test-auth-errors.mjs
// Verifies what the signed-out screens say when the network is the problem: a failed request is reported as the
// connection (never as a wrong password), real refusals keep their own wording, and hung requests time out.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const ts = require(path.join(root, "node_modules/typescript"));
function load(rel, deps = {}) {
  const src = readFileSync(path.join(root, "src", rel + ".ts"), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: "commonjs", target: "es2022" } }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", "require", js)(mod, mod.exports, (id) => (id in deps ? deps[id] : require(id)));
  return mod.exports;
}
const boot = load("lib/offlineBoot");
const a = load("lib/authErrors", { "./offlineBoot": boot });

// ── a request that never reached the server is the connection's fault ──
assert.equal(a.authErrorMessage({ name: "AuthRetryableFetchError", message: "Network request failed" }, "Incorrect email or password."), a.NETWORK_AUTH_MESSAGE, "supabase-js unreachable");
assert.equal(a.authErrorMessage(new Error("TypeError: Network request failed"), "x"), a.NETWORK_AUTH_MESSAGE, "wrapped fetch failure");
// ── a real refusal keeps its own wording ──
assert.equal(a.authErrorMessage({ name: "AuthApiError", message: "Invalid login credentials", status: 400 }, "Incorrect email or password."), "Incorrect email or password.", "wrong password");
assert.equal(a.authErrorMessage({ message: "User already registered", status: 422 }, "taken"), "taken", "already registered");
assert.equal(a.authErrorMessage(null, "fallback"), "fallback", "no error object");
// ── copy sanity: both messages point at the connection and say what to do ──
assert.match(a.NETWORK_AUTH_MESSAGE, /internet|connection/i);
assert.match(a.SLOW_AUTH_MESSAGE, /connection/i);
assert.ok(a.AUTH_REQUEST_TIMEOUT_MS >= 10_000 && a.AUTH_REQUEST_TIMEOUT_MS <= 60_000, "a sane ceiling");
// ── raceAuth accepts a thenable (supabase query builders aren't real Promises) ──
const thenable = { then: (ok) => ok("answer") };
assert.deepEqual(await a.raceAuth(thenable), { timedOut: false, value: "answer" });

console.log("auth-errors: all checks passed");
