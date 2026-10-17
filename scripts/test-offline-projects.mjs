// scripts/test-offline-projects.mjs — run: node scripts/test-offline-projects.mjs
// Verifies the pure half of "Download to library": which projects get the option, how the server's refusal codes map to
// messages, the size / free-space / mobile-data rules, safe local file names, version staleness and how a saved project opens.
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

const o = load("lib/offlineProjects");
const MB = 1024 * 1024;

// ── eligibility: what gets the menu item ──
const media = (over = {}) => ({ has_audio: false, has_video: false, has_image: false, audio_file_path: null, video_file_path: null, image_file_path: null, ...over });
assert.equal(o.isOfflineEligible({ projectType: "course" }), true, "courses are offered");
assert.equal(o.isOfflineEligible({ projectType: "file", filePath: "a/b.pdf" }), true, "hosted file");
assert.equal(o.isOfflineEligible({ projectType: "file", filePath: null }), false, "file with nothing hosted");
const bk = (content_source, allow_download, allow_read_in_app) => ({ projectType: "book", book: { content_source, allow_download, allow_read_in_app } });
assert.equal(o.isOfflineEligible(bk("authored", false, true)), true, "authored book: allow_download is an upload-only switch");
assert.equal(o.isOfflineEligible(bk("upload", true, false)), true, "uploaded book, download only: saved as the PDF");
assert.equal(o.isOfflineEligible(bk("upload", false, true)), true, "uploaded book, read-in-app only: saved as its chapters");
assert.equal(o.isOfflineEligible(bk("upload", true, true)), true, "uploaded book, both");
assert.equal(o.isOfflineEligible(bk("upload", false, false)), false, "uploaded book, host switched both off");
assert.equal(o.isOfflineEligible(bk("link", true, true)), false, "link book is someone else's site");
assert.equal(o.isOfflineEligible({ projectType: "book", book: null }), false, "book details not loaded yet → don't guess");
assert.equal(o.isOfflineEligible({ projectType: "media", media: media({ has_audio: true, audio_file_path: "p/a.mp3" }) }), true, "hosted audio");
assert.equal(o.isOfflineEligible({ projectType: "media", media: media({ has_audio: true }) }), false, "external audio link only");
assert.equal(o.isOfflineEligible({ projectType: "media", media: media({ has_video: true, video_file_path: null, has_audio: true, audio_file_path: "x" }) }), true, "any hosted part is enough");
assert.equal(o.isOfflineEligible({ projectType: "media", media: media({ has_audio: false, audio_file_path: "stale" }) }), false, "path ignored when the part is switched off");
for (const t of ["url", "event", "meeting", "room", "gig", "pitch", "nonsense"]) assert.equal(o.isOfflineEligible({ projectType: t, filePath: "x" }), false, `${t} is never offered`);
assert.equal(o.isOfflineType("course"), true);
assert.equal(o.isOfflineType("url"), false);
assert.equal(o.isOfflineType(null), false);

// ── server codes → typed errors ──
for (const code of ["sign_in_required", "access_denied", "download_not_allowed", "not_downloadable", "nothing_to_download"]) {
  assert.equal(o.offlineErrorFromServer(code).code, code, `${code} passes through`);
}
assert.equal(o.offlineErrorFromServer("access_denied ").code, "access_denied", "whitespace tolerated");
assert.equal(o.offlineErrorFromServer("relation \"x\" does not exist").code, "failed", "unknown server text never leaks");
assert.equal(o.offlineErrorFromServer(null).code, "failed");
assert.equal(o.offlineErrorFromServer("download_not_allowed").message, "The creator hasn't allowed downloads for this one.");
assert.equal(o.offlineErrorMessage(new o.OfflineError("no_space")), "Not enough free space on this device.");
assert.equal(o.offlineErrorMessage(new Error("ECONNRESET at 10.0.0.1")), "Couldn't finish the download. Try again.", "raw errors are never shown");
assert.equal(new o.OfflineError("needs_confirmation", 40 * MB).bytes, 40 * MB, "bytes ride along for the confirm prompt");
assert.ok(new o.OfflineError("failed") instanceof Error);

// ── sizes ──
assert.equal(o.formatBytes(0), "0 KB");
assert.equal(o.formatBytes(-5), "0 KB");
assert.equal(o.formatBytes(NaN), "0 KB");
assert.equal(o.formatBytes(10), "1 KB", "tiny rounds up, never 0");
assert.equal(o.formatBytes(119163), "116 KB", "a real 17-chapter book");
assert.equal(o.formatBytes(1.5 * MB), "1.5 MB");
assert.equal(o.formatBytes(48 * MB), "48 MB");
assert.equal(o.formatBytes(2 * 1024 * MB), "2.0 GB");
assert.equal(o.bundleBytes({ content_bytes: 100, files: [{ bytes: 50 }, { bytes: 25 }] }), 175, "text + files");
assert.equal(o.bundleBytes({ content_bytes: -1, files: [{ bytes: NaN }] }), 0, "bad numbers can't make a negative total");

// ── free space ──
assert.equal(o.hasRoomFor(10 * MB, 500 * MB), true);
assert.equal(o.hasRoomFor(10 * MB, 55 * MB), false, "would leave under the 50 MB headroom");
assert.equal(o.hasRoomFor(10 * MB, 60 * MB), true, "exactly the headroom is fine");
assert.equal(o.hasRoomFor(10 * MB, null), true, "unknown free space doesn't block");
assert.equal(o.hasRoomFor(10 * MB, Infinity), true);

