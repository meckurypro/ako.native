// scripts/check-publish-env.mjs
// Fails the OTA publish when a build-time variable the app needs is missing or malformed.
//
// Why: EXPO_PUBLIC_* values are inlined into the JS bundle when `eas update` builds it. A bundle built without them
// throws "Missing Supabase environment variables" the moment the app loads, and every phone that downloads it
// crash-loops. The workflow runs this under `eas env:exec <environment>`, i.e. with exactly the variables that
// `eas update --environment <environment>` will bake in. Values are never printed.
const required = ["EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_ANON_KEY"];
const problems = [];

for (const name of required) {
  const value = (process.env[name] ?? "").trim();
  if (!value) problems.push(`${name} is missing or empty`);
}

const url = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? "").trim();
if (url) {
  try {
    if (new URL(url).protocol !== "https:") problems.push("EXPO_PUBLIC_SUPABASE_URL must start with https://");
  } catch {
    problems.push("EXPO_PUBLIC_SUPABASE_URL is not a valid URL");
  }
}

if (problems.length) {
  console.error("Refusing to publish: this update would crash the app on launch.\n");
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    "\nFix: expo.dev > your project > Environment variables > select the environment being published." +
      "\nBoth variables must exist there and must NOT use \"Secret\" visibility (Secret values are not available to the bundler).",
  );
  process.exit(1);
}

console.log("Publish env OK: Supabase URL and anon key are present.");
