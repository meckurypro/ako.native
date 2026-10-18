// src/app/(app)/me.tsx
// Bottom-nav "Profile": your own profile, or the active Page when acting as one.
//
// This is a redirect screen, so it must never be a dead end. It used to wait for the acting identity AND the username
// to resolve before doing anything, and rendered a bare full-screen spinner meanwhile — with no network and nothing
// cached, that was a blank screen forever. Now:
//   • both answers are persisted, so with a cache it redirects instantly, offline included;
//   • a fresh identity is only awaited while a request is actually in flight, and only briefly;
//   • if the identity is unknown we assume personal (the common case) rather than block;
//   • with no username at all (never opened online) it says so, with a way out, inside the normal app frame.
import { Redirect, router, type Href } from "expo-router";
import { View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { ProfilePageSkeleton } from "@/components/ui/ProfileSkeletons";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/hooks/useAuth";
import { useIsOnline } from "@/hooks/useIsOnline";
import { useLoadingBudget } from "@/hooks/useLoadingBudget";
import { useActiveIdentity } from "@/hooks/usePages";

export default function MyProfileRedirect() {
  const { user, profile, loading } = useAuth();
  const { data: identity, isLoading, isFetching } = useActiveIdentity();
  const online = useIsOnline();
  const queryClient = useQueryClient();

  const waiting = useLoadingBudget(loading || isLoading || isFetching, 3000);

  if (waiting) return <ProfilePageSkeleton />;

  if (!profile) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-canvas px-6">
        <Text className="text-center text-base text-ink">{online ? "We couldn't load your profile." : "You're offline."}</Text>
        <Text className="max-w-xs text-center text-sm text-ink-muted">
          {online
            ? "Check your connection and try again."
            : "Your profile will be available offline once you've opened the app online. Your downloads are in the Library."}
        </Text>
        <View className="mt-2 w-full max-w-xs gap-2">
          {online ? (
            <Button
              onPress={() => {
                void queryClient.invalidateQueries({ queryKey: ["my-username", user?.id] });
                void queryClient.invalidateQueries({ queryKey: ["active-identity", user?.id] });
              }}
            >
              Try again
            </Button>
          ) : null}
          <Button variant={online ? "secondary" : "primary"} onPress={() => router.push("/library" as Href)}>
            Open Library
          </Button>
        </View>
      </View>
    );
  }

  if (identity?.mode === "page") return <Redirect href={`/page/${identity.page.username}` as Href} />;
  return <Redirect href={`/profile/${profile.username}` as Href} />;
}
