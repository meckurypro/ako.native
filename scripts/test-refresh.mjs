// scripts/test-refresh.mjs — run: node scripts/test-refresh.mjs
// Verifies the pull-to-refresh logic (src/lib/refresh.ts) against a REAL @tanstack/query-core QueryClient:
// connectivity gating, spinner cap, queued-write guard, paged-feed refresh from deep pages, and page merging.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const ts = require(path.join(root, "node_modules/typescript"));
const { QueryClient, QueryObserver } = require(path.join(root, "node_modules/@tanstack/query-core"));

function load(rel) {
  const src = readFileSync(path.join(root, "src", rel + ".ts"), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: "commonjs", target: "es2022" } }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", "require", js)(mod, mod.exports, require);
  return mod.exports;
}
const r = load("lib/refresh");
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
let n = 0;
const ok = (name) => console.log(`  ✓ ${name}`) || n++;

// ── connectivity gate ──
console.log("connectivity");
assert.equal(await r.isOnlineForRefresh(async () => ({ isConnected: true, isInternetReachable: true })), true);
assert.equal(await r.isOnlineForRefresh(async () => ({ isConnected: true, isInternetReachable: false })), true, "a failed reachability probe must NOT veto an explicit pull");
assert.equal(await r.isOnlineForRefresh(async () => ({ isConnected: true, isInternetReachable: null })), true);
assert.equal(await r.isOnlineForRefresh(async () => ({ isConnected: false, isInternetReachable: false })), false, "definitely not connected → offline");
assert.equal(await r.isOnlineForRefresh(async () => { throw new Error("probe failed"); }), true, "probe error → let the request decide");
ok("only a definite 'not connected' counts as offline");
{
  const t0 = Date.now();
  const hung = await r.isOnlineForRefresh(() => new Promise(() => {}));
  const dt = Date.now() - t0;
  assert.equal(hung, true);
  assert.ok(dt >= r.PROBE_TIMEOUT_MS - 50 && dt < r.PROBE_TIMEOUT_MS + 800, `probe is time-boxed (${dt}ms)`);
  ok(`a hung probe is abandoned after ${r.PROBE_TIMEOUT_MS}ms`);
}

// ── runRefresh ──
console.log("runRefresh");
const mkDeps = (qc, net = { isConnected: true, isInternetReachable: true }) => {
  const calls = { online: [] };
  return { calls, deps: { queryClient: qc, setOnline: (v) => calls.online.push(v), probe: async () => net } };
};
{
  const qc = new QueryClient();
  const { calls, deps } = mkDeps(qc, { isConnected: false, isInternetReachable: false });
  let ran = 0;
  const out = await r.runRefresh([() => ran++], { refetchActive: true }, deps);
  assert.equal(out, "offline"); assert.equal(ran, 0); assert.deepEqual(calls.online, [false]);
  ok("offline: nothing runs, onlineManager told the truth");
}
{
  const qc = new QueryClient();
  const { calls, deps } = mkDeps(qc, { isConnected: true, isInternetReachable: false });
  let fetched = 0;
  const observer = new QueryObserver(qc, { queryKey: ["a"], queryFn: async () => ++fetched, staleTime: Infinity });
  const unsubscribe = observer.subscribe(() => {}); // a mounted component: makes the query "active"
  await sleep(30);
  fetched = 0;
  let ran = 0;
  const out = await r.runRefresh([() => ran++, async () => { throw new Error("one failing query"); }], { refetchActive: true }, deps);
  assert.equal(out, "refreshed", "a failing refetch never leaves the spinner stuck");
  assert.equal(ran, 1); assert.equal(fetched, 1, "active queries were refetched too");
  assert.deepEqual(calls.online, [true], "isConnected && unreachable-probe → still told online");
  ok("online: caller refetches + all active queries run; failures are swallowed; stale offline flag is cleared");

  fetched = 0;
  await r.runRefresh([() => ran++], { refetchActive: false }, deps);
  assert.equal(fetched, 0, "refetchActive:false leaves other queries alone (one pull = one request for a feed)");
  ok("refetchActive:false skips the blanket refetch");
  unsubscribe();
}
{
  const qc = new QueryClient();
  const { deps } = mkDeps(qc);
  let fetched = 0;
  const observer = new QueryObserver(qc, { queryKey: ["a"], queryFn: async () => ++fetched, staleTime: Infinity });
  const unsubscribe = observer.subscribe(() => {});
  await sleep(30);
  qc.getMutationCache().build(qc, { mutationFn: () => new Promise(() => {}) }).execute(undefined).catch(() => {}); // a write in flight
  fetched = 0;
  await r.runRefresh([], { refetchActive: true }, deps);
  assert.equal(fetched, 0, "no blanket refetch while a write is queued/in flight (would clobber the optimistic value)");
  ok("queued writes block the blanket refetch");
  unsubscribe();
}
{
  const qc = new QueryClient();
  const { deps } = mkDeps(qc);
  const t0 = Date.now();
  const out = await r.runRefresh([() => new Promise(() => {})], { refetchActive: false, capMs: 80 }, deps);
  assert.equal(out, "timeout"); assert.ok(Date.now() - t0 < 500);
  ok("a refetch that never settles can't hang the spinner (cap)");
}

