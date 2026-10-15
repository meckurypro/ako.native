// scripts/test-optimistic.mjs — run: node scripts/test-optimistic.mjs
// Verifies the offline-first reaction pipeline against the REAL @tanstack/query-core with a fake Supabase:
// patch math, in-order replay, and offline queue → persist → "app kill" → restore → replay.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const ts = require(path.join(root, "node_modules/typescript"));
const rq = require(path.join(root, "node_modules/@tanstack/react-query"));

const calls = [];
let nextInsertError = null; // set to {code:"23505"} to simulate the unique index rejecting a repeat insert
const fakeSupabase = {
  from: (table) => {
    const rec = { table, filters: [] };
    const chain = {
      insert: (row) => { calls.push({ ...rec, op: "insert", row }); const error = nextInsertError; nextInsertError = null; return Promise.resolve({ error }); },
      delete: () => { rec.op = "delete"; return chain; },
      eq: (c, v) => { rec.filters.push([c, v]); return chain; },
      is: (c, v) => { rec.filters.push([c, v]); return chain; },
      then: (res, rej) => { calls.push({ ...rec }); return Promise.resolve({ error: null }).then(res, rej); },
    };
    return chain;
  },
};

const cache = {};
function load(rel, mocks = {}) {
  const src = readFileSync(path.join(root, "src", rel + ".ts"), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: "commonjs", target: "es2022" } }).outputText;
  const mod = { exports: {} };
  const req = (id) => (id in mocks ? mocks[id] : require(id));
  new Function("module", "exports", "require", js)(mod, mod.exports, req);
  return mod.exports;
}
const oc = load("lib/optimisticCache");
const om = load("lib/offlineMutations", { "./supabase": { supabase: fakeSupabase }, "./optimisticCache": oc });
const qp = load("lib/queryPersister", { "./offlineMutations": om, "./secureDb": {} });

let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log("  ok  " + name); };
const mkClient = () => { const qc = new rq.QueryClient(); om.registerOfflineMutations(qc); qc.mount(); /* QueryClientProvider does this in the app */ return qc; };
const intent = (o) => ({ targetType: "post", targetId: "p1", type: "like", active: true, userId: "u1", actingAsPageId: null, queuedAt: Date.now(), ...o });
const scope = (i) => ({ id: om.reactionScope(i) });
const run = (qc, i) => qc.getMutationCache().build(qc, { mutationKey: om.REACTION_MUTATION_KEY, scope: scope(i) }).execute(i);
const seedFeed = (qc, like = 5) => qc.setQueryData(["feed-posts", "ranked", "u1", 0], [{ id: "p1", like_count: like, dislike_count: 0 }, { id: "p2", like_count: 9, dislike_count: 0 }], { updatedAt: 1 });

await test("patchCounter patches nested rows, shares structure, floors at 0", () => {
  const data = { pages: [[{ id: "a", like_count: 1 }, { id: "b", like_count: 2 }]], other: { id: "c", like_count: 3 } };
  const out = oc.patchCounter(data, "a", "like_count", 1);
  assert.equal(out.pages[0][0].like_count, 2);
  assert.equal(out.pages[0][1], data.pages[0][1]);
  assert.equal(out.other, data.other);
  assert.equal(oc.patchCounter(data, "zzz", "like_count", 1), data);
  assert.equal(oc.patchCounter(data, "a", "like_count", -9).pages[0][0].like_count, 0);
});

await test("confirmed like: count +1 on the right post only, my-reaction set, no refetch", async () => {
  const qc = mkClient(); seedFeed(qc);
  const i = intent({ queuedAt: 100 });
  qc.setQueryData(om.myReactionKey(i), null);
  await run(qc, i);
  const feed = qc.getQueryData(["feed-posts", "ranked", "u1", 0]);
  assert.equal(feed[0].like_count, 6); assert.equal(feed[1].like_count, 9);
  assert.deepEqual(qc.getQueryData(om.myReactionKey(i)), { id: "confirmed" });
  assert.equal(calls.at(-1).op, "insert");
});

await test("like then unlike replays in order and nets to zero", async () => {
  const qc = mkClient(); seedFeed(qc); calls.length = 0;
  const a = intent({ active: true, queuedAt: 100 }), b = intent({ active: false, queuedAt: 101 });
  qc.setQueryData(om.myReactionKey(a), null);
  await Promise.all([run(qc, a), run(qc, b)]);
  assert.deepEqual(calls.map((c) => c.op), ["insert", "delete"]);
  assert.equal(qc.getQueryData(["feed-posts", "ranked", "u1", 0])[0].like_count, 5);
  assert.equal(qc.getQueryData(om.myReactionKey(a)), null);
});

await test("query refreshed AFTER the tap is refetched, not double-counted", async () => {
  const qc = mkClient(); qc.setQueryData(["feed-posts", "x"], [{ id: "p1", like_count: 6 }], { updatedAt: 5000 });
  const i = intent({ queuedAt: 1000 });
  const refetched = oc.adjustCountInCaches(qc, { roots: oc.POST_QUERY_ROOTS, id: "p1", field: "like_count", delta: 1, queuedAt: i.queuedAt });
  assert.equal(refetched.length, 1);
  assert.equal(qc.getQueryData(["feed-posts", "x"])[0].like_count, 6);
});

