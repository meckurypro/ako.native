// src/app/(app)/saved-projects.tsx
// Saved projects live under Activity → Saved.
import { Redirect, type Href } from "expo-router";

export default function RedirectRoute() {
  return <Redirect href={"/activity/saved" as Href} />;
}
