// src/app/(app)/activity/affiliates.tsx
// Affiliates moved to the Connect tab.
import { Redirect, type Href } from "expo-router";

export default function AffiliatesRedirectRoute() {
  return <Redirect href={"/connect?tab=affiliates" as Href} />;
}
