// scripts/test-push-logic.mjs — run: node scripts/test-push-logic.mjs
// Pure-logic checks for the chat push preview (server) and the tap routing (app). Transpiles the TS in memory.
import { readFileSync } from "node:fs";
import ts from "typescript";
import assert from "node:assert/strict";

function load(path) {
  const js = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: "commonjs" } }).outputText;
  const m = { exports: {} };
  new Function("module", "exports", "require", js)(m, m.exports, () => ({}));
  return m.exports;
}

const { pushPreview, MAX_PREVIEW_CHARS } = load("supabase/functions/send-message-push/preview.ts");
assert.equal(pushPreview("hello there"), "hello there");
assert.equal(pushPreview("  hi\n\n\n\nthere  "), "hi\n\nthere");
assert.equal(pushPreview(""), "Sent you a message");
assert.equal(pushPreview(null), "Sent you a message");
assert.equal(pushPreview('ako-voice-note:v1:{"durationSec":5}'), "Voice message");
const media = (o) => "ako-media:v1:" + JSON.stringify(o);
assert.equal(pushPreview(media({ items: [{ kind: "image" }] })), "Photo");
assert.equal(pushPreview(media({ items: [{ kind: "image" }, { kind: "image" }] })), "2 photos");
assert.equal(pushPreview(media({ items: [{ kind: "image" }], caption: "lunch" })), "Photo: lunch");
assert.equal(pushPreview(media({ items: [{ kind: "document", name: "cv.pdf" }] })), "cv.pdf");
assert.equal(pushPreview("ako-media:v1:{broken"), "Sent you a message");
const long = pushPreview("x".repeat(1000));
assert.equal(Array.from(long).length, MAX_PREVIEW_CHARS + 3);
assert.ok(long.endsWith("..."));

const r = load("src/lib/notificationRoute.ts");
assert.equal(r.INBOX_ROUTE, "/inbox");
assert.deepEqual(r.parsePushData({ type: "message", conversationId: "c1", messageId: "m1" }), { type: "message", conversationId: "c1" });
assert.deepEqual(r.parsePushData({ type: "activity", notificationId: "n1", source: "page", notificationType: "follow" }), { type: "activity", notificationId: "n1", source: "page", notificationType: "follow" });
assert.equal(r.parsePushData({ type: "test" }), null);
assert.equal(r.parsePushData(undefined), null);
assert.equal(r.fallbackRouteForType("follow_request"), "/requests");
assert.equal(r.fallbackRouteForType("withdrawal_status"), "/wallet");
assert.equal(r.fallbackRouteForType("admin_message"), "/notifications");
assert.equal(r.fallbackRouteForType(undefined), "/notifications");
console.log("push logic: all checks passed");
