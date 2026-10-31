// src/components/discover/DiscoverBrowse.tsx
// The Discover page body, identical for restricted and full accounts: one swipeable row per kind of
// content, then Pages. Full accounts additionally pass a `lead` (topic chips + people), rendered above
// the rows — restricted accounts never see people or posts, so it's simply absent.
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { Text } from "@/components/ui/Text";
import { useDiscoverRails } from "@/hooks/useDiscoverBrowse";
import { useSuggestedPages } from "@/hooks/useSearch";
import { useRelatedTags, useTagPages, type TagRef } from "@/hooks/useTags";
import { discoverTileShape } from "@/lib/discoverTileShape";
import { pageModeLabel } from "@/lib/pageRoles";
import {
  AVATAR_TILE_WIDTH,
  DiscoverAvatarTile,
  DiscoverMoreTile,
  DiscoverRail,
  DiscoverRailSkeleton,
  DiscoverTile,
} from "./DiscoverRail";

// useSuggestedPages returns at most this many; reaching it means there are more to see.
const SUGGESTED_PAGES_CAP = 8;

export function DiscoverBrowse({
  lead,
  tags = [],
  onPickTag,
}: {
  lead?: ReactNode;
  tags?: TagRef[];
  /** Offered on the empty state: connected topics to try instead. */
  onPickTag?: (tag: TagRef) => void;
}) {
  const ids = tags.map((t) => t.id);
  const filtered = ids.length > 0;
  // "More" doors carry the filter along, so the full list is filtered too.
  const tagQuery = filtered ? `?tag=${tags.map((t) => t.slug).join(",")}` : "";

  const { rails, isLoading } = useDiscoverRails(ids);
  const suggestedPages = useSuggestedPages();
  const taggedPages = useTagPages(ids, SUGGESTED_PAGES_CAP);
  const { data: pages, isLoading: pagesLoading } = filtered ? taggedPages : suggestedPages;
  const related = useRelatedTags(filtered ? ids : [], 6);

  const loading = isLoading || pagesLoading;
  const hasPages = !!pages && pages.length > 0;
  const empty = !loading && rails.length === 0 && !hasPages;

  return (
    <View>
      {lead}

      {loading ? (
        <>
          <DiscoverRailSkeleton />
          <DiscoverRailSkeleton />
        </>
      ) : (
        <>
          {rails.map(({ section, items, hasMore }) => {
            const moreTo = `/topics/${section.key}${tagQuery}`;
            return (
              <DiscoverRail key={section.key} title={section.title} moreTo={hasMore ? moreTo : undefined} snap={discoverTileShape({ project_type: section.type, thumbnail_shape: section.kind === "video" ? "16:9" : null }).width + 12}>
                {items.map((item) => (
                  <DiscoverTile key={item.project.id} item={item} />
                ))}
                {hasMore ? <DiscoverMoreTile to={moreTo} label={section.title} projectType={section.type} mediaKind={section.type === "media" ? (section.kind as "audio" | "video") : undefined} /> : null}
              </DiscoverRail>
            );
          })}

          {hasPages ? (
            <DiscoverRail
              title="Pages"
              snap={AVATAR_TILE_WIDTH + 12}
              moreTo={pages!.length >= SUGGESTED_PAGES_CAP ? `/topics/pages${tagQuery}` : undefined}
            >
              {pages!.map((p) => (
                <DiscoverAvatarTile
                  key={p.id}
                  to={`/page/${p.username}`}
                  name={p.name}
                  avatarUrl={p.avatar_url}
                  caption={pageModeLabel(p.page_type)}
                  verified={p.is_verified}
                />
              ))}
              {pages!.length >= SUGGESTED_PAGES_CAP ? <DiscoverMoreTile to={`/topics/pages${tagQuery}`} label="Pages" /> : null}
            </DiscoverRail>
          ) : null}

          {empty && !filtered ? <Text className="py-8 text-center text-sm text-ink-muted">Nothing to explore yet — check back soon.</Text> : null}

          {empty && filtered ? (
            <View className="items-center py-8">
              <Text className="text-center text-sm text-ink-muted">Nothing tagged {tags.map((t) => t.name).join(" or ")} yet.</Text>
              {onPickTag && (related.data ?? []).length > 0 ? (
                <>
                  <Text className="mb-2 mt-4 text-xs text-ink-muted">Try a connected topic</Text>
                  <View className="flex-row flex-wrap justify-center gap-2">
                    {(related.data ?? []).map((t) => (
                      <Pressable
                        key={t.id}
                        onPress={() => onPickTag(t)}
                        accessibilityRole="button"
                        className="rounded-full border border-border bg-surface px-3.5 py-2 active:border-accent-a50"
                      >
                        <Text className="text-sm text-ink">{t.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}
