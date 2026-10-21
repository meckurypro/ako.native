// scripts/test-follow-cache.mjs — run: node scripts/test-follow-cache.mjs
// Verifies the instant-follow cache helpers (src/lib/followCache.ts): a follow/unfollow lands in every cached copy
// (button flag, both profile counters, Followers/Following lists), a rejected write rolls back EXACTLY, the people
// lists never touch the separate "pages I follow" list, and failures map to readable messages — against the REAL
// @tanstack/query-core. Identical copy lives in the native repo.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const ts = (() => { try { return require(path.join(root, "node_modules/typescript")); } catch { return require("typescript"); } })();
const { QueryClient } = require(path.join(root, "node_modules/@tanstack/query-core"));

const cache = {};
function load(rel) {
  if (cache[rel]) return cache[rel];
  const src = readFileSync(path.join(root, "src", rel + ".ts"), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: "commonjs", target: "es2022" } }).outputText;
  const mod = { exports: {} };
  const localRequire = (id) => (id.startsWith("./") ? load("lib/" + id.slice(2)) : require(id));
  new Function("module", "exports", "require", js)(mod, mod.exports, localRequire);
  return (cache[rel] = mod.exports);
}
const f = load("lib/followCache");

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log("  ok -", name); };

const ME = "me", T = "target";
function fresh() {
  const qc = new QueryClient();
  qc.setQueryData(["profile", "target"], { id: T, username: "target", follower_count: 5, following_count: 2 });
  qc.setQueryData(["profile", "me"], { id: ME, username: "me", follower_count: 1, following_count: 3 });
  qc.setQueryData(["followers", T], [{ id: "x" }]);
  qc.setQueryData(["following", ME], [{ id: "y" }]);
  qc.setQueryData(["following", "pages", ME], [{ id: "pg" }]);
  qc.setQueryData(["is-following", T, ME], false);
  return qc;
}
const get = (qc, k) => qc.getQueryData(k);
function follow(qc, snap, on) {
  f.setCached(qc, snap, ["is-following", T, ME], on);
  f.adjustProfileCount(qc, snap, T, "follower_count", on ? 1 : -1);
  f.adjustProfileCount(qc, snap, ME, "following_count", on ? 1 : -1);
  f.setInPeopleList(qc, snap, "followers", T, f.findCachedProfile(qc, ME), ME, on);
  f.setInPeopleList(qc, snap, "following", ME, f.findCachedProfile(qc, T), T, on);
}

test("follow updates the flag, both counters and both people lists at once", () => {
  const qc = fresh(); follow(qc, [], true);
  assert.equal(get(qc, ["is-following", T, ME]), true);
  assert.equal(get(qc, ["profile", "target"]).follower_count, 6);
  assert.equal(get(qc, ["profile", "me"]).following_count, 4);
  assert.deepEqual(get(qc, ["followers", T]).map((p) => p.id), [ME, "x"]);
  assert.deepEqual(get(qc, ["following", ME]).map((p) => p.id), [T, "y"]);
});

test("the pages-I-follow list is never touched by the people lists", () => {
  const qc = fresh(); follow(qc, [], true);
  assert.deepEqual(get(qc, ["following", "pages", ME]), [{ id: "pg" }]);
});

test("a rejected write restores the exact previous state", () => {
  const qc = fresh(); const snap = []; follow(qc, snap, true); f.restoreSnapshot(qc, snap);
  assert.equal(get(qc, ["is-following", T, ME]), false);
  assert.equal(get(qc, ["profile", "target"]).follower_count, 5);
  assert.equal(get(qc, ["profile", "me"]).following_count, 3);
  assert.deepEqual(get(qc, ["followers", T]).map((p) => p.id), ["x"]);
  assert.deepEqual(get(qc, ["following", ME]).map((p) => p.id), ["y"]);
});

test("unfollow removes the person and counters never go below zero", () => {
  const qc = fresh(); follow(qc, [], true); follow(qc, [], false);
  assert.equal(get(qc, ["profile", "target"]).follower_count, 5);
  assert.deepEqual(get(qc, ["followers", T]).map((p) => p.id), ["x"]);
  qc.setQueryData(["profile", "target"], { id: T, follower_count: 0 });
  f.adjustProfileCount(qc, [], T, "follower_count", -1);
  assert.equal(get(qc, ["profile", "target"]).follower_count, 0);
});

test("a snapshot keeps the FIRST value of a key written twice", () => {
  const qc = new QueryClient(); qc.setQueryData(["k"], 1); const snap = [];
  f.setCached(qc, snap, ["k"], 2); f.setCached(qc, snap, ["k"], 3); f.restoreSnapshot(qc, snap);
  assert.equal(get(qc, ["k"]), 1);
});

test("list insert is idempotent and skipped when the profile row was never loaded", () => {
  const qc = new QueryClient(); qc.setQueryData(["followers", "z"], [{ id: "a" }]);
  f.setInPeopleList(qc, [], "followers", "z", { id: "a" }, "a", true);
  f.setInPeopleList(qc, [], "followers", "z", undefined, "b", true);
  assert.equal(get(qc, ["followers", "z"]).length, 1);
});

test("failures become readable sentences; only network errors are retried", () => {
  assert.match(f.friendlyFollowError({ code: "42501", message: 'new row violates row-level security policy for table "follows"' }), /isn't available on your account yet/);
  const guard = "Pages can't follow other pages. Switch to your personal account to follow.";
  assert.equal(f.friendlyFollowError({ code: "42501", message: guard }), guard);
  assert.match(f.friendlyFollowError({ message: "Request not found" }), /no longer available/);
  assert.match(f.friendlyFollowError({ message: "TypeError: Failed to fetch" }), /No connection/);
  assert.equal(f.friendlyFollowError({ message: "boom" }, "fallback"), "fallback");
  assert.equal(f.retryTransientOnly(0, new TypeError("Failed to fetch")), true);
  assert.equal(f.retryTransientOnly(0, { code: "42501" }), false);
  assert.equal(f.retryTransientOnly(2, new Error("x")), false);
});

console.log(`${passed} follow-cache checks passed`);
