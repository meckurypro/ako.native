// src/components/page/PageTemplateLayout.tsx
// Draws a Page's cover, identity and landing sections according to the page's template
// (see lib/pageTemplates.ts). PagePage hands over ready-made pieces — the name, the action buttons, the hero
// slideshow — and this decides where each one goes, how big it is and how it is framed. It owns no data.
// (Mirrors the web component of the same name.)
import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";

import { Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import type { ActionsMode, PageTemplateConfig, SectionKey } from "@/lib/pageTemplates";
import type { Page } from "@/types/database";

const RADIUS = { circle: 0.5, squircle: 0.28, square: 0.08 } as const;
const BANNER_ASPECT = { standard: 8 / 3, tall: 4 / 5, strip: 5 / 1 } as const;
const GAP = { tight: "gap-6", cozy: "gap-9", airy: "gap-12" } as const;
const TOP = { tight: "mt-6", cozy: "mt-8", airy: "mt-10" } as const;

// Stacked translucent bands stand in for a gradient (no gradient dependency in the app).
function Scrim({ position, height, alphas }: { position: "top" | "bottom"; height: number | string; alphas: number[] }) {
  return (
    <View pointerEvents="none" className={`absolute inset-x-0 ${position === "top" ? "top-0" : "bottom-0"}`} style={{ height: height as number }}>
      {(position === "top" ? alphas : [...alphas].reverse()).map((a, i) => (
        <View key={i} style={{ flex: 1, backgroundColor: `rgba(0,0,0,${a})` }} />
      ))}
    </View>
  );
}

export function SectionHeading({ cfg, n, children }: { cfg: PageTemplateConfig; n?: number; children: string }) {
  const center = cfg.centered ? "text-center" : "";
  switch (cfg.headings) {
    case "eyebrow":
      return (
        <Text accessibilityRole="header" className={`text-xs font-semibold uppercase tracking-[2px] text-accent ${center}`}>
          {children}
        </Text>
      );
    case "numbered":
      return (
        <View className="flex-row items-center gap-3">
          <Text className="font-display text-sm text-ink-muted">{String(n ?? 1).padStart(2, "0")}</Text>
          <Text accessibilityRole="header" className="font-display text-2xl font-semibold tracking-tight text-ink">
            {children}
          </Text>
          <View className="h-px flex-1 bg-border" />
        </View>
      );
    case "rule":
      return (
        <View className="border-b border-border pb-2">
          <Text accessibilityRole="header" className={`text-[11px] font-semibold uppercase tracking-[2.5px] text-ink-muted ${center}`}>
            {children}
          </Text>
        </View>
      );
    default:
      return (
        <Text accessibilityRole="header" className={`font-display text-xl font-semibold tracking-tight text-ink ${center}`}>
          {children}
        </Text>
      );
  }
}

function About({ cfg, bio, n }: { cfg: PageTemplateConfig; bio: string; n: number }) {
  const [open, setOpen] = useState(false);
  const center = cfg.centered ? "text-center" : "";
  const long = cfg.about === "clamp" && bio.length > 140;
  return (
    <View>
      <SectionHeading cfg={cfg} n={n}>
        About
      </SectionHeading>
      <Text
        numberOfLines={long && !open ? 3 : undefined}
        className={`mt-2 text-ink ${cfg.about === "lead" ? "font-display text-lg leading-relaxed" : "text-[15px] leading-relaxed"} ${center}`}
      >
        {bio}
      </Text>
      {long ? (
        <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" hitSlop={8}>
          <Text className="mt-1 text-sm font-medium text-accent">{open ? "Show less" : "Read more"}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export interface PageTemplateLayoutProps {
  page: Page;
  cfg: PageTemplateConfig;
  /** Back / create / options row. `dark` = it sits over an image (glass buttons); otherwise plain buttons. */
  topControls: (dark: boolean) => ReactNode;
  /** The page name as a (possibly menu-opening) heading. Receives the text classes to use. */
  renderName: (className: string) => ReactNode;
  renderActions: (tone: "normal" | "overlay", layout: ActionsMode) => ReactNode;
  verified: ReactNode;
  handleLine: string;
  tagline: string | null;
  parentLine: ReactNode;
  followers: ReactNode;
  website: ReactNode;
  visitorNotice: ReactNode;
  /** The hero slideshow (already framed), or null. */
  hero: ReactNode;
  team: (heading: ReactNode) => ReactNode;
  subsidiaries: ReactNode;
  onViewAvatar?: () => void;
}

export function PageTemplateLayout(p: PageTemplateLayoutProps) {
  const { cfg, page } = p;
  const hasCover = !!page.cover_url;
  const overlay = cfg.identity === "over-left" || cfg.identity === "over-center";
  const hasBanner = cfg.banner === "standard" || cfg.banner === "tall" || cfg.banner === "strip";
  const center = cfg.identity === "over-center" || cfg.identity === "stack-center" || cfg.identity === "masthead";

  const avatarBox = (px: number, ring: boolean) => {
    const radius = px * RADIUS[cfg.avatarShape];
    const inner = page.avatar_url ? (
      <Image source={{ uri: page.avatar_url }} contentFit="cover" style={{ width: px, height: px, borderRadius: radius }} />
    ) : (
      <View style={{ width: px, height: px, borderRadius: radius }} className="items-center justify-center bg-accent-soft">
        <Text style={{ fontSize: px * 0.34 }} className="font-medium text-accent">
          {page.name
            .split(" ")
            .map((w) => w[0])
            .slice(0, 2)
            .join("")
            .toUpperCase()}
        </Text>
      </View>
    );
    return (
      <View style={ring ? { padding: 4, borderRadius: radius + 4 } : undefined} className={ring ? "bg-canvas" : ""}>
        {inner}
      </View>
    );
  };

  const nameCls = (size: string) => `font-display font-semibold leading-tight ${size} ${cfg.uppercaseName ? "uppercase tracking-[1px]" : "tracking-tight"}`;

  const statsBlock = (tone: "normal" | "overlay", justify: string) => {
    if (cfg.stats === "none") return null;
    if (cfg.stats === "tiles") {
      return (
        <View className="mt-4 flex-row gap-2">
          <View className="flex-1 rounded-2xl border border-border bg-surface px-4 py-3">{p.followers}</View>
          {p.website ? <View className="min-w-0 flex-1 rounded-2xl border border-border bg-surface px-4 py-3">{p.website}</View> : null}
        </View>
      );
    }
    return (
      <View className={`mt-4 flex-row flex-wrap items-center gap-x-5 gap-y-2 ${justify}`} style={tone === "overlay" ? { opacity: 0.95 } : undefined}>
        {p.followers}
        {p.website}
      </View>
    );
  };

  // ── cover ──
  let top: ReactNode = null;
  if (hasBanner) {
    const dark = true;
    top = (
      <View className="w-full overflow-hidden bg-accent-soft" style={{ aspectRatio: BANNER_ASPECT[cfg.banner as "standard" | "tall" | "strip"] }}>
        {hasCover ? (
          <Image source={{ uri: page.cover_url! }} contentFit="cover" style={{ width: "100%", height: "100%" }} />
        ) : (
          <View className="h-full w-full" style={{ backgroundColor: overlay ? "#17171b" : undefined }} />
        )}
        <Scrim position="top" height={96} alphas={[0.34, 0.24, 0.14, 0.06]} />
        <View className="absolute inset-x-0 top-0">{p.topControls(dark)}</View>
        {overlay ? (
          <>
            <Scrim position="bottom" height="70%" alphas={[0.08, 0.16, 0.3, 0.46, 0.64, 0.8]} />
            <View className={`absolute inset-x-0 bottom-0 px-4 pb-5 ${center ? "items-center" : ""}`}>
              <View className={center ? "items-center" : "flex-row items-end gap-3"}>
                {avatarBox(cfg.avatarSize, false)}
                <View className={`min-w-0 ${center ? "mt-3 items-center" : "shrink pb-0.5"}`}>
                  {p.renderName(`${nameCls(center ? "text-4xl" : "text-[28px]")} text-white`)}
                  <View className={`mt-1 flex-row flex-wrap items-center gap-x-2 ${center ? "justify-center" : ""}`}>
                    {p.verified}
                    <Text className="text-sm" style={{ color: "rgba(255,255,255,0.8)" }}>
                      {p.handleLine}
                    </Text>
                  </View>
                </View>
              </View>
              {p.tagline ? (
                <Text className={`mt-2 text-base leading-snug ${center ? "text-center" : ""}`} style={{ color: "rgba(255,255,255,0.9)" }}>
                  {p.tagline}
                </Text>
              ) : null}
              {statsBlock("overlay", center ? "justify-center" : "")}
              <View className={`mt-4 ${center ? "items-center" : ""}`}>{p.renderActions("overlay", cfg.actions)}</View>
            </View>
          </>
        ) : null}
      </View>
    );
  } else if (cfg.banner === "backdrop") {
    top = (
      <View pointerEvents="none" className="absolute inset-x-0 top-0 overflow-hidden" style={{ height: 320 }}>
        {hasCover ? <Image source={{ uri: page.cover_url! }} contentFit="cover" blurRadius={40} style={{ width: "100%", height: "100%", opacity: 0.5 }} /> : <View className="h-full w-full bg-accent-soft" />}
      </View>
    );
  }

  // ── identity ──
  let identity: ReactNode = null;
  if (!overlay) {
    const align = center ? "items-center" : "";
    const meta = (
      <View className={align}>
        {p.verified ? <View className="mt-1">{p.verified}</View> : null}
        <Text className={`mt-1 text-sm text-ink-muted ${center ? "text-center" : ""}`}>{p.handleLine}</Text>
        {p.tagline ? <Text className={`mt-2 text-base leading-snug text-ink ${center ? "text-center" : ""}`}>{p.tagline}</Text> : null}
        {p.parentLine}
      </View>
    );

    if (cfg.identity === "overlap-left") {
      identity = (
        <View className="px-4">
          <View className="-mt-12 flex-row items-end justify-between gap-3">
            {avatarBox(cfg.avatarSize, true)}
            {cfg.actions === "side" ? <View className="pb-1">{p.renderActions("normal", "side")}</View> : null}
          </View>
          <View className="mt-3 self-start">{p.renderName(nameCls("text-[28px] text-ink"))}</View>
          {meta}
          {cfg.actions !== "side" ? <View className="mt-4">{p.renderActions("normal", cfg.actions)}</View> : null}
          {statsBlock("normal", "")}
        </View>
      );
    } else if (cfg.identity === "inline") {
      const compact = cfg.avatarSize <= 56;
      const onStrip = cfg.banner === "strip";
      identity = (
        <View className={`px-4 ${onStrip ? "" : "pt-4"}`}>
          <View className="flex-row items-start gap-4">
            <View style={onStrip ? { marginTop: -36 } : undefined}>{avatarBox(cfg.avatarSize, onStrip)}</View>
            <View className={`min-w-0 flex-1 ${onStrip ? "pt-2" : ""}`}>
              {p.renderName(nameCls(`${compact ? "text-xl" : "text-2xl"} text-ink`))}
              {p.verified ? <View className="mt-0.5">{p.verified}</View> : null}
              <Text className="mt-0.5 text-sm text-ink-muted">{p.handleLine}</Text>
            </View>
            {cfg.actions === "row" && compact ? <View className="shrink-0">{p.renderActions("normal", "row")}</View> : null}
          </View>
          {p.tagline ? <Text className="mt-3 text-base leading-snug text-ink">{p.tagline}</Text> : null}
          {p.parentLine}
          {statsBlock("normal", "")}
          {!(cfg.actions === "row" && compact) ? <View className="mt-4">{p.renderActions("normal", cfg.actions)}</View> : null}
        </View>
      );
    } else if (cfg.identity === "stack-center") {
      identity = (
        <View className="items-center px-4 pt-6">
          {avatarBox(cfg.avatarSize, true)}
          <View className="mt-4 items-center">{p.renderName(nameCls("text-3xl text-ink text-center"))}</View>
          {meta}
          {statsBlock("normal", "justify-center")}
          <View className="mt-5 self-stretch">{p.renderActions("normal", cfg.actions)}</View>
        </View>
      );
    } else {
      identity = (
        <View className="px-4 pt-3">
          <View className="items-center border-y-2 border-ink py-6">
            {avatarBox(cfg.avatarSize, false)}
            <View className="mt-4 items-center">{p.renderName(nameCls("text-4xl text-ink text-center"))}</View>
            {p.verified ? <View className="mt-1">{p.verified}</View> : null}
            <Text className="mt-2 text-xs font-medium uppercase tracking-[3px] text-ink-muted">{p.handleLine}</Text>
            {p.tagline ? <Text className="mt-3 text-center font-display text-lg italic leading-snug text-ink">{p.tagline}</Text> : null}
            {p.parentLine}
          </View>
          {statsBlock("normal", "justify-center")}
          <View className="mt-4 items-center">{p.renderActions("normal", cfg.actions)}</View>
        </View>
      );
    }
  }

  // ── landing sections ──
  const panel = (key: string, node: ReactNode) =>
    cfg.panels ? (
      <View key={key} className="rounded-3xl border border-border bg-surface p-4">
        {node}
      </View>
    ) : (
      <View key={key}>{node}</View>
    );

  let n = 0;
  const sections: ReactNode[] = [];
  for (const key of cfg.order as SectionKey[]) {
    if (key === "about" && page.bio) {
      n += 1;
      sections.push(panel("about", <About cfg={cfg} bio={page.bio} n={n} />));
    } else if (key === "team") {
      const node = p.team(<SectionHeading cfg={cfg} n={n + 1}>Meet the team</SectionHeading>);
      if (node) {
        n += 1;
        sections.push(panel("team", node));
      }
    } else if (key === "subs" && p.subsidiaries) {
      n += 1;
      sections.push(
        panel(
          "subs",
          <View>
            <SectionHeading cfg={cfg} n={n}>Subsidiaries</SectionHeading>
            {p.subsidiaries}
          </View>
        )
      );
    }
  }

  const heroBlock = p.hero ? <View className={cfg.heroFrame === "bleed" ? "-mx-4" : ""}>{p.hero}</View> : null;
  const needsTopRow = !hasBanner && !(cfg.heroFirst && p.hero);

  return (
    <View className="bg-canvas">
      {top && !hasBanner ? top : null}
      {cfg.heroFirst && p.hero ? (
        <View>
          {p.hero}
          <Scrim position="top" height={96} alphas={[0.34, 0.24, 0.14, 0.06]} />
          <View className="absolute inset-x-0 top-0">{p.topControls(true)}</View>
        </View>
      ) : null}
      {needsTopRow ? p.topControls(false) : null}
      {hasBanner ? top : null}
      {identity}
      <View className={`${TOP[cfg.density]} ${GAP[cfg.density]} px-4 pb-8`}>
        {p.visitorNotice}
        {!cfg.heroFirst ? heroBlock : null}
        {sections}
      </View>
    </View>
  );
}
