// src/screens/MyAffiliateLinks.tsx
// Projects you've forked to earn a commission on: your link, clicks, sales, pending and paid commission.
// Mounted at both /activity/affiliates and /wallet/affiliate-links. Mirrors web's MyAffiliateLinks page:
//
//   • Header — back arrow on its own line, then the orange fork icon + bold "Forked" title and a one-line
//              description (this page lives under Wallet, so the arrow stays).
//   • Hero   — one premium summary card: total earned as the headline, pending/paid beneath, then the
//              forks / clicks / sales / conversion strip. Brand-green gradient with soft glows, white type.
//   • Tabs   — Active / Revoked on the shared SlidingTabBar; swipe anywhere on the page to switch (SwipeToSwitch).
//   • Cards  — ForkedProjectCard: cover, title, commission rate, a four-up stat grid and a Copy / Share action.
//              Connect keeps using the compact AffiliateLinkRow.
//
// Like web, the whole page scrolls as one (hero and tabs scroll away with the cards) and the bottom nav stays up
// (see components/nav/routes.ts).
//
// COLOUR NOTE: opacity-modified classes (`bg-white/15`, `text-white/70`, `bg-canvas/50`) resolve to nothing on device
// (see OverlayPanel), which is what left this screen's tiles, glows and secondary text invisible. Everything
// translucent here is an inline rgba value instead.
import { thumbBoxStyle } from "@/lib/thumbnailSpec";
import { isFileType } from "@/lib/fileProject";
import { FileFolderIcon } from "@/components/project/FileFolderArt";
import { router, type Href } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { ArrowLeft, Check, Copy, GitFork, Image as ImageIcon, MousePointerClick, Share2, ShoppingBag, Sparkles, TrendingUp, type LucideIcon } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, Share, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";

