// scripts/test-custom-page.mjs
// Pure-logic checks for Custom Pages: the colour picker maths and the draft-vs-publish validation. Run: node scripts/test-custom-page.mjs
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const fs = require("node:fs");
function load(file, mocks) {
  const src = fs.readFileSync(file, "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: "commonjs", target: "es2020", jsx: "preserve" } }).outputText;
  const m = { exports: {} };
  new Function("module", "exports", "require", js)(m, m.exports, (n) => { if (n in mocks) return mocks[n]; throw new Error("unmocked " + n); });
  return m.exports;
}
const lib = load("src/lib/customPage.ts", { "expo-crypto": { randomUUID: () => "a-b-c-d" }, "./config": { APP_URL: "https://myako.site" }, "./localFile": { fileExtension: () => "jpg" }, "./supabase": { supabase: {} } });
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } };

// colour maths: pull the two helpers out of ColorPicker.tsx
const cp = fs.readFileSync("src/components/customPage/ColorPicker.tsx", "utf8");
const grab = (name) => cp.slice(cp.indexOf("function " + name), cp.indexOf("\n}\n", cp.indexOf("function " + name)) + 3);
const js = ts.transpileModule(grab("hexToHsv") + grab("hsvToHex") + "module.exports={hexToHsv,hsvToHex}", { compilerOptions: { module: "commonjs" } }).outputText;
const m = { exports: {} }; new Function("module", js)(m);
for (const hex of ["#3D5A45", "#B8862E", "#FFFFFF", "#000000", "#FF0000", "#00FF00", "#0000FF", "#7A1F3D", "#6B7280"]) {
  const { h, s, v } = m.exports.hexToHsv(hex);
  const back = m.exports.hsvToHex(h, s, v);
  ok(back === hex, `roundtrip ${hex} -> ${back}`);
}

// draft is lenient, publish is strict
const half = { identity: { name: "St Anne" }, contact: { email: "a@b" , phone: "12" }, ctas: [{ id: "cta-1", label: "", action: "url" }] };
ok(lib.draftProblem(half) === null, "half-typed draft must save");
const p = lib.publishProblem(half);
ok(p && p.stage === "contact", "publish catches bad email first: " + JSON.stringify(p));
ok(lib.publishProblem({ identity: { name: "" } }).stage === "identity", "publish needs a name");
ok(lib.publishProblem({ identity: { name: "X" }, ctas: [{ id: "cta-1", label: "Go", action: "url", url: "nope" }] }).stage === "buttons", "bad url blocks publish");
ok(lib.publishProblem({ identity: { name: "X" }, contact: { email: "a@b.co" }, ctas: [{ id: "cta-1", label: "Go", action: "url", url: "https://x.co" }] }) === null, "valid page publishes");
ok(lib.draftProblem({ identity: { name: "x".repeat(81) } }) !== null, "over-long name is refused even as a draft");
console.log(fail ? fail + " FAILED" : "all passed");
process.exit(fail ? 1 : 0);
