// scripts/test-course-logic.mjs
// Unit tests for the pure course helpers in src/lib/courseTypes.ts. No test framework: transpiles the TS with the
// project's own `typescript` and asserts. Run: node scripts/test-course-logic.mjs
// KEEP IDENTICAL in ako (web) and ako.native — the helper file is shared.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const ts = require("typescript");

const src = readFileSync(new URL("../src/lib/courseTypes.ts", import.meta.url), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: "commonjs", target: "es2020" } }).outputText;
const mod = { exports: {} };
new Function("module", "exports", "require", js)(mod, mod.exports, require);
const { nextSortOrder, moveItem, orderWrites, safeHttpUrl, resolveEmbed, videoLinkProblem, countCourseLessons, coursePublishChecks } = mod.exports;

let passed = 0;
const t = (name, fn) => {
  try { fn(); passed++; console.log("  ok  " + name); }
  catch (e) { console.error("FAIL  " + name + "\n      " + e.message); process.exitCode = 1; }
};

console.log("ordering");
t("nextSortOrder: empty list starts at 0", () => assert.equal(nextSortOrder([]), 0));
t("nextSortOrder: continues after the highest", () => assert.equal(nextSortOrder([{ sort_order: 0 }, { sort_order: 1 }, { sort_order: 2 }]), 3));
t("nextSortOrder: after deleting a middle row it does NOT collide (old code used the length, 2)", () => {
  const rows = [{ sort_order: 0 }, { sort_order: 2 }]; // the row at 1 was deleted
  const next = nextSortOrder(rows);
  assert.equal(next, 3);
  assert.ok(!rows.some((r) => r.sort_order === next));
});
t("nextSortOrder: handles duplicates and gaps", () => assert.equal(nextSortOrder([{ sort_order: 5 }, { sort_order: 5 }, { sort_order: 1 }]), 6));
t("moveItem: moves down/up and leaves the input alone", () => {
  const a = ["a", "b", "c"];
  assert.deepEqual(moveItem(a, 0, 1), ["b", "a", "c"]);
  assert.deepEqual(moveItem(a, 2, 1), ["a", "c", "b"]);
  assert.deepEqual(a, ["a", "b", "c"]);
});
t("moveItem: out of range is a no-op", () => {
  assert.deepEqual(moveItem(["a", "b"], 0, -1), ["a", "b"]);
  assert.deepEqual(moveItem(["a", "b"], 1, 2), ["a", "b"]);
  assert.deepEqual(moveItem(["a", "b"], 1, 1), ["a", "b"]);
});
const apply = (rows, writes) => rows.map((r) => ({ ...r, sort_order: writes.find((w) => w.id === r.id)?.sort_order ?? r.sort_order }));
const stored = (rows) => rows.slice().sort((x, y) => x.sort_order - y.sort_order).map((r) => r.id);
t("orderWrites: nothing to write when positions already match", () => assert.deepEqual(orderWrites([{ id: "a", sort_order: 0 }, { id: "b", sort_order: 1 }]), []));
t("reorder with DUPLICATE positions actually changes the stored order (the old swap wrote 0↔0 and did nothing)", () => {
  const rows = [{ id: "a", sort_order: 0 }, { id: "b", sort_order: 0 }, { id: "c", sort_order: 1 }];
  const moved = moveItem(rows, 1, 0); // b up
  const after = apply(rows, orderWrites(moved));
  assert.deepEqual(stored(after), ["b", "a", "c"]);
  assert.equal(new Set(after.map((r) => r.sort_order)).size, 3, "positions are unique afterwards");
});
t("reorder with GAPPY positions that don't start at 0", () => {
  const rows = [{ id: "a", sort_order: 3 }, { id: "b", sort_order: 4 }, { id: "c", sort_order: 5 }];
  const after = apply(rows, orderWrites(moveItem(rows, 2, 1)));
  assert.deepEqual(stored(after), ["a", "c", "b"]);
});
t("every row ends up at its index", () => {
  const rows = [{ id: "a", sort_order: 9 }, { id: "b", sort_order: 2 }, { id: "c", sort_order: 2 }, { id: "d", sort_order: 7 }];
  const after = apply(rows, orderWrites(rows));
  assert.deepEqual(after.map((r) => r.sort_order), [0, 1, 2, 3]);
});

