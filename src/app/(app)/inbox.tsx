// src/app/(app)/inbox.tsx
// Bottom-nav "Messages": personal conversations, or the Page inbox when acting as a Page.
import { Redirect, type Href } from "expo-router";

import { FullScreenLoading } from "@/components/nav/AuthGate";
import { useAuth } from "@/hooks/useAuth";
import { useActiveIdentity } from "@/hooks/usePages";

export default function MyInboxRedirect() {
  const { loading } = useAuth();
  const { data: identity, isLoading } = useActiveIdentity();

  if (loading || isLoading) return <FullScreenLoading />;
  return <Redirect href={(identity?.mode === "page" ? "/page-inbox" : "/messages") as Href} />;
}
