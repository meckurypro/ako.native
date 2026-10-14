// scripts/test-image-cache.mjs — run: node scripts/test-image-cache.mjs
// Verifies the offline-media pure logic: stable cache keys, store file names, URL harvesting, and the persister's
// feed-page-0 rule + graceful degrade when a snapshot is over budget (queued offline writes must survive it).
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const ts = require(path.join(root, "node_modules/typescript"));

function load(rel, mocks = {}) {
  const src = readFileSync(path.join(root, "src", rel + ".ts"), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: "commonjs", target: "es2022" } }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", "require", js)(mod, mod.exports, (id) => (id in mocks ? mocks[id] : require(id)));
  return mod.exports;
}

const k = load("lib/imageKey");

// ── stable keys ──
const base = "https://x.supabase.co/storage/v1/object/sign/chat-media/u1/a.jpg";
assert.equal(k.stableImageKey(`${base}?token=AAA`), base, "token stripped");
assert.equal(k.stableImageKey(`${base}?token=BBB`), k.stableImageKey(`${base}?token=AAA`), "different tokens → same key");
assert.equal(k.stableImageKey(`${base}?token=A&download=x.jpg`), base, "download param stripped");
const pub = "https://x.supabase.co/storage/v1/object/public/avatars/u1/avatar-1.png";
assert.equal(k.stableImageKey(pub), pub, "public URL unchanged");
assert.equal(k.stableImageKey(`${pub}?v=2&w=100`), k.stableImageKey(`${pub}?w=100&v=2`), "param order irrelevant");
assert.notEqual(k.stableImageKey(`${pub}?v=2`), k.stableImageKey(`${pub}?v=3`), "meaningful params kept");
assert.equal(k.stableImageKey(`${pub}#frag`), pub, "fragment dropped");

// ── store file names ──
assert.equal(k.storeFileName(`${base}?token=AAA`), k.storeFileName(`${base}?token=ZZZ`), "file name survives token refresh");
assert.match(k.storeFileName(pub), /^[0-9a-f]{16}\.png$/);
assert.match(k.storeFileName("https://x.co/a.JPEG?x=1"), /\.jpg$/);
assert.match(k.storeFileName("https://x.co/noext"), /\.img$/);
assert.notEqual(k.storeFileName("https://x.co/a.png"), k.storeFileName("https://x.co/b.png"));

// ── url detection ──
assert.ok(k.isRemoteUrl("https://a.b/c.png") && k.isRemoteUrl("http://a.b"));
assert.ok(!k.isRemoteUrl("file:///a.png") && !k.isRemoteUrl(12) && !k.isRemoteUrl(null));
assert.ok(k.isVideoUrl("https://a.b/c.MP4?x=1") && !k.isVideoUrl("https://a.b/c.png"));

// ── harvesting ──
const feed = [
  { id: 1, author: { avatar_url: "https://a/av1.png", display_name: "x" }, media_urls: ["https://a/p1.jpg", "https://a/v.mp4"], body: "https://a/not-an-image-field.png" },
  { id: 2, author: { avatar_url: null }, page: { avatar_url: "https://a/pg.png" }, project: { thumbnail_url: "https://a/t.webp" } },
];
assert.deepEqual(k.collectImageUrls(feed).sort(), ["https://a/av1.png", "https://a/p1.jpg", "https://a/pg.png", "https://a/t.webp"].sort(), "image fields only, videos skipped");
assert.equal(k.collectImageUrls({ media_urls: Array.from({ length: 200 }, (_, i) => `https://a/${i}.png`) }, 10).length, 10, "limit honoured");
const cyc = { avatar_url: "https://a/c.png" }; cyc.self = cyc;
assert.deepEqual(k.collectImageUrls(cyc), ["https://a/c.png"], "cycles safe");

// ── persister rules ──
const writes = [];
const qp = load("lib/queryPersister", {
  "./offlineMutations": { OFFLINE_MUTATION_ROOTS: new Set(["reaction"]) },
  "./secureDb": { secureKvSet: async (ns, key, v) => { writes.push(v); }, secureKvGet: async () => null, secureKvDelete: async () => {} },
});
const q = (key, status = "success") => ({ queryKey: key, state: { status } });
assert.ok(qp.shouldPersistQuery(q(["feed-posts", "ranked", "u1", 0])), "feed page 0 persisted");
assert.ok(qp.shouldPersistQuery(q(["feed-posts", "topic", "i1", 0])), "topic feed page 0 persisted");
assert.ok(!qp.shouldPersistQuery(q(["feed-posts", "ranked", "u1", 1])), "feed page 1 NOT persisted");
assert.ok(!qp.shouldPersistQuery(q(["feed-posts", "ranked", "u1", 0], "pending")), "unsuccessful not persisted");
assert.ok(qp.shouldPersistQuery(q(["conversations", "u1"])) && qp.shouldPersistQuery(q(["own-profile", "u1"])));
assert.ok(!qp.shouldPersistQuery(q(["wallet", "u1"])) && !qp.shouldPersistQuery(q(["messages", "t1"])), "wallet / messages never persisted");
assert.ok(qp.PERSISTED_GC_MS >= 7 * 24 * 60 * 60 * 1000, "gc outlives the 7-day restore window");

// over-budget snapshot sheds bulky lists but KEEPS small queries and queued mutations
const persister = qp.createSqlitePersister("u1");
const big = "x".repeat(5 * 1024 * 1024);
persister.persistClient({
  timestamp: 1, buster: "b",
  clientState: {
    mutations: [{ mutationKey: ["reaction"], state: { isPaused: true } }],
    queries: [{ queryKey: ["feed-posts", "ranked", "u1", 0], state: { data: big } }, { queryKey: ["conversations", "u1"], state: { data: [1] } }],
  },
});
await persister.flush();
assert.equal(writes.length, 1, "write still happens when over budget");
const saved = JSON.parse(writes[0]);
assert.deepEqual(saved.clientState.queries.map((x) => x.queryKey[0]), ["conversations"], "bulky feed dropped, conversations kept");
assert.equal(saved.clientState.mutations.length, 1, "queued offline write survives");

console.log("image-cache: all assertions passed");
