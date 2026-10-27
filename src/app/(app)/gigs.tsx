// src/app/(app)/gigs.tsx
// Legacy path — "Gigs" is now "Talents". Old links and deep links land here and move on.
import { Redirect, type Href } from "expo-router";

export default function LegacyGigsRoute() {
  return <Redirect href={"/talents" as Href} />;
}
