// src/components/discover/DiscoverBrowse.tsx
// The Discover page body, identical for restricted and full accounts: one swipeable row per kind of
// content, then Pages. Full accounts additionally pass a `lead` (topic chips + people), rendered above
// the rows — restricted accounts never see people or posts, so it's simply absent.
import type { ReactNode } from "react";
import { View } from "react-native";

import { Text } from "@/components/ui/Text";
import { useDiscoverRails } from "@/hooks/useDiscoverBrowse";
import { useSuggestedPages } from "@/hooks/useSearch";
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

export function DiscoverBrowse({ lead }: { lead?: ReactNode }) {
  const { rails, isLoading } = useDiscoverRails();
  const { data: pages, isLoading: pagesLoading } = useSuggestedPages();

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
            const moreTo = `/topics/${section.key}`;
            return (
              <DiscoverRail key={section.key} title={section.title} moreTo={hasMore ? moreTo : undefined} snap={discoverTileShape(section.type).width + 12}>
                {items.map((item) => (
                  <DiscoverTile key={item.project.id} item={item} />
                ))}
                {hasMore ? <DiscoverMoreTile to={moreTo} label={section.title} projectType={section.type} /> : null}
              </DiscoverRail>
            );
          })}

          {hasPages ? (
            <DiscoverRail
              title="Pages"
              snap={AVATAR_TILE_WIDTH + 12}
              moreTo={pages!.length >= SUGGESTED_PAGES_CAP ? "/topics/pages" : undefined}
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
              {pages!.length >= SUGGESTED_PAGES_CAP ? <DiscoverMoreTile to="/topics/pages" label="Pages" /> : null}
            </DiscoverRail>
          ) : null}

          {empty ? <Text className="py-8 text-center text-sm text-ink-muted">Nothing to explore yet — check back soon.</Text> : null}
        </>
      )}
    </View>
  );
}