// ── paged feed refresh ──
console.log("refreshFeedPages");
const key = (kind, page) => ["feed-posts", kind, "u1", page];
async function seedFeed() {
  const qc = new QueryClient();
  const hits = {};
  for (const [kind, page] of [["ranked", 0], ["ranked", 1], ["ranked", 2], ["following", 0], ["following", 1]]) {
    const k = key(kind, page).join("/");
    hits[k] = 0;
    await qc.fetchQuery({ queryKey: key(kind, page), queryFn: async () => { hits[k]++; await sleep(15); return [{ id: `${kind}-${page}` }]; }, staleTime: Infinity });
    hits[k] = 0; // count only what the refresh does
  }
  return { qc, hits };
}
{
  const { qc, hits } = await seedFeed();
  let setPageCalls = [], refetched = 0, extra = 0;
  await r.refreshFeedPages({ queryClient: qc, prefix: ["feed-posts", "ranked", "u1"], page: 0, setPage: (p) => setPageCalls.push(p), refetch: async () => { refetched++; }, extra: [() => { extra++; }] });
  assert.equal(refetched, 1); assert.equal(extra, 1); assert.deepEqual(setPageCalls, []);
  ok("at the top: just refetch (+ extras like the pinned post)");
}
{
  const { qc, hits } = await seedFeed();
  const setPageCalls = [];
  let bareRefetch = 0;
  await r.refreshFeedPages({ queryClient: qc, prefix: ["feed-posts", "ranked", "u1"], page: 2, setPage: (p) => setPageCalls.push(p), refetch: async () => { bareRefetch++; } });
  assert.deepEqual(setPageCalls, [0], "jumps back to page 0");
  assert.equal(bareRefetch, 0, "the bare refetch would only have refreshed page 2");
  assert.equal(hits["feed-posts/ranked/u1/0"], 1, "page 0 was actually re-fetched, and awaited before refreshFeedPages resolved");
  assert.equal(hits["feed-posts/ranked/u1/1"], 0); assert.equal(hits["feed-posts/ranked/u1/2"], 0);
  const stale = (k) => qc.getQueryCache().find({ queryKey: k }).isStale();
  assert.ok(stale(key("ranked", 1)) && stale(key("ranked", 2)), "this tab's deeper pages are marked stale (refetched when scrolled to)");
  assert.ok(!stale(key("following", 1)), "another tab's pages are left alone");
  assert.equal(hits["feed-posts/following/u1/0"], 0, "other tabs aren't refetched");
  ok("from deep in the feed: fresh page 0 is awaited, deeper pages marked stale, other tabs untouched");
}

// ── merging pages ──
console.log("mergePages");
{
  const p0 = [{ id: "a" }, { id: "b" }], p1 = [{ id: "c" }, { id: "d" }];
  assert.deepEqual(r.mergePages({ 1: p1, 0: p0 }).map((x) => x.id), ["a", "b", "c", "d"], "ordered by page index");
  // The old reducer appended every refetch of page 1: [...prev, ...pageData]. Replacing its slot can't duplicate.
  const refetched1 = [{ id: "c" }, { id: "d" }];
  assert.deepEqual(r.mergePages({ 0: p0, 1: refetched1 }).map((x) => x.id), ["a", "b", "c", "d"], "refetching a page replaces it in place");
  assert.deepEqual(r.mergePages({ 0: [{ id: "a" }, { id: "b" }], 1: [{ id: "b" }, { id: "c" }] }).map((x) => x.id), ["a", "b", "c"], "ranking shift can't repeat a post (unique list keys)");
  assert.deepEqual(r.mergePages({}), []);
  ok("ordered, replace-not-append, de-duplicated");
}

console.log(`\n${n} groups passed`);
