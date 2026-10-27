// src/screens/MyTalents.tsx
// "Your Talents": every professional identity on the account, one Talent per role. Reached from the profile menu.
import { router, type Href } from "expo-router";
import { Briefcase } from "lucide-react-native";
import { ScrollView, View } from "react-native";

import { EmptyNotice } from "@/components/activity/EmptyNotice";
import { ThumbRow } from "@/components/activity/ThumbRow";
import { useBottomNavInset } from "@/components/nav/BottomNav";
import { useChromeScroll } from "@/components/nav/ChromeProvider";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Text } from "@/components/ui/Text";
import { useMyTalents, type MyTalent } from "@/hooks/usePortfolio";

const STATUS_LABEL: Record<string, string> = { draft: "Draft", archived: "Archived", cancelled: "Cancelled" };
const SOURCE_LABEL: Record<MyTalent["source"], string> = {
  manual: "Created manually",
  auto_project: "Started from a project",
  auto_collaboration: "Started from a collaboration",
};

function TalentRow({ talent }: { talent: MyTalent }) {
  return (
    <ThumbRow
      onPress={() => router.push(`/projects/${talent.id}/edit` as Href)}
      thumbnailUrl={talent.thumbnail_url}
      fallbackIcon={Briefcase}
      title={talent.title}
      subtitle={`${talent.role_label ?? "No role set"}${talent.status !== "active" ? ` · ${STATUS_LABEL[talent.status] ?? talent.status}` : ""}`}
      trailing={
        !talent.is_complete ? (
          <View className="shrink-0 rounded-full bg-accent-soft px-2.5 py-1">
            <Text className="text-[11px] font-medium text-accent">Finish setup</Text>
          </View>
        ) : undefined
      }
    />
  );
}

function groupTalents(talents: MyTalent[]) {
  const incomplete = talents.filter((g) => !g.is_complete);
  const byCategory = new Map<string, MyTalent[]>();
  for (const talent of talents.filter((g) => g.is_complete)) {
    const key = talent.category ?? "Other";
    byCategory.set(key, [...(byCategory.get(key) ?? []), talent]);
  }
  return { incomplete, byCategory };
}

export function MyTalents() {
  const bottomInset = useBottomNavInset();
  const onScroll = useChromeScroll();
  const { data: talents, isLoading } = useMyTalents();
  const { incomplete, byCategory } = groupTalents(talents ?? []);

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Your Talents" />
      <ScrollView showsHorizontalScrollIndicator={false} ref={onScroll.listRef} onScroll={onScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomInset }}>
        <Text className="mb-6 text-sm text-ink-muted">Every professional identity on your account — one Talent per role.</Text>

        {isLoading ? (
          <Text className="py-10 text-center text-sm text-ink-muted">Loading…</Text>
        ) : !talents || talents.length === 0 ? (
          <EmptyNotice large icon={Briefcase} title="No Talents yet." message="Create one from the + button, or get credited as a collaborator and accept it — either way, it shows up here." />
        ) : (
          <View className="gap-6">
            {incomplete.length > 0 && (
              <View>
                <Text className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">Needs attention</Text>
                <View className="gap-2">
                  {incomplete.map((talent) => (
                    <View key={talent.id}>
                      <TalentRow talent={talent} />
                      {talent.source !== "manual" && <Text className="mt-1 px-1 text-[11px] text-ink-muted">{SOURCE_LABEL[talent.source]}</Text>}
                    </View>
                  ))}
                </View>
              </View>
            )}
            {[...byCategory.entries()].map(([category, categoryTalents]) => (
              <View key={category}>
                <Text className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">{category}</Text>
                <View className="gap-2">
                  {categoryTalents.map((talent) => (
                    <TalentRow key={talent.id} talent={talent} />
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