import { useBottomNavInset } from "@/components/nav/BottomNav";
import { useChromeScroll } from "@/components/nav/ChromeProvider";
import { SlidingTabBar } from "@/components/ui/SlidingTabBar";
import { SwipeToSwitch } from "@/components/ui/SwipeToSwitch";
import { Icon, Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { affiliateLinkFor, useAffiliateDashboard, useCurrentCommissionPct, useAffiliateTotals, useMyAffiliateRelationships, type AffiliateRelationshipWithProject } from "@/hooks/useAffiliates";
import { getEffectivePrice } from "@/hooks/useProjects";
import { useSmartBack } from "@/hooks/useSmartBack";
import { useTabState } from "@/hooks/useTabState";
import { APP_URL } from "@/lib/config";
import { haptics } from "@/lib/haptics";
import { formatUsd } from "@/lib/money";
import { getProjectUrl } from "@/lib/projectLinks";
import { useTheme } from "@/theme/ThemeProvider";

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
          <View style={thumbBoxStyle(project, 48)} className="shrink-0 items-center justify-center overflow-hidden rounded-lg bg-canvas">
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

const WHITE = (alpha: number) => `rgba(255,255,255,${alpha})`;
const TABULAR = { fontVariant: ["tabular-nums" as const] };

/** "#RRGGBB" + alpha → rgba(), for theme colours that need transparency (modifier classes don't work on device). */
function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.replace("#", "").slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function HeroStat({ icon: IconComponent, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <View className="min-w-0 flex-1 rounded-2xl px-3 py-2.5" style={{ backgroundColor: WHITE(0.12), borderWidth: 1, borderColor: WHITE(0.15) }}>
      <View className="mb-1.5">
        <IconComponent size={14} color={WHITE(0.7)} />
      </View>
      <Text numberOfLines={1} className="text-lg font-semibold leading-none" style={[{ color: "#FFFFFF" }, TABULAR]}>
        {value}
      </Text>
      <Text numberOfLines={1} className="mt-1 text-[11px]" style={{ color: WHITE(0.7) }}>
        {label}
      </Text>
    </View>
  );
}

/** Web's hero background: a 145° cta → accent-hover gradient with a white bloom top-right and an orange one bottom-left. */
function HeroBackdrop({ width, height, from, to }: { width: number; height: number; from: string; to: string }) {
  const theta = (145 * Math.PI) / 180;
  const dx = Math.sin(theta);
  const dy = -Math.cos(theta);
  const half = (Math.abs(width * dx) + Math.abs(height * dy)) / 2; // CSS gradient-line half-length for this box
  const cx = width / 2;
  const cy = height / 2;
  return (
    <Svg width={width} height={height} style={{ position: "absolute", top: 0, left: 0 }} pointerEvents="none">
      <Defs>
        <LinearGradient id="forkHeroFill" gradientUnits="userSpaceOnUse" x1={cx - dx * half} y1={cy - dy * half} x2={cx + dx * half} y2={cy + dy * half}>
          <Stop offset="0" stopColor={from} />
          <Stop offset="1" stopColor={to} />
        </LinearGradient>
        <RadialGradient id="forkHeroWhite" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.22" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="forkHeroOrange" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#FD5200" stopOpacity="0.165" />
          <Stop offset="1" stopColor="#FD5200" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width={width} height={height} fill="url(#forkHeroFill)" />
      {/* 192px bloom, 64px above / 40px past the right edge; 208px bloom, 80px below / 48px past the left edge. */}
      <Circle cx={width - 56} cy={32} r={96} fill="url(#forkHeroWhite)" />
      <Circle cx={56} cy={height - 24} r={104} fill="url(#forkHeroOrange)" />
    </Svg>
  );
}

function AffiliateHero({ forks, clicks, sales, pending, paid, loading }: { forks: number; clicks: number; sales: number; pending: number; paid: number; loading: boolean }) {
  const { colors } = useTheme();
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const earned = pending + paid;
  const conversion = clicks > 0 ? Math.min(100, (sales / clicks) * 100) : 0;
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!size || Math.abs(size.w - width) > 0.5 || Math.abs(size.h - height) > 0.5) setSize({ w: width, h: height });
  };

  return (
    <View
      accessibilityLabel="Affiliate earnings summary"
      onLayout={onLayout}
      className="mb-6 rounded-3xl"
      style={{ backgroundColor: colors.cta, shadowColor: colors.accent, shadowOpacity: 0.45, shadowRadius: 20, shadowOffset: { width: 0, height: 14 }, elevation: 10 }}
    >
      {/* The clip lives on its own layer so the card's shadow isn't cut off by overflow:hidden. */}
      <View pointerEvents="none" className="absolute inset-0 overflow-hidden rounded-3xl">
        {size ? <HeroBackdrop width={size.w} height={size.h} from={colors.cta} to={colors.accentHover} /> : null}
      </View>

      <View className="p-5">
        <View className="flex-row items-center gap-1.5">
          <Sparkles size={13} color={WHITE(0.75)} />
          <Text className="text-xs font-medium uppercase tracking-[1.68px]" style={{ color: WHITE(0.75) }}>
            Total earned
          </Text>
        </View>
        <Text className="mt-2 text-[40px] font-semibold leading-[40px] tracking-[-1px]" style={[{ color: "#FFFFFF" }, TABULAR]}>
          {loading ? "…" : formatUsd(earned)}
        </Text>
        <View className="mt-2 flex-row flex-wrap items-center">
          <Text className="text-sm" style={[{ color: WHITE(0.75) }, TABULAR]}>
            {formatUsd(pending)} pending
          </Text>
          <Text className="mx-1.5 text-sm" style={{ color: WHITE(0.4) }}>
            •
          </Text>
          <Text className="text-sm" style={[{ color: WHITE(0.75) }, TABULAR]}>
            {formatUsd(paid)} paid
          </Text>
        </View>

        <View className="mt-5 flex-row gap-2">
          <HeroStat icon={GitFork} label="Forks" value={String(forks)} />
          <HeroStat icon={MousePointerClick} label="Clicks" value={String(clicks)} />
          <HeroStat icon={ShoppingBag} label="Sales" value={String(sales)} />
          <HeroStat icon={TrendingUp} label="Convert" value={`${conversion >= 10 ? Math.round(conversion) : conversion.toFixed(1)}%`} />
        </View>
      </View>
    </View>
  );
}

function CardStat({ label, value, strong, divider }: { label: string; value: string; strong?: boolean; divider?: boolean }) {
  return (
    <View className={`min-w-0 flex-1 items-center ${divider ? "border-l border-border" : ""}`}>
      <Text numberOfLines={1} className={`text-sm ${strong ? "font-semibold text-accent" : "font-medium text-ink"}`} style={TABULAR}>
        {value}
      </Text>
      <Text className="mt-0.5 text-[10px] uppercase tracking-wide text-ink-muted">{label}</Text>
    </View>
  );
}

