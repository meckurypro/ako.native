// src/components/ui/ProfileSkeletons.tsx
// Layout-shaped placeholders for the profile screen. They replace the old full-screen "Loading…" / blurred
// overlay: the screen frame renders immediately and only the parts still waiting on data pulse. Same pattern
// as web (ProfileSkeletons.tsx).
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { THUMB_SPECS } from "@/lib/thumbnailSpec";
import type { ProjectType } from "@/hooks/useProjects";
import { Skeleton } from "./Skeleton";

/** Two-column tiles shaped like ProjectMiniCard — same grid and cover ratio, so nothing jumps on load. */
export function ProjectGridSkeleton({ count = 4, projectType }: { count?: number; projectType?: ProjectType }) {
  return (
    <View className="flex-row flex-wrap justify-between" style={{ rowGap: 16 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={{ width: "48.5%" }} className="overflow-hidden rounded-2xl border border-border-a60 bg-surface">
          <View style={{ aspectRatio: THUMB_SPECS[projectType === "media" ? "1:1" : projectType === "gig" ? "2:1" : projectType === "course" ? "4:3" : projectType === "event" ? "4:5" : projectType === "room" ? "1:1" : "2:3"].ratio }} className="w-full">
            <Skeleton className="h-full w-full !bg-canvas" />
          </View>
          <View className="px-4 pb-4 pt-3.5">
            <Skeleton className="h-3.5 w-3/4 rounded !bg-canvas" />
            <Skeleton className="mt-2 h-3 w-1/3 rounded !bg-canvas" />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Whole-profile placeholder, shown only until the profile row itself arrives. The frame never disappears: the
 * toolbar bar keeps its height and position (its buttons fill in once we know whose profile this is), the
 * persistent bottom nav is untouched, and only the content area pulses — the same "frame stays, content
 * reloads" behaviour as pull-to-refresh.
 */
export function ProfilePageSkeleton() {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <View className="h-14 bg-canvas" />
      <View className="px-4 pt-2" accessibilityRole="progressbar" accessibilityLabel="Loading profile">
        <View className="flex-row items-start justify-between gap-4">
          <View className="flex-1 gap-2.5 pt-1">
            <Skeleton className="h-7 w-3/5 rounded" />
            <Skeleton className="h-4 w-2/5 rounded" />
            <View className="mt-5 flex-row gap-7">
              <Skeleton className="h-9 w-16 rounded" />
              <Skeleton className="h-9 w-16 rounded" />
            </View>
          </View>
          <Skeleton className="h-28 w-28 rounded-full" />
        </View>
        <View className="mt-5 gap-2">
          <Skeleton className="h-3.5 w-full rounded" />
          <Skeleton className="h-3.5 w-4/5 rounded" />
        </View>
        <Skeleton className="mt-5 h-11 w-full rounded-xl" />
        <Skeleton className="mt-4 h-12 w-full rounded" />
        <View className="mt-4">
          <PostListSkeleton count={2} />
        </View>
      </View>
    </View>
  );
}

/** Placeholder rows shaped like PostCard (avatar + name line, text lines, media block). */
export function PostListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <View className="gap-6" accessibilityRole="progressbar" accessibilityLabel="Loading posts">
      {Array.from({ length: count }).map((_, i) => (
        <View key={i}>
          <View className="flex-row items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <View className="flex-1 gap-2">
              <Skeleton className="h-3.5 w-1/3 rounded" />
              <Skeleton className="h-3 w-1/4 rounded" />
            </View>
          </View>
          <View className="mt-3 gap-2">
            <Skeleton className="h-3.5 w-full rounded" />
            <Skeleton className="h-3.5 w-3/4 rounded" />
          </View>
          {i === 0 ? <Skeleton className="mt-3 aspect-[4/3] w-full rounded-2xl" /> : null}
        </View>
      ))}
    </View>
  );
}
