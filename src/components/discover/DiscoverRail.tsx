// src/components/discover/DiscoverRail.tsx
// The building blocks of the structured Discover page: a titled, swipeable row of small tiles with a
// "More" door at both ends of the row — a link in the header (findable without scrolling) and a tile
// after the last item (where a swipe naturally ends).
//
// Sizing: tiles are 104pt wide, so on a phone three sit fully in view with the fourth peeking in — the
// peek is what tells people the row swipes. Rows snap card to card.
import { router, type Href } from "expo-router";
import { ArrowRight, ChevronRight, ImageIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { FileFolderIcon } from "@/components/project/FileFolderArt";
import { Avatar } from "@/components/ui/Avatar";
import { Icon, Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { discoverTileMeta, type DiscoverItem } from "@/hooks/useDiscoverBrowse";
import { thumbBoxAspectClass } from "@/lib/bookCover";
import { isFileType } from "@/lib/fileProject";
import { getProjectPath } from "@/lib/projectLinks";

export const TILE_WIDTH = 104;
export const AVATAR_TILE_WIDTH = 84;
const GAP = 12;

export function DiscoverRail({
  title,
  moreTo,
  snap = TILE_WIDTH + GAP,
  children,
}: {
  title: string;
  /** Where "More" goes. Omit when the row already shows everything there is. */
  moreTo?: string;
  /** Distance between tile starts, so the row settles on a tile edge. */
  snap?: number;
  children: ReactNode;
}) {
  return (
    <View className="mb-7" accessibilityLabel={title}>
      <View className="mb-2.5 flex-row items-center justify-between gap-3">
        <Text className="font-display text-lg text-ink">{title}</Text>
        {moreTo ? (
          <Pressable
            onPress={() => router.push(moreTo as Href)}
            accessibilityRole="link"
            accessibilityLabel={`More ${title}`}
            hitSlop={10}
            className="min-h-[32px] flex-row items-center gap-0.5 active:opacity-70"
          >
            <Text className="text-sm font-medium text-accent">More</Text>
            <Icon as={ChevronRight} size={16} className="text-accent" />
          </Pressable>
        ) : null}
      </View>
      {/* Bleeds to the screen edges (negative margin cancels the page padding) so tiles slide off the page. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        decelerationRate="fast"
        snapToInterval={snap}
        snapToAlignment="start"
        style={{ marginHorizontal: -16 }}
        contentContainerStyle={{ paddingHorizontal: 16, gap: GAP }}
      >
        {children}
      </ScrollView>
    </View>
  );
}

/** One project: cover, title (two lines at most), and one muted line — a date or a price. */
export function DiscoverTile({ item, width = TILE_WIDTH }: { item: DiscoverItem; width?: number }) {
  const { project } = item;
  const meta = discoverTileMeta(item);
  return (
    <Pressable
      onPress={() => router.push(getProjectPath(project) as Href)}
      accessibilityRole="link"
      accessibilityLabel={meta ? `${project.title}, ${meta}` : project.title}
      className="active:opacity-80"
      style={{ width }}
    >
      <View
        className={`${thumbBoxAspectClass(project.project_type, "aspect-square")} w-full items-center justify-center overflow-hidden rounded-xl border border-border-a60 bg-surface`}
      >
        {isFileType(project.project_type) ? (
          <FileFolderIcon size={120} fill />
        ) : project.thumbnail_url ? (
          <Image source={{ uri: project.thumbnail_url }} contentFit="cover" transition={150} style={{ width: "100%", height: "100%" }} />
        ) : (
          <Icon as={ImageIcon} size={20} className="text-ink-muted" />
        )}
      </View>
      <Text numberOfLines={2} className="mt-1.5 text-xs font-medium leading-snug text-ink">
        {project.title}
      </Text>
      {meta ? (
        <Text numberOfLines={1} className="mt-0.5 text-[11px] text-ink-muted">
          {meta}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** The last tile of a row: same footprint as the others (cover-shaped for books), pointing at the full list. */
export function DiscoverMoreTile({ to, label, tall = false }: { to: string; label: string; tall?: boolean }) {
  return (
    <Pressable
      onPress={() => router.push(to as Href)}
      accessibilityRole="link"
      accessibilityLabel={`More ${label}`}
      className="active:opacity-80"
      style={{ width: TILE_WIDTH }}
    >
      <View
        className={`${tall ? "aspect-[2/3]" : "aspect-square"} w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-surface-a60`}
      >
        <View className="h-9 w-9 items-center justify-center rounded-full bg-accent-soft">
          <Icon as={ArrowRight} size={18} className="text-accent" />
        </View>
        <Text className="text-xs font-medium text-accent">More</Text>
      </View>
    </Pressable>
  );
}

/** A person or a page: round avatar, name, one muted caption. */
export function DiscoverAvatarTile({
  to,
  name,
  avatarUrl,
  caption,
  verified = false,
}: {
  to: string;
  name: string;
  avatarUrl: string | null;
  caption?: string;
  verified?: boolean;
}) {
  return (
    <Pressable
      onPress={() => router.push(to as Href)}
      accessibilityRole="link"
      accessibilityLabel={name}
      className="items-center active:opacity-80"
      style={{ width: AVATAR_TILE_WIDTH }}
    >
      <Avatar src={avatarUrl} name={name} size="xl" />
      <View className="mt-1.5 max-w-full flex-row items-center justify-center gap-1">
        <Text numberOfLines={2} className="shrink text-center text-xs font-medium leading-snug text-ink">
          {name}
        </Text>
        {verified ? <VerifiedBadge className="shrink-0" /> : null}
      </View>
      {caption ? (
        <Text numberOfLines={1} className="mt-0.5 max-w-full text-center text-[11px] text-ink-muted">
          {caption}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Placeholder row while the first load runs — same footprint as a real row, so nothing jumps. */
export function DiscoverRailSkeleton() {
  return (
    <View className="mb-7" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View className="mb-2.5 h-5 w-28 rounded bg-surface" />
      <View className="flex-row" style={{ gap: GAP }}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ width: TILE_WIDTH }}>
            <View className="aspect-square w-full rounded-xl bg-surface" />
            <View className="mt-1.5 h-3 w-4/5 rounded bg-surface" />
          </View>
        ))}
      </View>
    </View>
  );
}
