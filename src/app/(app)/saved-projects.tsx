// src/app/(app)/saved-projects.tsx
// Saved projects live in Library → Saved.
import { Redirect, type Href } from "expo-router";

export default function RedirectRoute() {
  return <Redirect href={"/library?tab=saved" as Href} />;
}
