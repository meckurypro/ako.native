// src/app/(app)/bookmarks.tsx
// Bookmarks folded into Activity → Saved.
import { Redirect, type Href } from "expo-router";

export default function RedirectRoute() {
  return <Redirect href={"/activity/saved" as Href} />;
}
