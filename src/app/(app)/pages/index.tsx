// src/app/(app)/pages/index.tsx
// The old "Account mode" screen is now the Pages modal on the profile. Keep stale links and deep links working.
import { Redirect } from "expo-router";

export default function PagesRedirect() {
  return <Redirect href="/me" />;
}
