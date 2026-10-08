// src/app/(app)/saved-projects.tsx
// Saved projects folded into Activity → Saved (Projects tab).
import { Redirect, type Href } from "expo-router";

export default function RedirectRoute() {
  return <Redirect href={"/activity/saved?tab=projects" as Href} />;
}
