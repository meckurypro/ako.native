// scripts/test-chat-list-time.mjs — run: node scripts/test-chat-list-time.mjs
// The Chats list stamp: time of day today → Yesterday → 2d ago … 7d ago → Last week → the date.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const ts = require(path.join(root, "node_modules/typescript"));
const src = readFileSync(path.join(root, "src/lib/messageTime.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: "commonjs", target: "es2022" } }).outputText;
const mod = { exports: {} };
new Function("module", "exports", js)(mod, mod.exports);
const { formatChatListTime } = mod.exports;

// Local-time constructors, so the test is timezone-independent.
const at = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min).toISOString();
const NOW = new Date(2026, 9, 30, 0, 41); // Fri 30 Oct 2026, 00:41 local
const f = (iso, locale = "en-GB") => formatChatListTime(iso, NOW, locale);

// ── today: time of day, however early or late ──
assert.equal(f(at(2026, 10, 30, 0, 5)), "00:05");
assert.equal(f(at(2026, 10, 30, 0, 40)), "00:40");
assert.match(formatChatListTime(at(2026, 10, 30, 0, 5), NOW, "en-US"), /^12:05\s?AM$/);

// ── calendar days, not 24-hour blocks: 23:50 last night is Yesterday even 51 minutes later ──
assert.equal(f(at(2026, 10, 29, 23, 50)), "Yesterday");
assert.equal(f(at(2026, 10, 29, 0, 1)), "Yesterday");
// …and 25 hours ago on the same calendar day is still today
assert.equal(f(at(2026, 10, 30, 0, 0)), "00:00");

// ── 2–7 days ──
assert.equal(f(at(2026, 10, 28)), "2d ago");
assert.equal(f(at(2026, 10, 27)), "3d ago");
assert.equal(f(at(2026, 10, 24)), "6d ago");
assert.equal(f(at(2026, 10, 23)), "7d ago");

// ── 8–14 days: Last week ──
assert.equal(f(at(2026, 10, 22)), "Last week");
assert.equal(f(at(2026, 10, 16)), "Last week");

// ── then dates ──
assert.equal(f(at(2026, 10, 15)), "15/10/2026");
assert.equal(f(at(2026, 8, 3)), "03/08/2026");
assert.equal(f(at(2025, 12, 31)), "31/12/2025");

// ── daylight-saving boundaries don't shift the day count (23h/25h days) ──
const dstNow = new Date(2026, 2, 30, 12, 0);
assert.equal(formatChatListTime(at(2026, 3, 29, 12), dstNow, "en-GB"), "Yesterday");
assert.equal(formatChatListTime(at(2026, 3, 23, 12), dstNow, "en-GB"), "7d ago");

// ── odd input never throws or prints "Invalid Date" ──
assert.equal(formatChatListTime("not a date", NOW), "");
assert.equal(f(at(2026, 10, 30, 23, 59)), "23:59", "slightly in the future reads as today");

console.log("chat-list-time: all checks passed");
