// scripts/test-post-edit-cache.mjs — run: node scripts/test-post-edit-cache.mjs
// Verifies that an edit is written into every cached copy of a post (feeds, detail, reshare embeds), that rollback
// restores it, and that unrelated data is untouched — against the REAL @tanstack/query-core.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const ts = require(path.join(root, "node_modules/typescript"));
const rq = require(path.join(root, "node_modules/@tanstack/react-query"));

function load(rel) {
  const src = readFileSync(path.join(root, "src", rel + ".ts"), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: "commonjs", target: "es2022" } }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", "require", js)(mod, mod.exports, require);
  return mod.exports;
}
const oc = load("lib/optimisticCache");

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log("  ok -", name); };

const post = (id, extra = {}) => ({ id, heading: "Old heading", heading_color: null, content: "Old text", media_urls: [], like_count: 3, author: { id: "u1", username: "emeka" }, ...extra });
const EDIT = { heading: "New heading", content: "New text" };

test("patchFields updates the matching row and leaves others alone", () => {
  const list = [post("a"), post("b")];
  const out = oc.patchFields(list, "a", EDIT);
  assert.equal(out[0].content, "New text");
  assert.equal(out[0].like_count, 3);       // untouched fields survive
  assert.equal(out[1], list[1]);            // other row: same reference
});

test("patchFields reaches nested reshare embeds and paged data", () => {
  const paged = { pages: [[post("r1", { reshared_post: post("orig") })]], pageParams: [0] };
  const out = oc.patchFields(paged, "orig", EDIT);
  assert.equal(out.pages[0][0].reshared_post.content, "New text");
  assert.equal(out.pages[0][0].content, "Old text"); // the reshare itself isn't the edited post
});

test("patchFields is a no-op (same reference) when nothing changes", () => {
  const list = [post("a", EDIT)];
  assert.equal(oc.patchFields(list, "a", EDIT), list);
  assert.equal(oc.patchFields(list, "zzz", EDIT), list);
});

test("patchFields only touches keys the object already carries", () => {
  const out = oc.patchFields(post("a"), "a", { music_catalogue_id: "m1" });
  assert.equal("music_catalogue_id" in out, false);
});

test("patchFields compares arrays by value (no churn for identical media_urls)", () => {
  const row = post("a", { media_urls: ["x.jpg"] });
  assert.equal(oc.patchFields(row, "a", { media_urls: ["x.jpg"] }), row);
  assert.deepEqual(oc.patchFields(row, "a", { media_urls: ["y.jpg"] }).media_urls, ["y.jpg"]);
});

test("pickFields copies only present, listed keys", () => {
  const picked = oc.pickFields({ id: "a", content: "c", like_count: 9 }, oc.EDITABLE_POST_FIELDS);
  assert.deepEqual(picked, { content: "c" });
});

test("patchFieldsInCaches patches feed + detail, keeps freshness, rolls back", () => {
  const qc = new rq.QueryClient();
  qc.setQueryData(["feed-posts", "ranked", 0], [post("a"), post("b")]);
  qc.setQueryData(["post", "a"], post("a"));
  qc.setQueryData(["post-full", "a"], post("a"));
  qc.setQueryData(["profile", "emeka"], { id: "a", content: "not a post" }); // not a post root
  const before = qc.getQueryState(["feed-posts", "ranked", 0]).dataUpdatedAt;

  const prev = oc.patchFieldsInCaches(qc, oc.POST_QUERY_ROOTS, "a", EDIT);
  assert.equal(prev.length, 3);
  assert.equal(qc.getQueryData(["feed-posts", "ranked", 0])[0].heading, "New heading");
  assert.equal(qc.getQueryData(["post", "a"]).content, "New text");
  assert.equal(qc.getQueryData(["post-full", "a"]).content, "New text");
  assert.equal(qc.getQueryData(["profile", "emeka"]).content, "not a post");
  assert.equal(qc.getQueryState(["feed-posts", "ranked", 0]).dataUpdatedAt, before);

  oc.restorePatched(qc, prev);
  assert.equal(qc.getQueryData(["feed-posts", "ranked", 0])[0].content, "Old text");
  assert.equal(qc.getQueryData(["post", "a"]).heading, "Old heading");
});

console.log(`\n${passed} passed`);
