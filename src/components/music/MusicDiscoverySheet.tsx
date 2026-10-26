// src/components/music/MusicDiscoverySheet.tsx
//
// The lightweight surface a tapped attribution opens. Port of the web MusicDiscoverySheet.
// Core loop: Music → Artist → Profile → Projects. A musician remains an Akọ creator — this links
// straight to their existing profile rather than inventing a separate musician-account surface.
import { router, type Href } from "expo-router";
import { Music as MusicIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Avatar } from "@/components/ui/Avatar";
import { SheetFrame } from "@/components/ui/SheetFrame";
import { useSheet } from "@/components/ui/Sheet";
import { Icon, Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useIsRestricted } from "@/hooks/useAccountAccess";
import { runAfterDismiss } from "@/hooks/useBackDismiss";
import { useMusicCatalogueEntry, useRecordMusicUsageEvent } from "@/hooks/useMusicCatalogue";
import { getProjectPath } from "@/lib/projectLinks";
import { CONTRIBUTOR_ROLE_LABELS, type MusicCatalogueWithContributors } from "@/types/music";

interface MusicDiscoverySheetProps {
  catalogueId: string;
  onClose: () => void;
}

export function MusicDiscoverySheet({ catalogueId, onClose }: MusicDiscoverySheetProps) {
  const { data: entry } = useMusicCatalogueEntry(catalogueId);

  if (!entry) return null;

  const featured = entry.contributors.filter((c) => c.role === "featured_artist");

  return (
    // Web: z-[70] — above the other sheets, since it opens from a post's attribution line.
    <SheetFrame title="Song" onClose={onClose} zIndex={70}>
      <View className="py-2">
        <View className="mb-5 flex-row items-center gap-3">
          <View className="h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-accent-soft">
            {entry.cover_url ? (
              <Image source={entry.cover_url} contentFit="cover" style={{ width: 56, height: 56 }} />
            ) : (
              <Icon as={MusicIcon} size={20} className="text-accent" />
            )}
          </View>
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-base font-medium text-ink">
              {entry.title}
            </Text>
            <Text numberOfLines={1} className="text-sm text-ink-muted">
              {entry.primary_artist_name}
              {featured.length > 0 ? ` · feat. ${featured.map((f) => f.contributor.display_name).join(", ")}` : ""}
            </Text>
          </View>
        </View>

        {entry.contributors.length > 0 ? (
          <View className="mb-5 gap-1.5">
            {entry.contributors.map((c) => (
              <View key={c.id} className="flex-row items-center gap-2">
                <Avatar src={c.contributor.avatar_url} name={c.contributor.display_name} size="sm" />
                <Text className="flex-1 text-sm text-ink">
                  {c.contributor.display_name} <Text className="text-ink-muted">· {CONTRIBUTOR_ROLE_LABELS[c.role]}</Text>
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <SongActions entry={entry} />

        <Text className="mt-4 text-center text-[11px] text-ink-muted">
          This music belongs to its creator — Akọ hosts it under the Akọ Music Licence.
        </Text>
      </View>
    </SheetFrame>
  );
}

// The three actions live in their own component because they need the sheet's own close() (useSheet only works from
// inside <SheetFrame>): each one slides the sheet away first and navigates once it has settled — pushing a route while
// a modal sheet is still dismissing can swallow the navigation (see runAfterDismiss).
function SongActions({ entry }: { entry: MusicCatalogueWithContributors }) {
  const { close } = useSheet();
  const recordUsage = useRecordMusicUsageEvent();
  // Restricted (consumer-only) accounts can't reach /compose — the app never offers them creation surfaces, silently,
  // so hide the button rather than send them to a redirect.
  const restricted = useIsRestricted();
  const artist = entry.contributors.find((c) => c.role === "artist");

  function attachToPost() {
    runAfterDismiss(close, () => router.push({ pathname: "/compose", params: { attachMusicCatalogueId: entry.id } } as Href));
  }

  function visitProfile() {
    if (!artist) return;
    recordUsage.mutate({ catalogueId: entry.id, eventType: "profile_visit" });
    // The artist's Akọ profile is the one public, always-present creator page. A Gig is a private management hub
    // (/gigs), not a public page.
    runAfterDismiss(close, () => router.push(`/profile/${artist.contributor.username}` as Href));
  }

  function visitProject() {
    recordUsage.mutate({ catalogueId: entry.id, eventType: "project_visit" });
    // Prefer the project's public /:slug address, falling back to the immutable id route when no slug is set.
    runAfterDismiss(close, () => router.push(getProjectPath({ id: entry.project_id, slug: entry.project_slug }) as Href));
  }

  return (
    <View className="gap-2">
      {!restricted ? (
        <Pressable onPress={attachToPost} accessibilityRole="button" className="items-center rounded-full bg-accent py-3">
          <Text className="text-sm font-medium text-canvas">Use in my post</Text>
        </Pressable>
      ) : null}
      {artist ? (
        <Pressable onPress={visitProfile} accessibilityRole="button" className="items-center rounded-full bg-accent-soft py-3">
          <Text className="text-sm font-medium text-accent">View creator</Text>
        </Pressable>
      ) : null}
      <Pressable onPress={visitProject} accessibilityRole="button" className="items-center rounded-full border border-border py-3">
        <Text className="text-sm font-medium text-ink">View Audio Project</Text>
      </Pressable>
    </View>
  );
}