await test("comment like is mutually exclusive with dislike and moves both counters", async () => {
  const qc = mkClient(); calls.length = 0;
  qc.setQueryData(["my-comment-reactions", "p1", "u1", null, 1], new Map([["c1", { liked: false, disliked: true }]]));
  qc.setQueryData(["comments", "p1"], [{ id: "c1", like_count: 2, dislike_count: 4 }], { updatedAt: 1 });
  const ci = { postId: "p1", commentId: "c1", type: "like", active: true, userId: "u1", actingAsPageId: null, queuedAt: 100 };
  await qc.getMutationCache().build(qc, { mutationKey: om.COMMENT_REACTION_MUTATION_KEY }).execute(ci);
  const row = qc.getQueryData(["comments", "p1"])[0];
  assert.equal(row.like_count, 3); assert.equal(row.dislike_count, 3);
  assert.deepEqual(qc.getQueryData(["my-comment-reactions", "p1", "u1", null, 1]).get("c1"), { liked: true, disliked: false });
  assert.deepEqual(calls.map((c) => c.op), ["delete", "insert"]); // opposite cleared first
});

await test("OFFLINE: queued like is paused, persisted, survives a 'kill', and replays on reconnect", async () => {
  calls.length = 0;
  rq.onlineManager.setOnline(false);
  const qc1 = mkClient(); seedFeed(qc1);
  const i = intent({ queuedAt: 100 });
  qc1.setQueryData(om.myReactionKey(i), null);
  void run(qc1, i).catch(() => {});
  await new Promise((r) => setTimeout(r, 20));
  const m = qc1.getMutationCache().getAll()[0];
  assert.equal(m.state.status, "pending"); assert.equal(m.state.isPaused, true);
  assert.equal(calls.length, 0, "no network call while offline");
  assert.equal(qp.shouldPersistMutation(m), true);

  // persist → JSON round trip (this is what SQLite stores) → brand-new client (the relaunched app)
  const snapshot = JSON.parse(JSON.stringify(rq.dehydrate(qc1, { shouldDehydrateMutation: qp.shouldPersistMutation, shouldDehydrateQuery: () => false })));
  assert.equal(snapshot.mutations.length, 1);
  assert.equal(snapshot.mutations[0].scope.id, om.reactionScope(i));
  qc1.unmount(); qc1.clear(); // the app process dies: nothing from the first client may run again
  const qc2 = mkClient(); seedFeed(qc2);
  qc2.setQueryData(om.myReactionKey(i), null);
  rq.hydrate(qc2, snapshot);
  void qc2.resumePausedMutations();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(calls.length, 0, "still offline after restore");

  rq.onlineManager.setOnline(true);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(calls.length, 1); assert.equal(calls[0].op, "insert"); assert.equal(calls[0].row.post_id, "p1");
  assert.equal(qc2.getQueryData(["feed-posts", "ranked", "u1", 0])[0].like_count, 6);
  assert.deepEqual(qc2.getQueryData(om.myReactionKey(i)), { id: "confirmed" });
});

await test("share on a post patches share_count (the Reshare number); project dislike/share patch nothing", async () => {
  const qc = mkClient(); calls.length = 0;
  qc.setQueryData(["feed-posts", "x"], [{ id: "p1", like_count: 1, dislike_count: 0, share_count: 4 }], { updatedAt: 1 });
  await run(qc, intent({ type: "share", queuedAt: 100 }));
  assert.equal(qc.getQueryData(["feed-posts", "x"])[0].share_count, 5);
  qc.setQueryData(["user-projects", "x"], [{ id: "pr1", like_count: 2, dislike_count: 0 }], { updatedAt: 1 });
  await run(qc, intent({ targetType: "project", targetId: "pr1", type: "dislike", queuedAt: 100 }));
  assert.equal(qc.getQueryData(["user-projects", "x"])[0].dislike_count, 0);
  await run(qc, intent({ targetType: "project", targetId: "pr1", type: "like", queuedAt: 100 }));
  assert.equal(qc.getQueryData(["user-projects", "x"])[0].like_count, 3);
});

await test("duplicate insert (unique violation) is a success but does NOT bump the count", async () => {
  const qc = mkClient(); seedFeed(qc);
  const i = intent({ queuedAt: 100 });
  qc.setQueryData(om.myReactionKey(i), null);
  nextInsertError = { code: "23505" };
  await run(qc, i);
  assert.equal(qc.getQueryData(["feed-posts", "ranked", "u1", 0])[0].like_count, 5);
  assert.deepEqual(qc.getQueryData(om.myReactionKey(i)), { id: "confirmed" });
});

await test("only allow-listed idempotent mutations are persisted", () => {
  const fake = (key, paused = true) => ({ options: { mutationKey: key }, state: { status: "pending", isPaused: paused } });
  assert.equal(qp.shouldPersistMutation(fake(["bookmark"])), true);
  assert.equal(qp.shouldPersistMutation(fake(["send-message"])), false);
  assert.equal(qp.shouldPersistMutation(fake(["reaction"], false)), false);
});

console.log(`\n${passed} passed`);
process.exit(0); // mutation gcTime timers (24 h) would otherwise keep node alive
