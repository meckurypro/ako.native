// src/app/(app)/activity/library.tsx
// Library has its own bottom-nav slot now; old links land there.
import { Redirect, type Href } from "expo-router";

export default function RedirectRoute() {
  return <Redirect href={"/library" as Href} />;
}
