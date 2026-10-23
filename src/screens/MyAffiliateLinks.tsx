// src/screens/MyAffiliateLinks.tsx
// Projects you've forked to earn a commission on: your link, clicks, sales, pending and paid commission.
// Mounted at both /activity/affiliates and /wallet/affiliate-links.
//
//   • Header — Library/Connect's bold title and orange icon (with a back arrow: this screen lives under Wallet).
//   • Hero   — one premium summary card: total earned as the headline, pending/paid beneath, then the
//              forks / clicks / sales / conversion strip. Brand-green with soft glows and white type.
//   • Tabs   — Active / Revoked on the shared SlidingTabBar + SwipeableTabs carousel.
//   • Cards  — ForkedProjectCard: cover, title, commission rate, a four-up stat grid and a Copy / Share action.
//              Connect keeps using the compact AffiliateLinkRow.
import { isFileType } from "@/lib/fileProject";
import { FileFolderIcon } from "@/components/project/FileFolderArt";
import { router, type Href } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { Check, Copy, GitFork, Image as ImageIcon, MousePointerClick, Share2, ShoppingBag, Sparkles, TrendingUp, type LucideIcon } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, Share, View } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyNotice } from "@/components/activity/EmptyNotice";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SlidingTabBar } from "@/components/ui/SlidingTabBar";
import { SwipeableTabs } from "@/components/ui/SwipeableTabs";
import { Icon, Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { affiliateLinkFor, useAffiliateDashboard, useCurrentCommissionPct, useAffiliateTotals, useMyAffiliateRelationships, type AffiliateRelationshipWithProject } from "@/hooks/useAffiliates";
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

function HeroStat({ icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <View className="min-w-0 flex-1 rounded-2xl bg-white/15 px-3 py-2.5">
      <Icon as={icon} size={14} className="mb-1.5 text-white/70" />
      <Text numberOfLines={1} className="text-lg font-semibold leading-none text-white">
        {value}
      </Text>
      <Text numberOfLines={1} className="mt-1 text-[11px] text-white/70">
        {label}
      </Text>
    </View>
  );
}

function AffiliateHero({ forks, clicks, sales, pending, paid, loading }: { forks: number; clicks: number; sales: number; pending: number; paid: number; loading: boolean }) {
  const earned = pending + paid;
  const conversion = clicks > 0 ? Math.min(100, (sales / clicks) * 100) : 0;
  return (
    <View accessibilityLabel="Affiliate earnings summary" className="mb-5 overflow-hidden rounded-3xl bg-accent-hover p-5">
      {/* soft light blooms — purely decorative */}
      <View pointerEvents="none" className="absolute -right-10 -top-16 h-48 w-48 rounded-full bg-white/10" />
      <View pointerEvents="none" className="absolute -bottom-20 -left-12 h-52 w-52 rounded-full bg-brand-orange/20" />

      <View className="flex-row items-center gap-1.5">
        <Icon as={Sparkles} size={13} className="text-white/75" />
        <Text className="text-xs font-medium uppercase tracking-[2px] text-white/75">Total earned</Text>
      </View>
      <Text className="mt-2 text-[40px] font-semibold leading-[44px] tracking-tight text-white">{loading ? "…" : formatUsd(earned)}</Text>
      <Text className="mt-2 text-sm text-white/75">
        {formatUsd(pending)} pending • {formatUsd(paid)} paid
      </Text>

      <View className="mt-5 flex-row gap-2">
        <HeroStat icon={GitFork} label="Forks" value={String(forks)} />
        <HeroStat icon={MousePointerClick} label="Clicks" value={String(clicks)} />
        <HeroStat icon={ShoppingBag} label="Sales" value={String(sales)} />
        <HeroStat icon={TrendingUp} label="Convert" value={`${conversion >= 10 ? Math.round(conversion) : conversion.toFixed(1)}%`} />
      </View>
    </View>
  );
}

function CardStat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View className="min-w-0 flex-1 items-center">
      <Text numberOfLines={1} className={`text-sm ${strong ? "font-semibold text-accent" : "font-medium text-ink"}`}>
        {value}
      </Text>
      <Text className="mt-0.5 text-[10px] uppercase tracking-wide text-ink-muted">{label}</Text>
    </View>
  );
}