// ── mobile data ──
assert.equal(o.needsCellularConfirm(40 * MB, "cellular"), true);
assert.equal(o.needsCellularConfirm(25 * MB, "cellular"), false, "at the threshold: no prompt");
assert.equal(o.needsCellularConfirm(5 * MB, "cellular"), false, "small is fine on data");
assert.equal(o.needsCellularConfirm(900 * MB, "wifi"), false, "wifi never prompts");
assert.equal(o.needsCellularConfirm(900 * MB, undefined), false, "unknown connection never prompts");

// ── progress ──
assert.equal(o.overallProgress(0, 0), 0, "no total yet");
assert.equal(o.overallProgress(50, 100), 0.5);
assert.equal(o.overallProgress(100, 100), 0.99, "full bar is reserved for 'saved'");
assert.equal(o.overallProgress(500, 100), 0.99, "overshoot clamps");
assert.equal(o.overallProgress(-5, 100), 0);

// ── file names ──
assert.equal(o.safeFileName("report.pdf"), "report.pdf");
assert.equal(o.safeFileName("a/b/c.pdf"), "c.pdf", "path stripped");
assert.equal(o.safeFileName("..\\..\\evil.sh"), "evil.sh", "windows traversal stripped");
assert.equal(o.safeFileName("../../etc/passwd"), "passwd");
assert.equal(o.safeFileName("..."), "file", "nothing left → fallback");
assert.equal(o.safeFileName(".hidden"), "hidden", "leading dots dropped");
assert.equal(o.safeFileName("my song (v2)?.mp3"), "my song _v2_.mp3", "odd characters replaced");
assert.equal(o.safeFileName(""), "file");
assert.equal(o.safeFileName("x".repeat(500)).length, 120, "length capped");
assert.equal(o.safeFileName("", "audio"), "audio", "custom fallback");

// ── staleness ──
assert.equal(o.isStaleVersion("a", "b"), true);
assert.equal(o.isStaleVersion("a", "a"), false);
assert.equal(o.isStaleVersion(null, "b"), false, "unknown local → can't say");
assert.equal(o.isStaleVersion("a", null), false, "unknown remote (no access / offline) → can't say");
assert.equal(o.isStaleVersion("", "b"), false);

// ── library tab + open mode ──
assert.equal(o.libraryTabForType("book"), "books");
assert.equal(o.libraryTabForType("course"), "courses");
assert.equal(o.libraryTabForType("media"), "media");
assert.equal(o.libraryTabForType("file"), "files");
assert.equal(o.libraryTabForType("whatever"), "books");
assert.equal(o.openModeFor({ hasFiles: true }), "viewer");
assert.equal(o.openModeFor({ hasFiles: false }), "reader");

// ── library merge ──
const remoteItem = (id, at, over = {}) => ({ projectId: id, projectType: "book", title: id, thumbnailUrl: null, status: "active", acquiredVia: "free", acquiredAt: at, ...over });
const saved = (id, at, over = {}) => ({ projectId: id, projectType: "book", title: id, thumbnailUrl: "t.png", acquiredVia: "free", downloadedAt: at, ...over });
let m = o.mergeLibraryWithDownloads([remoteItem("a", "2026-01-01T00:00:00Z")], [saved("b", Date.parse("2026-02-01T00:00:00Z"))]);
assert.deepEqual(m.map((i) => i.projectId), ["b", "a"], "device-only copy is added; newest first");
assert.equal(m[0].thumbnailUrl, "t.png");
m = o.mergeLibraryWithDownloads([remoteItem("a", "2026-01-01T00:00:00Z", { status: "archived", acquiredVia: "purchased" })], [saved("a", Date.parse("2026-09-01T00:00:00Z"))]);
assert.equal(m.length, 1, "no duplicate when both know the project");
assert.equal(m[0].status, "archived", "the server's record wins (real status)");
assert.equal(m[0].acquiredAt, "2026-01-01T00:00:00Z", "and its real acquisition date");
m = o.mergeLibraryWithDownloads(undefined, [saved("x", 1000, { acquiredVia: "purchased" }), saved("y", 2000, { acquiredVia: "owner" })]);
assert.deepEqual(m.map((i) => [i.projectId, i.acquiredVia]), [["y", "free"], ["x", "purchased"]], "offline with no server list: downloads alone; 'owner' reads as free");
assert.deepEqual(o.mergeLibraryWithDownloads(undefined, undefined), [], "nothing at all → empty, not a crash");
assert.equal(o.mergeLibraryWithDownloads([remoteItem("a", "2026-01-01T00:00:00Z")], undefined).length, 1, "no saved copies → the server list untouched");

// ── where a saved text project opens ──
assert.equal(o.offlineReaderRoute("book", "p1", "authored"), "/books/p1");
assert.equal(o.offlineReaderRoute("book", "p1", "upload"), "/projects/p1/read", "uploaded PDF chapters use the same route as the Read button");
assert.equal(o.offlineReaderRoute("book", "p1", null), "/books/p1", "unknown source → the authored reader");
assert.equal(o.offlineReaderRoute("course", "p2", undefined), "/courses/p2");

console.log("offline-projects: all assertions passed");
