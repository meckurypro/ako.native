// src/app/(app)/activity/affiliates.tsx
// Affiliates (Forked) live under Wallet → Affiliate.
import { Redirect, type Href } from "expo-router";

export default function AffiliatesRedirectRoute() {
  return <Redirect href={"/wallet/affiliate-links" as Href} />;
}
