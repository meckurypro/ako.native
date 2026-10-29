// scripts/test-friendly-error.mjs — run: node scripts/test-friendly-error.mjs
// Verifies what people see when a request fails: raw HTTP codes, gateway HTML, SQL and ids never reach the screen;
// a slow request is "taking too long" (not "offline"); and the app's own plain-English messages pass through untouched.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const ts = require(path.join(root, "node_modules/typescript"));
const src = readFileSync(path.join(root, "src/lib/friendlyError.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: "commonjs", target: "es2022" } }).outputText;
const mod = { exports: {} };
new Function("module", "exports", js)(mod, mod.exports);
const { classifyError, friendlyError } = mod.exports;

const FALLBACK = "Couldn't save changes.";
const kind = (x) => classifyError(x, FALLBACK).kind;

// ── HTTP status written into the text (the Settings → Profile screenshot) ──
assert.equal(kind("HTTP 504 error"), "timeout");
assert.equal(kind(new Error("HTTP 502 error")), "server");
assert.equal(kind("HTTP 503 error"), "server");
assert.equal(kind("Error 500"), "server");
assert.equal(kind("HTTP 429 error"), "rate_limit");
assert.equal(kind("HTTP 413 error"), "too_large");
assert.equal(kind("HTTP 404 error"), "not_found");
assert.equal(kind("HTTP 401 error"), "session");
assert.equal(kind("HTTP 403 error"), "permission");
assert.equal(kind("<html><head><title>504 Gateway Time-out</title></head></html>"), "timeout");
assert.equal(kind("Unexpected token '<', \"<html>\" is not valid JSON"), "generic");
assert.equal(friendlyError("Unexpected token '<', \"<html>\" is not valid JSON", FALLBACK), FALLBACK);

// ── a status carried as a property ──
assert.equal(kind({ message: "x", status: 503 }), "server");
assert.equal(kind({ message: "", statusCode: "504" }), "timeout");
assert.equal(kind({ message: "Request failed", context: { status: 502 } }), "server");

// ── slow is not offline; offline is not slow ──
assert.equal(kind("Request timed out"), "timeout");
assert.equal(kind("Network request failed"), "network");
assert.equal(kind({ name: "AuthRetryableFetchError", message: "Network request failed" }), "network");
assert.notEqual(classifyError("Request timed out", FALLBACK).message, classifyError("Network request failed", FALLBACK).message);

// ── our own plain sentences survive, even beside a 4xx status ──
assert.equal(friendlyError({ message: "You already own this.", status: 400 }, FALLBACK), "You already own this.");
assert.equal(friendlyError({ message: "Project not found.", status: 404 }, FALLBACK), "Project not found.");
assert.equal(friendlyError(new Error("Image must be under 5MB."), FALLBACK), "Image must be under 5MB.");
assert.equal(friendlyError("Display name can't be empty.", FALLBACK), "Display name can't be empty.");

// ── existing behaviour is unchanged ──
assert.equal(kind("JWT expired"), "session");
assert.equal(kind("new row violates row-level security policy for table \"x\""), "permission");
assert.equal(kind("duplicate key value violates unique constraint"), "conflict");
assert.equal(kind("Insufficient balance: wallet 3ec9d8a5-1111-2222-3333-444455556666 has 0.00, attempted debit of 2.00"), "insufficient_balance");
assert.equal(friendlyError("", FALLBACK), FALLBACK);
assert.equal(friendlyError(null, FALLBACK), FALLBACK);

// ── retry only where it can help; every transient kind has a heading ──
for (const k of ["HTTP 504 error", "HTTP 503 error", "Network request failed", "HTTP 429 error"]) {
  const e = classifyError(k, FALLBACK);
  assert.equal(e.retryable, true, `${k} is retryable`);
  assert.ok(e.title, `${k} has a heading`);
}
for (const k of ["HTTP 413 error", "HTTP 403 error", "JWT expired"]) assert.equal(classifyError(k, FALLBACK).retryable, false, `${k} is not retryable`);

// ── nothing technical ever leaks ──
for (const k of ["HTTP 504 error", "HTTP 502 error", "<html>504</html>", "Request timed out"]) {
  assert.doesNotMatch(classifyError(k, FALLBACK).message, /HTTP|\b50\d\b|<html|timed out/i, `${k} is rewritten`);
}

console.log("friendlyError: all checks passed");
