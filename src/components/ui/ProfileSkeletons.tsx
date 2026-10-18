// src/components/ui/ProfileSkeletons.tsx
// Layout-shaped placeholders for the profile screen. They replace the old full-screen "Loading…" / blurred
// overlay: the screen frame renders immediately and only the parts still waiting on data pulse. Same pattern
// as web (ProfileSkeletons.tsx).
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { thumbBoxAspectClass } from "@/lib/bookCover";
import type { ProjectType } from "@/hooks/useProjects";
import { Skeleton } from "./Skeleton";

/** Two-column tiles shaped like ProjectMiniCard — same grid and cover ratio, so nothing jumps on load. */
export function ProjectGridSkeleton({ count = 4, projectType }: { count?: number; projectType?: ProjectType }) {
  return (
    <View className="flex-row flex-wrap justify-between" style={{ rowGap: 16 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={{ width: "48.5%" }} className="overflow-hidden rounded-2xl border border-border-a60 bg-surface">
          <Skeleton className={`${thumbBoxAspectClass(projectType ?? "book", "aspect-square")} w-full !bg-canvas`} />
          <View className="px-4 pb-4 pt-3.5">
            <Skeleton className="h-3.5 w-3/4 rounded !bg-canvas" />
            <Skeleton className="mt-2 h-3 w-1/3 rounded !bg-canvas" />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Whole-profile placeholder, shown only until the profile row itself arrives. */
export function ProfilePageSkeleton() {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-canvas px-4" style={{ paddingTop: insets.top + 56 }} accessibilityRole="progressbar" accessibilityLabel="Loading profile">
      <View className="flex-row items-center gap-4">
        <Skeleton className="h-20 w-20 rounded-full" />
        <View className="flex-1 gap-2.5">
          <Skeleton className="h-5 w-2/5 rounded" />
          <Skeleton className="h-3.5 w-1/3 rounded" />
        </View>
      </View>
      <View className="mt-5 gap-2">
        <Skeleton className="h-3.5 w-full rounded" />
        <Skeleton className="h-3.5 w-4/5 rounded" />
      </View>
      <Skeleton className="mt-6 h-10 w-full rounded" />
      <View className="mt-4">
        <ProjectGridSkeleton />
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