function ForkedProjectCard({ relationship }: { relationship: AffiliateRelationshipWithProject }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const revoked = relationship.status === "revoked";
  const { data: dashboard } = useAffiliateDashboard(revoked ? undefined : relationship.id);
  const { data: commissionPct } = useCurrentCommissionPct(relationship.affiliate_program_id);
  const project = relationship.project;
  if (!project) return null;

  const link = affiliateLinkFor(getProjectUrl(project), relationship.referral_token);
  const shortLink = link.replace(/^https?:\/\//, "");
  const sales = dashboard?.completed_sales ?? 0;
  const isBook = project.project_type === "book";

  async function handleCopy() {
    try {
      await Clipboard.setStringAsync(link);
      haptics.success();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast("Link copied.", { variant: "success" });
    } catch {
      /* clipboard unavailable */
    }
  }

  async function handleShare() {
    try {
      await Share.share({ message: link, url: link, title: project?.title });
    } catch {
      /* dismissed */
    }
  }

  return (
    <View className={`overflow-hidden rounded-2xl border border-border bg-surface ${revoked ? "opacity-70" : ""}`}>
      <Pressable onPress={() => router.push(`/projects/${relationship.project_id}` as Href)} accessibilityRole="link" accessibilityLabel={project.title} className="flex-row items-center gap-3.5 p-3.5">
        <View className={`${isBook ? "h-[84px] w-14" : "h-[72px] w-[72px]"} shrink-0 items-center justify-center overflow-hidden rounded-xl bg-canvas`}>
          {isFileType(project.project_type) ? <FileFolderIcon size={56} fill /> : project.thumbnail_url ? <Image source={project.thumbnail_url} contentFit="cover" className="h-full w-full" /> : <Icon as={ImageIcon} size={20} className="text-ink-muted" />}
        </View>
        <View className="min-w-0 flex-1">
          <Text numberOfLines={2} className="text-[15px] font-semibold leading-snug text-ink">
            {project.title}
          </Text>
          <View className="mt-1.5 flex-row flex-wrap items-center gap-1.5">
            <Text className="text-xs text-ink-muted">{formatUsd(getEffectivePrice(project))}</Text>
            {revoked ? (
              <View className="rounded-full border border-border bg-canvas px-2 py-0.5">
                <Text className="text-[11px] font-medium text-ink-muted">Revoked</Text>
              </View>
            ) : commissionPct != null ? (
              <View className="flex-row items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5">
                <Icon as={GitFork} size={10} className="text-accent" />
                <Text className="text-[11px] font-semibold text-accent">{Math.round(commissionPct * 1000) / 10}% commission</Text>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>

      {!revoked ? (
        <>
          <View className="flex-row border-y border-border bg-canvas/50 py-2.5">
            <CardStat label="Clicks" value={String(dashboard?.clicks ?? 0)} />
            <CardStat label="Sales" value={String(sales)} />
            <CardStat label="Pending" value={formatUsd(dashboard?.pending_commission ?? 0)} />
            <CardStat label="Paid" value={formatUsd(dashboard?.paid_commission ?? 0)} strong />
          </View>

          <View className="flex-row items-center gap-2 p-3">
            <Pressable onPress={() => void handleCopy()} accessibilityRole="button" accessibilityLabel="Copy affiliate link" className="h-10 min-w-0 flex-1 flex-row items-center gap-2 rounded-xl border border-border bg-canvas px-3">
              <Icon as={copied ? Check : Copy} size={14} className={copied ? "text-accent" : "text-ink-muted"} />
              <Text numberOfLines={1} className="flex-1 text-xs text-ink-muted">
                {copied ? "Copied" : shortLink}
              </Text>
            </Pressable>
            <Pressable onPress={() => void handleShare()} accessibilityRole="button" accessibilityLabel="Share affiliate link" className="h-10 shrink-0 flex-row items-center gap-1.5 rounded-xl bg-cta px-4 active:opacity-85">
              <Icon as={Share2} size={14} className="text-white" />
              <Text className="text-sm font-semibold text-white">Share</Text>
            </Pressable>
          </View>
        </>
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

  function renderPane(t: AffiliateTab) {
    const rows = t === "active" ? active : revoked;
    if (rows.length === 0) {
      return <EmptyNotice icon={GitFork} message={t === "active" ? 'Projects you fork show up here. Tap "Fork & earn" on a project to start.' : "Nothing revoked."} />;
    }
    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 24 }}>
        <View className="gap-3.5">
          {rows.map((r) => (
            <ForkedProjectCard key={r.id} relationship={r} />
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
          <View className="px-4 pt-2">
            <AffiliateHero forks={visible.length} clicks={totals.clicks} sales={totals.sales} pending={totals.pending} paid={totals.paid} loading={totals.loading} />
          </View>
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
