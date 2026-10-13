// src/app/index.tsx
import { Redirect, type Href } from "expo-router";

import { RESTRICTED_HOME, useIsRestricted } from "@/hooks/useAccountAccess";

export default function Index() {
  // Restricted (consumer-only) accounts have no Feed — land them on Discover.
  const restricted = useIsRestricted();
  return <Redirect href={(restricted ? RESTRICTED_HOME : "/feed") as Href} />;
}
