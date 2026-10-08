// src/app/(app)/settings/advanced.tsx
// Folded into the single Settings hub, with that section opened.
import { Redirect, type Href } from "expo-router";

export default function RedirectRoute() {
  return <Redirect href={{ pathname: "/settings", params: { section: "advanced" } } as Href} />;
}
