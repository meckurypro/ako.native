// src/app/(app)/settings/appearance.tsx
// Folded into the single Settings hub, with that section opened.
import { Redirect, type Href } from "expo-router";

export default function RedirectRoute() {
  return <Redirect href={{ pathname: "/settings", params: { section: "appearance" } } as Href} />;
}
