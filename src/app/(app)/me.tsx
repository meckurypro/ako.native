// src/app/(app)/me.tsx
// Bottom-nav "Profile": your own profile, or the active Page when acting as one.
import { Redirect, type Href } from "expo-router";

import { FullScreenLoading } from "@/components/nav/AuthGate";
import { useAuth } from "@/hooks/useAuth";
import { useActiveIdentity } from "@/hooks/usePages";

export default function MyProfileRedirect() {
  const { profile, loading } = useAuth();
  const { data: identity, isLoading, isFetching } = useActiveIdentity();

  if (loading || isLoading || isFetching || !profile) return <FullScreenLoading />;

  if (identity?.mode === "page") return <Redirect href={`/page/${identity.page.username}` as Href} />;
  return <Redirect href={`/profile/${profile.username}` as Href} />;
}
