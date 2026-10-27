// scripts/test-slug-nav.mjs — run: node scripts/test-slug-nav.mjs
// A project opened at its pretty address (/my-file) must get the same bottom nav as /projects/:id, without any of the
// app's own single-segment screens (settings, compose, login…) ever being mistaken for a slug. Transpiles TS in memory.
import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";
import assert from "node:assert/strict";

function load(path, req = () => ({})) {
  const js = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: "commonjs" } }).outputText;
  const m = { exports: {} };
  new Function("module", "exports", "require", js)(m, m.exports, req);
  return m.exports;
}

const links = load("src/lib/projectLinks.ts", () => ({ APP_URL: "https://myako.site" }));
const routes = load("src/components/nav/routes.ts", (id) => {
  if (id === "@/lib/projectLinks") return links;
  throw new Error(`unexpected import ${id}`);
});
const nav = routes.showsBottomNav;

// Slugs: nav on, in any letter case (the slug screen resolves case-insensitively).
for (const p of ["/my-file", "/calling", "/abc", "/Q3-report-2026", "/My-File"]) assert.equal(nav(p), true, p);

// Not slugs: too short / malformed / reserved words — and the existing explicit routes are untouched.
for (const p of ["/ab", "/-bad", "/bad-", "/bad--slug", "/has_underscore", "/", "/settings", "/compose", "/create", "/login", "/signup"]) {
  assert.equal(nav(p), false, p);
}
for (const p of ["/feed", "/projects/abc123", "/profile/someone", "/library", "/connect", "/me"]) assert.equal(nav(p), true, p);
assert.equal(nav("/projects/new"), false);
assert.equal(nav("/messages/abc"), false);
assert.equal(nav("/my-file/extra"), false); // only the single-segment address is the project page

// Guard against future drift: every real single-segment screen that did NOT show the nav before must still not.
const SHOWN_BEFORE = new Set(["feed", "topics", "search", "notifications", "requests", "bookmarks", "wallet", "talents", "library", "me", "connect", "inbox", "messages", "page-inbox", "activity"]);
for (const entry of readdirSync("src/app/(app)")) {
  const name = entry.replace(/\.tsx$/, "");
  if (name.startsWith("[") || name.startsWith("_") || SHOWN_BEFORE.has(name)) continue;
  assert.equal(nav(`/${name}`), false, `/${name} is an app screen, not a project slug — it must not gain the nav`);
}

console.log("slug nav: all checks passed");