function ForkedProjectCard({ relationship }: { relationship: AffiliateRelationshipWithProject }) {
  const toast = useToast();
  const { colors } = useTheme();
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
    <View
      className={`overflow-hidden rounded-2xl border border-border bg-surface ${revoked ? "opacity-70" : ""}`}
      style={{ shadowColor: `rgb(${colors.shadowInkRgb})`, shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 2 }}
    >
      <Pressable onPress={() => router.push(`/projects/${relationship.project_id}` as Href)} accessibilityRole="link" accessibilityLabel={project.title} className="flex-row items-center gap-3.5 p-3.5">
        <View style={thumbBoxStyle(project, isBook ? 56 : 72)} className="shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-canvas">
          {isFileType(project.project_type) ? <FileFolderIcon size={56} fill /> : project.thumbnail_url ? <Image source={project.thumbnail_url} contentFit="cover" className="h-full w-full" /> : <Icon as={ImageIcon} size={20} className="text-ink-muted" />}
        </View>
        <View className="min-w-0 flex-1">
          <Text numberOfLines={2} className="text-[15px] font-semibold leading-snug text-ink">
            {project.title}
          </Text>
          <View className="mt-1.5 flex-row flex-wrap items-center gap-1.5">
            <Text className="text-xs text-ink-muted" style={TABULAR}>
              {formatUsd(getEffectivePrice(project))}
            </Text>
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
          <View className="flex-row border-y border-border py-2.5" style={{ backgroundColor: withAlpha(colors.canvas, 0.5) }}>
            <CardStat label="Clicks" value={String(dashboard?.clicks ?? 0)} />
            <CardStat label="Sales" value={String(sales)} divider />
            <CardStat label="Pending" value={formatUsd(dashboard?.pending_commission ?? 0)} divider />
            <CardStat label="Paid" value={formatUsd(dashboard?.paid_commission ?? 0)} strong divider />
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

function EmptyForks({ message }: { message: string }) {
  return (
    <View className="mt-16 items-center gap-2">
      <Icon as={GitFork} size={24} className="text-brand-orange" />
      <Text className="text-center text-sm text-ink-muted">{message}</Text>
    </View>
  );
}

export function MyAffiliateLinks() {
  const insets = useSafeAreaInsets();
  const smartBack = useSmartBack();
  const bottomInset = useBottomNavInset();
  const onScroll = useChromeScroll();
  const { data: relationships, isLoading } = useMyAffiliateRelationships();
  const [tab, setTab] = useTabState<AffiliateTab>(TABS, "active");
  const activeIndex = Math.max(TABS.indexOf(tab), 0);

  const visible = (relationships ?? []).filter((r) => !!r.project);
  const active = visible.filter((r) => r.status !== "revoked");
  const revoked = visible.filter((r) => r.status === "revoked");
  const totals = useAffiliateTotals(active.map((r) => r.id));

  const tabLabel: Record<AffiliateTab, string> = {
    active: `Active${active.length ? ` · ${active.length}` : ""}`,
    revoked: `Revoked${revoked.length ? ` · ${revoked.length}` : ""}`,
  };

  function switchTab(i: number) {
    haptics.selection();
    setTab(TABS[i]);
  }

  function renderPane(t: AffiliateTab) {
    const rows = t === "active" ? active : revoked;
    if (rows.length === 0) {
      return <EmptyForks message={t === "active" ? 'Projects you fork show up here. Tap "Fork & earn" on a project to start.' : "Nothing revoked."} />;
    }
    return (
      <View className="gap-3.5">
        {rows.map((r) => (
          <ForkedProjectCard key={r.id} relationship={r} />
        ))}
      </View>
    );
  }

  return (
    <ScrollView
      ref={onScroll.listRef}
      onScroll={onScroll}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
      className="flex-1 bg-canvas"
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: insets.top + 16, paddingBottom: bottomInset }}
    >
      <Pressable onPress={smartBack} accessibilityRole="button" accessibilityLabel="Back" hitSlop={12} className="mb-4 self-start">
        <Icon as={ArrowLeft} size={22} className="text-ink-muted" />
      </Pressable>

      <View className="mb-1 flex-row items-center gap-2.5">
        <Icon as={GitFork} size={24} className="text-brand-orange" />
        <Text className="text-[28px] font-bold leading-tight tracking-tight text-ink">Forked</Text>
      </View>
      <Text className="mb-6 text-sm text-ink-muted">Each fork has your affiliate link. Share it, earn on every sale.</Text>

      {isLoading ? (
        <Text className="text-sm text-ink-muted">Loading…</Text>
      ) : visible.length === 0 ? (
        <EmptyForks message={'No forked projects yet. Tap "Fork & earn" on a project to start.'} />
      ) : (
        <>
          <AffiliateHero forks={visible.length} clicks={totals.clicks} sales={totals.sales} pending={totals.pending} paid={totals.paid} loading={totals.loading} />

          <SlidingTabBar className="mb-5" tabs={TABS.map((t) => ({ id: t, label: tabLabel[t] }))} activeIndex={activeIndex} onSelect={switchTab} />

          <SwipeToSwitch index={activeIndex} count={TABS.length} onIndexChange={switchTab} style={{ minHeight: 320 }}>
            {renderPane(TABS[activeIndex])}
          </SwipeToSwitch>
        </>
      )}
    </ScrollView>
  );
}