console.log("links");
t("safeHttpUrl accepts http(s) and trims", () => {
  assert.equal(safeHttpUrl("https://example.com/a?b=1#c"), "https://example.com/a?b=1#c");
  assert.equal(safeHttpUrl("  http://localhost:3000/x  "), "http://localhost:3000/x");
  assert.equal(safeHttpUrl("HTTPS://EXAMPLE.COM"), "HTTPS://EXAMPLE.COM");
});
t("safeHttpUrl rejects script and other schemes", () => {
  for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", " javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:x", "intent://x#Intent;end", "tel:+2348000000000", "ftp://example.com/x", "file:///etc/passwd", "//evil.com", "example.com", "https://", "https:// space.com", "https://a.com/ b", "", "   ", null, undefined]) {
    assert.equal(safeHttpUrl(bad), null, JSON.stringify(bad));
  }
});
t("videoLinkProblem: empty is fine, invalid is explained, valid is fine", () => {
  assert.equal(videoLinkProblem(""), null);
  assert.equal(videoLinkProblem("https://youtu.be/dQw4w9WgXcQ"), null);
  assert.match(videoLinkProblem("javascript:alert(1)"), /http/);
});
t("resolveEmbed: YouTube forms", () => {
  for (const u of ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://youtube.com/watch?v=dQw4w9WgXcQ", "https://m.youtube.com/watch?v=dQw4w9WgXcQ", "https://www.youtube.com/watch?feature=share&v=dQw4w9WgXcQ", "https://youtu.be/dQw4w9WgXcQ", "https://www.youtube.com/embed/dQw4w9WgXcQ", "https://www.youtube.com/shorts/dQw4w9WgXcQ", "https://www.youtube.com/live/dQw4w9WgXcQ"]) {
    assert.deepEqual(resolveEmbed(u), { type: "youtube", embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ" }, u);
  }
});
t("resolveEmbed: Vimeo forms", () => {
  assert.deepEqual(resolveEmbed("https://vimeo.com/123456789"), { type: "vimeo", embedUrl: "https://player.vimeo.com/video/123456789" });
  assert.deepEqual(resolveEmbed("https://player.vimeo.com/video/123456789"), { type: "vimeo", embedUrl: "https://player.vimeo.com/video/123456789" });
});
t("resolveEmbed: a host merely mentioned in the query/path is NOT treated as YouTube/Vimeo", () => {
  assert.equal(resolveEmbed("https://evil.example/?u=youtu.be/dQw4w9WgXcQ").type, "link");
  assert.equal(resolveEmbed("https://evil.example/youtube.com/watch?v=dQw4w9WgXcQ").type, "link");
  assert.equal(resolveEmbed("https://evil.example/vimeo.com/123456").type, "link");
});
t("resolveEmbed: direct video files, links and nothing", () => {
  assert.deepEqual(resolveEmbed("https://cdn.example.com/a.mp4"), { type: "video", url: "https://cdn.example.com/a.mp4" });
  assert.equal(resolveEmbed("https://cdn.example.com/a.M4V?x=1").type, "video");
  assert.deepEqual(resolveEmbed("https://example.com/watch-this"), { type: "link", url: "https://example.com/watch-this" });
  for (const bad of ["javascript:alert(1)", "data:text/html,x", "", null, undefined]) assert.equal(resolveEmbed(bad).type, "none", String(bad));
});

console.log("publish checklist");
t("countCourseLessons leaves out the Foreword section", () => {
  const modules = [
    { is_foreword_managed: true, lessons: [{}, {}] },
    { is_foreword_managed: false, lessons: [{}] },
    { lessons: [{}, {}, {}] },
  ];
  assert.equal(countCourseLessons(modules), 4);
  assert.equal(countCourseLessons([{ is_foreword_managed: true, lessons: [{}] }]), 0);
  assert.equal(countCourseLessons([]), 0);
});
t("a course with only a foreword lesson is NOT ready to publish", () => {
  const c = coursePublishChecks({ objectives: ["a", "b", "c"], lessons: countCourseLessons([{ is_foreword_managed: true, lessons: [{}] }]), description: "x" });
  assert.equal(c.lessonsOk, false);
  assert.equal(c.ready, false);
});
t("objectives must be 3 non-blank lines; description must not be blank", () => {
  assert.equal(coursePublishChecks({ objectives: ["a", "b", " "], lessons: 1, description: "x" }).objectivesOk, false);
  assert.equal(coursePublishChecks({ objectives: ["a", "b", "c"], lessons: 1, description: "   " }).descriptionOk, false);
  assert.equal(coursePublishChecks({ objectives: null, lessons: 1, description: "x" }).objectivesOk, false);
  assert.equal(coursePublishChecks({ objectives: ["a", "b", "c"], lessons: 2, description: "Learn it" }).ready, true);
});

console.log(`\n${passed} passed${process.exitCode ? ", SOME FAILED" : ""}`);
