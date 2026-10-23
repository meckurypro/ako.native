// src/screens/MyAffiliateLinks.tsx
// Projects you've forked to earn a commission on: your link, clicks, sales, pending and paid commission.
// Mounted at both /activity/affiliates and /wallet/affiliate-links.
//
// Built from the same parts as Library, Connect and the Profile so it reads as one family:
//   • Header  — Library/Connect's bold title and orange icon (with a back arrow: this screen lives under Wallet).
//   • Summary — the Profile's quiet stat row (number over muted label, no filled card). Lead with the projects;
//               earnings are one stat among four. The Wallet owns the money headline.
//   • Tabs    — Active / Revoked on the shared SlidingTabBar + SwipeableTabs carousel.
//   • Rows    — Library's thumbnail tile, with the share action in the trailing slot where Library puts "remove".
import { isFileType } from "@/lib/fileProject";
import { FileFolderIcon } from "@/components/project/FileFolderArt";
import { router, type Href } from "expo-router";
import { GitFork, Image as ImageIcon, Share2 } from "lucide-react-native";
import { Pressable, ScrollView, Share, View } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyNotice } from "@/components/activity/EmptyNotice";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SlidingTabBar } from "@/components/ui/SlidingTabBar";
import { SwipeableTabs } from "@/components/ui/SwipeableTabs";
import { Icon, Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { affiliateLinkFor, useAffiliateDashboard, useAffiliateTotals, useMyAffiliateRelationships, type AffiliateRelationshipWithProject } from "@/hooks/useAffiliates";
import { getEffectivePrice } from "@/hooks/useProjects";
import { useTabState } from "@/hooks/useTabState";
import { APP_URL } from "@/lib/config";
import { haptics } from "@/lib/haptics";
import { formatUsd } from "@/lib/money";
import { getProjectUrl } from "@/lib/projectLinks";

const TABS = ["active", "revoked"] as const;
type AffiliateTab = (typeof TABS)[number];

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

// Profile's stat idiom: a large semibold figure over a small muted label.
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-0 flex-1">
      <Text numberOfLines={1} className="text-xl font-semibold leading-none text-ink">
        {value}
      </Text>
      <Text className="mt-1.5 text-sm text-ink-muted">{label}</Text>
    </View>
  );
}

export function AffiliateLinkRow({ relationship }: { relationship: AffiliateRelationshipWithProject }) {
  const { data: dashboard } = useAffiliateDashboard(relationship.status === "active" ? relationship.id : undefined);
  const project = relationship.project;
  if (!project) return null;

  const revoked = relationship.status === "revoked";
  const sales = dashboard?.completed_sales ?? 0;

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
    <View className={`rounded-xl border border-border bg-surface ${revoked ? "opacity-70" : ""}`}>
      <View>
        <Pressable onPress={open} accessibilityRole="link" accessibilityLabel={project.title} className="flex-row items-center gap-3 p-3 pr-12">
          <View className={`${project.project_type === "book" ? "h-[72px]" : "h-12"} w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-canvas`}>
            {isFileType(project.project_type) ? <FileFolderIcon size={48} fill /> : project.thumbnail_url ? <Image source={project.thumbnail_url} contentFit="cover" className="h-full w-full" /> : <Icon as={ImageIcon} size={18} className="text-ink-muted" />}
          </View>
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-sm text-ink">
              {project.title}
            </Text>
            <View className="flex-row items-center gap-1">
              <Icon as={GitFork} size={12} className="text-ink-muted" />
              <Text className="text-xs text-ink-muted">
                {formatUsd(getEffectivePrice(project))}
                {revoked ? " · Revoked" : ` · ${sales} ${sales === 1 ? "sale" : "sales"}`}
              </Text>
            </View>
          </View>
        </Pressable>
        {!revoked ? (
          <Pressable onPress={() => void handleShare()} accessibilityRole="button" accessibilityLabel="Share affiliate link" hitSlop={8} className="absolute right-2 top-1/2 -mt-5 h-10 w-10 items-center justify-center rounded-full">
            <Icon as={Share2} size={16} className="text-accent" />
          </Pressable>
        ) : null}
      </View>

      {!revoked ? (
        <View className="flex-row gap-2 border-t border-border px-3 py-2.5">
          <MiniStat label="Clicks" value={String(dashboard?.clicks ?? 0)} />
          <MiniStat label="Sales" value={String(sales)} />
          <MiniStat label="Pending" value={formatUsd(dashboard?.pending_commission ?? 0)} />
          <MiniStat label="Paid" value={formatUsd(dashboard?.paid_commission ?? 0)} />
        </View>
      ) : null}
    </View>
  );
}

export function MyAffiliateLinks() {
  const insets = useSafeAreaInsets();
  const { data: relationships, isLoading } = useMyAffiliateRelationships();
  const [tab, setTab] = useTabState<AffiliateTab>(TABS, "active");
  const activeIndex = Math.max(TABS.indexOf(tab), 0);
  const progress = useSharedValue(activeIndex);

  const visible = (relationships ?? []).filter((r) => !!r.project);
  const active = visible.filter((r) => r.status !== "revoked");
  const revoked = visible.filter((r) => r.status === "revoked");
  const totals = useAffiliateTotals(active.map((r) => r.id));

  const tabLabel: Record<AffiliateTab, string> = {
    active: `Active${active.length ? ` · ${active.length}` : ""}`,
    revoked: `Revoked${revoked.length ? ` · ${revoked.length}` : ""}`,
  };

  // Projects first: how many you've forked and how they're doing. Earnings are one stat among four, the same weight
  // as the rest; the Wallet owns the money headline.
  const summary = (
    <View className="mb-4 flex-row gap-4 border-b border-border pb-4">
      <Stat label="Forked" value={String(visible.length)} />
      <Stat label="Clicks" value={String(totals.clicks)} />
      <Stat label="Sales" value={String(totals.sales)} />
      <Stat label="Earned" value={totals.loading ? "…" : formatUsd(totals.paid + totals.pending)} />
    </View>
  );

  function renderPane(t: AffiliateTab) {
    const rows = t === "active" ? active : revoked;
    if (rows.length === 0) {
      return <EmptyNotice icon={GitFork} message={t === "active" ? 'Projects you fork show up here. Tap "Fork & earn" on a project to start.' : "Nothing revoked."} />;
    }
    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 24 }}>
        <View className="gap-2">
          {rows.map((r) => (
            <AffiliateLinkRow key={r.id} relationship={r} />
          ))}
        </View>
      </ScrollView>
    );
  }

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Forked" icon={GitFork} iconClassName="text-brand-orange" titleClassName="text-[28px] font-bold leading-tight tracking-tight text-ink" />
      {isLoading ? (
        <Text className="px-4 text-sm text-ink-muted">Loading…</Text>
      ) : visible.length === 0 ? (
        <EmptyNotice icon={GitFork} message={'No forked projects yet. Tap "Fork & earn" on a project to start.'} />
      ) : (
        <>
          <View className="px-4 pt-2">{summary}</View>
          <SlidingTabBar className="mx-4 mb-2" tabs={TABS.map((t) => ({ id: t, label: tabLabel[t] }))} activeIndex={activeIndex} progress={progress} onSelect={(i) => setTab(TABS[i])} />
          <SwipeableTabs
            index={activeIndex}
            progress={progress}
            onIndexChange={(i) => {
              haptics.selection();
              setTab(TABS[i]);
            }}
          >
            {TABS.map((t) => (
              <View key={t} style={{ flex: 1 }}>
                {renderPane(t)}
              </View>
            ))}
          </SwipeableTabs>
        </>
      )}
    </View>
  );
}
