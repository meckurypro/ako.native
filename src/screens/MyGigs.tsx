// src/screens/MyGigs.tsx
// "Your Gigs": every professional identity on the account, one Gig per role. Reached from the profile menu.
import { router, type Href } from "expo-router";
import { Briefcase } from "lucide-react-native";
import { ScrollView, View } from "react-native";

import { EmptyNotice } from "@/components/activity/EmptyNotice";
import { ThumbRow } from "@/components/activity/ThumbRow";
import { useBottomNavInset } from "@/components/nav/BottomNav";
import { useChromeScroll } from "@/components/nav/ChromeProvider";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Text } from "@/components/ui/Text";
import { useMyGigs, type MyGig } from "@/hooks/usePortfolio";

const STATUS_LABEL: Record<string, string> = { draft: "Draft", archived: "Archived", cancelled: "Cancelled" };
const SOURCE_LABEL: Record<MyGig["source"], string> = {
  manual: "Created manually",
  auto_project: "Started from a project",
  auto_collaboration: "Started from a collaboration",
};

function GigRow({ gig }: { gig: MyGig }) {
  return (
    <ThumbRow
      onPress={() => router.push(`/projects/${gig.id}/edit` as Href)}
      thumbnailUrl={gig.thumbnail_url}
      fallbackIcon={Briefcase}
      title={gig.title}
      subtitle={`${gig.role_label ?? "No role set"}${gig.status !== "active" ? ` · ${STATUS_LABEL[gig.status] ?? gig.status}` : ""}`}
      trailing={
        !gig.is_complete ? (
          <View className="shrink-0 rounded-full bg-accent-soft px-2.5 py-1">
            <Text className="text-[11px] font-medium text-accent">Finish setup</Text>
          </View>
        ) : undefined
      }
    />
  );
}

function groupGigs(gigs: MyGig[]) {
  const incomplete = gigs.filter((g) => !g.is_complete);
  const byCategory = new Map<string, MyGig[]>();
  for (const gig of gigs.filter((g) => g.is_complete)) {
    const key = gig.category ?? "Other";
    byCategory.set(key, [...(byCategory.get(key) ?? []), gig]);
  }
  return { incomplete, byCategory };
}

export function MyGigs() {
  const bottomInset = useBottomNavInset();
  const onScroll = useChromeScroll();
  const { data: gigs, isLoading } = useMyGigs();
  const { incomplete, byCategory } = groupGigs(gigs ?? []);

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Your Gigs" />
      <ScrollView onScroll={onScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomInset }}>
        <Text className="mb-6 text-sm text-ink-muted">Every professional identity on your account — one Gig per role.</Text>

        {isLoading ? (
          <Text className="py-10 text-center text-sm text-ink-muted">Loading…</Text>
        ) : !gigs || gigs.length === 0 ? (
          <EmptyNotice large icon={Briefcase} title="No Gigs yet." message="Create one from the + button, or get credited as a collaborator and accept it — either way, it shows up here." />
        ) : (
          <View className="gap-6">
            {incomplete.length > 0 && (
              <View>
                <Text className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">Needs attention</Text>
                <View className="gap-2">
                  {incomplete.map((gig) => (
                    <View key={gig.id}>
                      <GigRow gig={gig} />
                      {gig.source !== "manual" && <Text className="mt-1 px-1 text-[11px] text-ink-muted">{SOURCE_LABEL[gig.source]}</Text>}
                    </View>
                  ))}
                </View>
              </View>
            )}
            {[...byCategory.entries()].map(([category, categoryGigs]) => (
              <View key={category}>
                <Text className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">{category}</Text>
                <View className="gap-2">
                  {categoryGigs.map((gig) => (
                    <GigRow key={gig.id} gig={gig} />
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
