// src/screens/MyAffiliateLinks.tsx
// Projects you've forked to earn a commission on: your link, clicks, sales, pending and paid commission.
// Mounted at both /activity/affiliates and /wallet/affiliate-links.
import { router, type Href } from "expo-router";
import { Image as ImageIcon, Share2, TrendingUp } from "lucide-react-native";
import { Pressable, ScrollView, Share, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyNotice } from "@/components/activity/EmptyNotice";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Icon, Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { affiliateLinkFor, useAffiliateDashboard, useMyAffiliateRelationships, type AffiliateRelationshipWithProject } from "@/hooks/useAffiliates";
import { getEffectivePrice } from "@/hooks/useProjects";
import { APP_URL } from "@/lib/config";
import { formatUsd } from "@/lib/money";
import { getProjectUrl } from "@/lib/projectLinks";

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 items-center">
      <Text numberOfLines={1} className="text-sm font-medium text-ink">
        {value}
      </Text>
      <Text className="text-[10px] text-ink-muted">{label}</Text>
    </View>
  );
}

function AffiliateLinkRow({ relationship }: { relationship: AffiliateRelationshipWithProject }) {
  const { data: dashboard } = useAffiliateDashboard(relationship.status === "active" ? relationship.id : undefined);
  const project = relationship.project;
  if (!project) return null;

  async function handleShare() {
    const baseUrl = project ? getProjectUrl(project) : `${APP_URL}/projects/${relationship.project_id}`;
    const link = affiliateLinkFor(baseUrl, relationship.referral_token);
    try {
      // The system share sheet includes "Copy", so it covers both the share and the copy path.
      await Share.share({ message: link, url: link, title: project?.title });
    } catch {
      /* dismissed */
    }
  }

  const open = () => router.push(`/projects/${relationship.project_id}` as Href);

  return (
    <View className="mb-3 rounded-2xl border border-border bg-surface p-4">
      <View className="mb-3 flex-row items-center gap-3">
        <Pressable onPress={open} accessibilityRole="link" accessibilityLabel={project.title} className="h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-canvas">
          {project.thumbnail_url ? <Image source={project.thumbnail_url} contentFit="cover" className="h-full w-full" /> : <Icon as={ImageIcon} size={18} className="text-ink-muted" />}
        </Pressable>
        <Pressable onPress={open} accessibilityRole="link" className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-sm font-medium text-ink">
            {project.title}
          </Text>
          <Text className="text-xs text-ink-muted">{formatUsd(getEffectivePrice(project))}</Text>
        </Pressable>
        {relationship.status === "revoked" ? (
          <Text className="shrink-0 text-xs text-ink-muted">Revoked</Text>
        ) : (
          <Pressable onPress={() => void handleShare()} accessibilityRole="button" accessibilityLabel="Share link" hitSlop={8} className="shrink-0 p-1.5">
            <Icon as={Share2} size={16} className="text-accent" />
          </Pressable>
        )}
      </View>

      {relationship.status === "active" && (
        <View className="flex-row gap-2">
          <MiniStat label="Clicks" value={String(dashboard?.clicks ?? 0)} />
          <MiniStat label="Sales" value={String(dashboard?.completed_sales ?? 0)} />
          <MiniStat label="Pending" value={formatUsd(dashboard?.pending_commission ?? 0)} />
          <MiniStat label="Paid" value={formatUsd(dashboard?.paid_commission ?? 0)} />
        </View>
      )}
    </View>
  );
}

export function MyAffiliateLinks() {
  const insets = useSafeAreaInsets();
  const { data: relationships, isLoading } = useMyAffiliateRelationships();
  const list = relationships ?? [];

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="My affiliate links" />
      {isLoading ? (
        <Text className="px-4 text-sm text-ink-muted">Loading…</Text>
      ) : list.length === 0 ? (
        <EmptyNotice icon={TrendingUp} message={'Projects you fork to earn a commission on will show up here — look for "Share & earn" on any project that has affiliate forking turned on.'} />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 24 }}>
          {list.map((r) => (
            <AffiliateLinkRow key={r.id} relationship={r} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}
