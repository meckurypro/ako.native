// src/components/customPage/CustomPageRenderer.tsx
//
// Renders a Custom Page config. Pure presentation: no data fetching, no routing decisions. The public screen
// (screens/CustomPageView.tsx) and the editor's live preview both use it, so what a person previews is what visitors get.
// Mirrors the web renderer (src/components/customPage/CustomPageRenderer.tsx) — keep the two in step.
//
// Three decisions are kept apart on purpose:
//   • style     — the visual language (minimalist / glass / elegant / midnight / aurora / bold / soft / neo / clay / chrome / mono / organic): surfaces, type, corners, micro-interactions.
//   • template  — the arrangement of sections (showcase / stacked / brochure / spotlight / linkcard / split / portfolio / bento / poster).
//   • animation — how sections arrive (a preset, applied uniformly; never per element).
// Add a style by extending styleTokens(); add a template by adding an entry to LAYOUTS. Neither touches the database —
// design values are just short slugs in the config.
import { router, type Href } from "expo-router";
import { Download, ExternalLink, FileText, Mail, MapPin, MessageCircle, Phone } from "lucide-react-native";
import { useRef, useState, type ReactNode } from "react";
import Svg, { Path } from "react-native-svg";
import { ActivityIndicator, Platform, Pressable, ScrollView, Share, useWindowDimensions, View, type ViewStyle } from "react-native";

import { Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { MediaViewer } from "@/components/post/MediaViewer";
import { useFileDownload } from "@/hooks/useFileDownload";
import { haptics } from "@/lib/haptics";
import { openExternal } from "@/lib/openExternal";
import {
  customPageUrl,
  publicFileUrl,
  resolveDesign,
  resolveShare,
  resolvePalette,
  withAlpha,
  type AnimationId,
  type CustomPageConfig,
  type CustomPageCta,
  type StyleId,
  type TemplateId,
} from "../../lib/customPage";
import { FloatView, GradientFill, Marquee, ShineSweep, StyleBackdrop, useWidth, type Glow } from "./Fx";
import { BottomScrim, GlassBackdrop } from "./Gradients";
import { HeroSlides } from "./HeroSlides";
import { Reveal, RevealContext, useRevealBus } from "./Reveal";

const AKO_ICON_ON_DARK = require("../../../assets/images/app-icon-dark-without-tagline.png");
const AKO_ICON_ON_LIGHT = require("../../../assets/images/app-icon-light-without-tagline.png");

type Palette = ReturnType<typeof resolvePalette>;

export interface CustomPageActions {
  /** A button was tapped. Analytics hook — never required to navigate. */
  onCta?: (cta: CustomPageCta) => void;
  onOpenInquiry?: () => void;
  onMessageOwner?: () => void;
  onDocumentRead?: () => void;
  onDocumentDownload?: () => void;
  /** The share button was used. Analytics hook only. */
  onShare?: () => void;
  /** "Create your own custom page" footer link. */
  onCreateYours?: () => void;
}

interface Props {
  config: CustomPageConfig;
  /** Editor preview: links are inert and the footer link doesn't navigate. */
  preview?: boolean;
  actions?: CustomPageActions;
  /** Used for the footer link's referral attribution. */
  slug?: string;
  /** Space to keep clear of the status bar / home indicator when the page runs edge to edge. */
  safeTop?: number;
  safeBottom?: number;
}

// ── Style tokens ────────────────────────────────────────────────────────────────────────────────────────────
interface Btn {
  backgroundColor: string;
  color: string;
  borderColor: string;
  uppercase?: boolean;
  letterSpacing?: number;
  fontSize?: number;
  borderWidth?: number;
  gradient?: [string, string];
  shadow?: ViewStyle;
}

/** Mix two #RRGGBB colours (t = share of `b`). */
function mix(a: string, b: string, t: number): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const out = [0, 1, 2].map((i) => Math.round(ch(a, i) * (1 - t) + ch(b, i) * t));
  return `#${out.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

interface Tokens {
  glass: boolean;
  pageBg: string;
  text: string;
  muted: string;
  /** Text-component font class for headings / body (see ui/Text). */
  headingFont: string;
  bodyFont: string;
  card: ViewStyle;
  /** Elegant cards carry a second, outer hairline. */
  outerRule?: string;
  radius: number;
  primary: Btn;
  secondary: Btn;
  rule: string;
  backdrop?: { base: string; glows: Glow[]; drift?: boolean };
  /** Ink colour of the hard offset shadow (Neo). */
  hard?: string;
  cardShadow?: ViewStyle;
  /** Light-sweep across the primary button. */
  shine?: boolean;
  float?: boolean;
  btnRadius?: number;
  logoRound?: number;
  headingScale?: number;
  headingTracking?: number;
  /** Press scale for buttons (Clay squishes harder). */
  pressScale?: number;
  /** Per-corner card radii for blob shapes (Organic). */
  cardCorners?: ViewStyle;
}

function styleTokens(style: StyleId, p: Palette): Tokens {
  if (style === "glass") {
    const light = p.onPrimary === "#FFFFFF";
    const tint = light ? "255,255,255" : "0,0,0";
    return {
      glass: true,
      pageBg: p.primary,
      text: p.onPrimary,
      muted: withAlpha(light ? "#FFFFFF" : "#000000", 0.72),
      headingFont: "font-body",
      bodyFont: "font-body",
      card: { backgroundColor: `rgba(${tint},0.13)`, borderWidth: 1, borderColor: `rgba(${tint},0.28)` },
      radius: 24,
      primary: { backgroundColor: p.accent, color: p.onAccent, borderColor: p.accent },
      secondary: { backgroundColor: `rgba(${tint},0.14)`, color: p.onPrimary, borderColor: `rgba(${tint},0.34)` },
      rule: `rgba(${tint},0.28)`,
    };
  }
  if (style === "clay") {
    const darkBg = p.onSecondary === "#FFFFFF";
    return {
      glass: false,
      pageBg: p.secondary,
      backdrop: {
        base: p.secondary,
        glows: [
          { cx: 0.15, cy: 0, r: 0.8, color: p.accent, opacity: 0.22 },
          { cx: 1, cy: 0.4, r: 0.7, color: p.primary, opacity: 0.14 },
        ],
      },
      text: p.onSecondary,
      muted: withAlpha(darkBg ? "#FFFFFF" : "#000000", 0.66),
      headingFont: "font-body",
      bodyFont: "font-body",
      card: { backgroundColor: darkBg ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.8)", borderWidth: 1, borderColor: darkBg ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,1)" },
      cardShadow: darkBg ? undefined : { shadowColor: "#141428", shadowOpacity: 0.2, shadowRadius: 22, shadowOffset: { width: 0, height: 16 }, elevation: 5 },
      radius: 36,
      primary: {
        backgroundColor: p.primary,
        color: p.onPrimary,
        borderColor: "transparent",
        gradient: [mix(p.primary, "#FFFFFF", 0.22), p.primary],
        shadow: { shadowColor: p.primary, shadowOpacity: 0.55, shadowRadius: 16, shadowOffset: { width: 0, height: 12 }, elevation: 7 },
      },
      secondary: {
        backgroundColor: darkBg ? "rgba(255,255,255,0.12)" : "#FFFFFF",
        color: p.onSecondary,
        borderColor: "transparent",
        shadow: darkBg ? undefined : { shadowColor: "#141428", shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
      },
      rule: withAlpha(darkBg ? "#FFFFFF" : "#000000", 0.12),
      btnRadius: 999,
      logoRound: 0.38,
      float: true,
      pressScale: 0.93,
      headingScale: 1.1,
      headingTracking: -0.8,
    };
  }
  if (style === "chrome") {
    const ink = "#1A1D29";
    return {
      glass: false,
      pageBg: "#E3E8F2",
      backdrop: {
        base: "#E3E8F2",
        glows: [
          { cx: 0.18, cy: 0, r: 0.85, color: p.accent, opacity: 0.5 },
          { cx: 0.92, cy: 0.18, r: 0.7, color: "#5AC8FF", opacity: 0.5 },
          { cx: 0.5, cy: 1, r: 0.95, color: "#FF96E1", opacity: 0.42 },
        ],
      },
      text: ink,
      muted: "rgba(26,29,41,0.66)",
      headingFont: "font-body",
      bodyFont: "font-body",
      card: { backgroundColor: "rgba(255,255,255,0.62)", borderWidth: 1, borderColor: "rgba(255,255,255,0.95)" },
      cardShadow: { shadowColor: "#28325A", shadowOpacity: 0.22, shadowRadius: 22, shadowOffset: { width: 0, height: 14 }, elevation: 4 },
      radius: 22,
      primary: {
        backgroundColor: "#CBD1E0",
        color: ink,
        borderColor: "#8F98B0",
        gradient: ["#FDFEFF", "#AFB7CB"],
        shadow: { shadowColor: "#1E2850", shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 5 },
      },
      secondary: { backgroundColor: "rgba(255,255,255,0.45)", color: ink, borderColor: "rgba(255,255,255,0.95)" },
      rule: "rgba(26,29,41,0.18)",
      btnRadius: 999,
      shine: true,
      float: true,
      logoRound: 0.3,
      headingTracking: -0.8,
    };
  }
  if (style === "mono") {
    const dark = p.onSecondary === "#FFFFFF";
    const paper = dark ? "#0A0A0A" : "#F6F6F3";
    const ink = dark ? "#F6F6F3" : "#0A0A0A";
    return {
      glass: false,
      pageBg: paper,
      text: ink,
      muted: withAlpha(ink, 0.6),
      headingFont: "font-body",
      bodyFont: "font-body",
      card: { backgroundColor: "transparent", borderTopWidth: 1, borderColor: ink },
      radius: 0,
      primary: { backgroundColor: ink, color: paper, borderColor: ink, uppercase: true, letterSpacing: 1.6, fontSize: 12 },
      secondary: { backgroundColor: "transparent", color: ink, borderColor: ink, uppercase: true, letterSpacing: 1.6, fontSize: 12 },
      rule: withAlpha(ink, 0.25),
      btnRadius: 0,
      logoRound: 0,
      headingTracking: -1.2,
    };
  }
  if (style === "organic") {
    const darkBg = p.onSecondary === "#FFFFFF";
    const edge = withAlpha(darkBg ? "#FFFFFF" : "#000000", 0.1);
    return {
      glass: false,
      pageBg: p.secondary,
      backdrop: {
        base: p.secondary,
        glows: [
          { cx: 0.92, cy: 0.06, r: 0.8, color: p.accent, opacity: 0.26 },
          { cx: 0, cy: 0.58, r: 0.8, color: p.primary, opacity: 0.16 },
        ],
      },
      text: p.onSecondary,
      muted: withAlpha(darkBg ? "#FFFFFF" : "#000000", 0.64),
      headingFont: "font-display",
      bodyFont: "font-reading",
      card: { backgroundColor: withAlpha(p.primary, darkBg ? 0.22 : 0.07), borderWidth: 1, borderColor: edge },
      cardCorners: { borderTopLeftRadius: 46, borderTopRightRadius: 66, borderBottomRightRadius: 40, borderBottomLeftRadius: 70 },
      radius: 36,
      primary: { backgroundColor: p.primary, color: p.onPrimary, borderColor: p.primary },
      secondary: { backgroundColor: "transparent", color: p.onSecondary, borderColor: withAlpha(darkBg ? "#FFFFFF" : "#000000", 0.28) },
      rule: withAlpha(darkBg ? "#FFFFFF" : "#000000", 0.16),
      btnRadius: 999,
      logoRound: 0.42,
      float: true,
    };
  }
  if (style === "midnight") {
    return {
      glass: false,
      pageBg: "#0B0B10",
      backdrop: {
        base: "#0B0B10",
        glows: [
          { cx: 0.5, cy: 0, r: 0.95, color: p.accent, opacity: 0.34 },
          { cx: 1, cy: 0.62, r: 0.7, color: p.primary, opacity: 0.4 },
        ],
      },
      text: "#F5F5F7",
      muted: "rgba(245,245,247,0.64)",
      headingFont: "font-body",
      bodyFont: "font-body",
      card: { backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
      radius: 22,
      primary: {
        backgroundColor: p.accent,
        color: p.onAccent,
        borderColor: "transparent",
        gradient: [p.accent, mix(p.accent, "#000000", 0.28)],
        shadow: { shadowColor: p.accent, shadowOpacity: 0.55, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
      },
      secondary: { backgroundColor: "rgba(255,255,255,0.06)", color: "#F5F5F7", borderColor: "rgba(255,255,255,0.16)" },
      rule: "rgba(255,255,255,0.12)",
      btnRadius: 999,
      shine: true,
      float: true,
      headingTracking: -0.8,
    };
  }
  if (style === "aurora") {
    const light = p.onPrimary === "#FFFFFF";
    return {
      glass: false,
      pageBg: p.primary,
      backdrop: {
        base: p.primary,
        drift: true,
        glows: [
          { cx: 0.15, cy: 0.08, r: 0.85, color: p.accent, opacity: 0.8 },
          { cx: 0.95, cy: 0.25, r: 0.7, color: p.secondary, opacity: 0.5 },
          { cx: 0.5, cy: 1, r: 0.95, color: p.accent, opacity: 0.5 },
        ],
      },
      text: p.onPrimary,
      muted: withAlpha(light ? "#FFFFFF" : "#000000", 0.78),
      headingFont: "font-body",
      bodyFont: "font-body",
      card: { backgroundColor: light ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.4)", borderWidth: 1, borderColor: "rgba(255,255,255,0.32)" },
      radius: 28,
      primary: {
        backgroundColor: "#FFFFFF",
        color: "#14120F",
        borderColor: "#FFFFFF",
        shadow: { shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
      },
      secondary: { backgroundColor: "rgba(255,255,255,0.16)", color: p.onPrimary, borderColor: "rgba(255,255,255,0.38)" },
      rule: "rgba(255,255,255,0.3)",
      btnRadius: 999,
      shine: true,
      float: true,
      logoRound: 0.32,
      headingTracking: -0.8,
    };
  }
  if (style === "neo") {
    const ink = p.onSecondary === "#FFFFFF" ? "#FFFFFF" : "#14120F";
    return {
      glass: false,
      pageBg: p.secondary,
      text: p.onSecondary,
      muted: withAlpha(ink, 0.7),
      headingFont: "font-body",
      bodyFont: "font-body",
      card: { backgroundColor: p.secondary, borderWidth: 2, borderColor: ink },
      radius: 12,
      primary: { backgroundColor: p.accent, color: p.onAccent, borderColor: ink, borderWidth: 2 },
      secondary: { backgroundColor: p.secondary, color: p.onSecondary, borderColor: ink, borderWidth: 2 },
      rule: ink,
      hard: ink,
      btnRadius: 10,
      logoRound: 0.12,
      headingTracking: -0.5,
    };
  }
  const base = p.onSecondary === "#FFFFFF" ? "#FFFFFF" : "#000000";
  const muted = withAlpha(base, 0.62);
  const rule = withAlpha(base, 0.14);
  if (style === "elegant") {
    return {
      glass: false,
      pageBg: p.secondary,
      text: p.onSecondary,
      muted,
      headingFont: "font-display",
      bodyFont: "font-reading",
      card: { backgroundColor: "transparent", borderWidth: 1, borderColor: p.accent },
      outerRule: rule,
      radius: 2,
      primary: { backgroundColor: p.primary, color: p.onPrimary, borderColor: p.primary, uppercase: true, letterSpacing: 1, fontSize: 13 },
      secondary: { backgroundColor: "transparent", color: p.onSecondary, borderColor: p.onSecondary, uppercase: true, letterSpacing: 1, fontSize: 13 },
      rule: p.accent,
    };
  }
  if (style === "bold") {
    return {
      glass: false,
      pageBg: p.secondary,
      text: p.onSecondary,
      muted,
      headingFont: "font-body",
      bodyFont: "font-body",
      card: { backgroundColor: withAlpha(p.primary, 0.09), borderWidth: 2, borderColor: p.primary },
      radius: 32,
      primary: { backgroundColor: p.primary, color: p.onPrimary, borderColor: p.primary, borderWidth: 2 },
      secondary: { backgroundColor: "transparent", color: p.onSecondary, borderColor: p.primary, borderWidth: 2 },
      rule: p.primary,
      btnRadius: 999,
      logoRound: 0.5,
      headingScale: 1.25,
      headingTracking: -1.4,
    };
  }
  if (style === "soft") {
    const darkBg = p.onSecondary === "#FFFFFF";
    return {
      glass: false,
      pageBg: p.secondary,
      backdrop: { base: p.secondary, glows: [{ cx: 0.5, cy: 0, r: 0.9, color: p.accent, opacity: 0.18 }] },
      text: p.onSecondary,
      muted,
      headingFont: "font-body",
      bodyFont: "font-body",
      card: { backgroundColor: darkBg ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.78)", borderWidth: 1, borderColor: darkBg ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.95)" },
      cardShadow: darkBg ? undefined : { shadowColor: "#141428", shadowOpacity: 0.14, shadowRadius: 24, shadowOffset: { width: 0, height: 14 }, elevation: 4 },
      radius: 30,
      primary: {
        backgroundColor: p.primary,
        color: p.onPrimary,
        borderColor: "transparent",
        gradient: [p.primary, mix(p.primary, p.accent, 0.35)],
        shadow: { shadowColor: p.primary, shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
      },
      secondary: {
        backgroundColor: darkBg ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.9)",
        color: p.onSecondary,
        borderColor: rule,
        shadow: darkBg ? undefined : { shadowColor: "#141428", shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
      },
      rule,
      btnRadius: 999,
      float: true,
      logoRound: 0.34,
      headingTracking: -0.6,
    };
  }
  // minimalist
  return {
    glass: false,
    pageBg: p.secondary,
    text: p.onSecondary,
    muted,
    headingFont: "font-body",
    bodyFont: "font-body",
    card: { backgroundColor: withAlpha(base, 0.035), borderWidth: 1, borderColor: rule },
    radius: 14,
    primary: { backgroundColor: p.primary, color: p.onPrimary, borderColor: p.primary },
    secondary: { backgroundColor: "transparent", color: p.onSecondary, borderColor: rule },
    rule,
  };
}

// ── Pieces ──────────────────────────────────────────────────────────────────────────────────────────────────
interface Ctx {
  config: CustomPageConfig;
  p: Palette;
  t: Tokens;
  style: StyleId;
  animation: AnimationId;
  preview: boolean;
  actions: CustomPageActions;
  safeTop: number;
  safeBottom: number;
}

const buttonRadius = (t: Tokens) => t.btnRadius ?? (t.radius > 20 ? 999 : Math.min(t.radius, 12));

function ctaHref(cta: CustomPageCta, config: CustomPageConfig): string | null {
  switch (cta.action) {
    case "url":
    case "ako":
      return cta.url ?? null;
    case "email":
      return config.contact?.email ? `mailto:${config.contact.email}` : null;
    case "call":
      return config.contact?.phone ? `tel:${config.contact.phone.replace(/[^\d+]/g, "")}` : null;
    case "download":
      return publicFileUrl(cta.file_path, { download: cta.file_name || "download" });
    default:
      return null;
  }
}

function runCta(cta: CustomPageCta, ctx: Ctx) {
  if (ctx.preview) return;
  ctx.actions.onCta?.(cta);
  if (cta.action === "inquiry") return ctx.actions.onOpenInquiry?.();
  if (cta.action === "message") return ctx.actions.onMessageOwner?.();
  const href = ctaHref(cta, ctx.config);
  if (!href) return;
  if (cta.action === "ako") router.push(href as Href);
  else void openExternal(href);
}

function Body({ ctx, className = "", style, children }: { ctx: Ctx; className?: string; style?: object; children: ReactNode }) {
  return (
    <Text className={`${ctx.t.bodyFont} ${className}`} style={[{ color: ctx.t.text }, style]}>
      {children}
    </Text>
  );
}

function Heading({ ctx, children, small, style }: { ctx: Ctx; children: ReactNode; small?: boolean; style?: object }) {
  return (
    <Text
      accessibilityRole="header"
      className={`${ctx.t.headingFont} font-bold`}
      style={[
        {
          color: ctx.t.text,
          fontSize: (small ? 20 : 30) * (small ? 1 : ctx.t.headingScale ?? 1),
          lineHeight: (small ? 26 : 36) * (small ? 1 : ctx.t.headingScale ?? 1),
          letterSpacing: ctx.t.headingTracking ?? -0.3,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

function ButtonFace({ btn, radius, ctx, icon, label, block, pressed, shine }: { btn: Btn; radius: number; ctx: Ctx; icon?: ReactNode; label: string; block?: boolean; pressed?: boolean; shine?: boolean }) {
  const { w, onLayout } = useWidth();
  const hard = ctx.t.hard;
  const core = (
    <View
      style={[
        { borderRadius: radius, width: block ? "100%" : undefined, backgroundColor: btn.gradient ? btn.gradient[0] : btn.backgroundColor },
        btn.shadow,
        hard && pressed ? { transform: [{ translateX: 3 }, { translateY: 3 }] } : null,
      ]}
    >
      <View
        onLayout={onLayout}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          paddingHorizontal: 24,
          paddingVertical: 14,
          borderWidth: btn.borderWidth ?? 1,
          borderRadius: radius,
          backgroundColor: btn.gradient ? undefined : btn.backgroundColor,
          borderColor: btn.borderColor,
          overflow: "hidden",
        }}
      >
        {btn.gradient ? <GradientFill from={btn.gradient[0]} to={btn.gradient[1]} /> : null}
        {shine && w > 0 ? <ShineSweep width={w} /> : null}
        {icon}
        <Text
          className={`${ctx.t.bodyFont} font-semibold`}
          style={{ color: btn.color, fontSize: btn.fontSize ?? 15, letterSpacing: btn.letterSpacing, textTransform: btn.uppercase ? "uppercase" : "none" }}
        >
          {label}
        </Text>
      </View>
    </View>
  );
  if (!hard) return core;
  return (
    <View style={{ paddingRight: 4, paddingBottom: 4, width: block ? "100%" : undefined }}>
      <View pointerEvents="none" style={{ position: "absolute", left: 4, top: 4, right: 0, bottom: 0, borderRadius: radius, backgroundColor: hard }} />
      {core}
    </View>
  );
}

function CtaButton({ cta, primary, ctx, block }: { cta: CustomPageCta; primary: boolean; ctx: Ctx; block?: boolean }) {
  const btn = primary ? ctx.t.primary : ctx.t.secondary;
  const c = btn.color;
  const { busy, start: startDownload } = useFileDownload();
  const isDownload = cta.action === "download";
  const baseIcon =
    cta.action === "download" ? <Download size={17} color={c} /> : cta.action === "email" ? <Mail size={17} color={c} /> : cta.action === "call" ? <Phone size={17} color={c} /> : cta.action === "message" || cta.action === "inquiry" ? <MessageCircle size={17} color={c} /> : cta.action === "url" ? <ExternalLink size={16} color={c} /> : undefined;
  const icon = isDownload && busy ? <ActivityIndicator size="small" color={c} /> : baseIcon;
  return (
    <Pressable
      disabled={busy}
      accessibilityState={{ busy }}
      onPress={() => {
        if (!isDownload) return runCta(cta, ctx);
        if (ctx.preview || busy) return;
        ctx.actions.onCta?.(cta);
        void startDownload(ctaHref(cta, ctx.config));
      }}
      onPressIn={() => {
        if (!ctx.preview && (ctx.t.hard || ctx.t.shine || ctx.t.pressScale)) haptics.light();
      }}
      accessibilityRole="button"
      accessibilityLabel={cta.label}
      style={({ pressed }) => ({
        opacity: ctx.t.hard ? 1 : pressed ? 0.88 : 1,
        transform: ctx.t.hard ? [] : [{ scale: pressed ? ctx.t.pressScale ?? 0.97 : 1 }],
        width: block ? "100%" : undefined,
      })}
    >
      {({ pressed }) => <ButtonFace btn={btn} radius={buttonRadius(ctx.t)} ctx={ctx} icon={icon} label={isDownload && busy ? "Preparing…" : cta.label} block={block} pressed={pressed} shine={primary && ctx.t.shine} />}
    </Pressable>
  );
}

function CtaGroup({ ctx, block, left }: { ctx: Ctx; block?: boolean; left?: boolean }) {
  // A draft can hold a button that has no label yet — never draw an empty pill for it.
  const ctas = (ctx.config.ctas ?? []).filter((c) => c.label.trim());
  if (!ctas.length) return null;
  return (
    <View style={block ? { gap: 12 } : { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: left ? "flex-start" : "center" }}>
      {ctas.map((c, i) => (
        <CtaButton key={c.id} cta={c} primary={i === 0} ctx={ctx} block={block} />
      ))}
    </View>
  );
}

function Card({ ctx, children, center }: { ctx: Ctx; children: ReactNode; center?: boolean }) {
  const inner = <View style={[{ padding: 24, borderRadius: ctx.t.radius }, ctx.t.card, ctx.t.cardCorners, ctx.t.cardShadow, center ? { alignItems: "center" } : null]}>{children}</View>;
  if (ctx.t.hard) {
    return (
      <View style={{ paddingRight: 6, paddingBottom: 6 }}>
        <View pointerEvents="none" style={{ position: "absolute", left: 6, top: 6, right: 0, bottom: 0, borderRadius: ctx.t.radius, backgroundColor: ctx.t.hard }} />
        {inner}
      </View>
    );
  }
  if (!ctx.t.outerRule) return inner;
  return <View style={{ borderWidth: 1, borderColor: ctx.t.outerRule, padding: 4, borderRadius: ctx.t.radius + 2 }}>{inner}</View>;
}

function Logo({ ctx, size = 64, ring }: { ctx: Ctx; size?: number; ring?: boolean }) {
  const url = publicFileUrl(ctx.config.identity?.icon_path);
  if (!url) return null;
  const img = (
    <Image
      source={{ uri: url }}
      style={[
        { width: size, height: size, borderRadius: size * (ring ? 0.5 : ctx.t.logoRound ?? (ctx.style === "elegant" ? 0.06 : 0.25)) },
        ring ? { borderWidth: 4, borderColor: withAlpha(ctx.p.accent, 0.4) } : null,
      ]}
      contentFit="cover"
      accessibilityLabel=""
    />
  );
  return ctx.t.float ? <FloatView>{img}</FloatView> : img;
}

function Intro({ ctx, left }: { ctx: Ctx; left?: boolean }) {
  const intro = ctx.config.identity?.intro?.trim();
  if (!intro) return null;
  return (
    <Body ctx={ctx} style={{ fontSize: 17, lineHeight: 27, textAlign: left ? "left" : "center", maxWidth: 672, alignSelf: left ? "flex-start" : "center" }}>
      {intro}
    </Body>
  );
}

function DocumentCard({ ctx }: { ctx: Ctx }) {
  const { busy, start: startDownload } = useFileDownload();
  const doc = ctx.config.document;
  if (!doc?.path) return null;
  const view = publicFileUrl(doc.path);
  const dl = publicFileUrl(doc.path, { download: doc.file_name || `${doc.title || "document"}.pdf` });
  const radius = buttonRadius(ctx.t);
  return (
    <Card ctx={ctx} center>
      <View style={{ marginBottom: 12, opacity: 0.85 }}>
        <FileText size={34} color={ctx.t.text} />
      </View>
      <Heading ctx={ctx} small style={{ textAlign: "center", marginBottom: 4 }}>
        {doc.title || "Read the document"}
      </Heading>
      <Text className={ctx.t.bodyFont} style={{ color: ctx.t.muted, fontSize: 14, marginBottom: 20, textAlign: "center" }}>
        Open it to read, or save a copy to your phone.
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Read online"
          onPress={() => {
            if (ctx.preview || !view) return;
            ctx.actions.onDocumentRead?.();
            void openExternal(view);
          }}
        >
          <ButtonFace btn={ctx.t.primary} radius={radius} ctx={ctx} icon={<FileText size={17} color={ctx.t.primary.color} />} label="Read online" />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Download"
          accessibilityState={{ busy }}
          disabled={busy}
          onPress={() => {
            if (ctx.preview || !dl || busy) return;
            ctx.actions.onDocumentDownload?.();
            void startDownload(dl);
          }}
        >
          <ButtonFace
            btn={ctx.t.secondary}
            radius={radius}
            ctx={ctx}
            icon={busy ? <ActivityIndicator size="small" color={ctx.t.secondary.color} /> : <Download size={17} color={ctx.t.secondary.color} />}
            label={busy ? "Preparing…" : "Download"}
          />
        </Pressable>
      </View>
    </Card>
  );
}

type GalleryVariant = "grid" | "small" | "big" | "bento";

function Gallery({ ctx, variant = "grid", items: override }: { ctx: Ctx; variant?: GalleryVariant; items?: { path: string; caption?: string }[] }) {
  const items = override ?? ctx.config.gallery ?? [];
  const [open, setOpen] = useState<number | null>(null);
  if (!items.length) return null;
  const urls = items.map((g) => publicFileUrl(g.path)).filter((u): u is string => !!u);
  const radius = variant === "small" ? Math.min(ctx.t.radius, 12) : variant === "grid" ? Math.min(ctx.t.radius, 16) : Math.min(ctx.t.radius + 4, 32);
  const edge = ctx.t.hard ? { borderWidth: 2, borderColor: ctx.t.hard } : null;
  const tile = (g: { path: string; caption?: string }, i: number, width: ViewStyle["width"], aspect: number) => {
    const uri = publicFileUrl(g.path);
    return (
      <Reveal key={`${g.path}-${i}`} animation={ctx.animation} index={i % 6} style={{ width }}>
        <Pressable
          onPress={() => !ctx.preview && setOpen(i)}
          accessibilityRole="imagebutton"
          accessibilityLabel={g.caption || `Open photo ${i + 1}`}
          style={[{ width: "100%", aspectRatio: aspect, overflow: "hidden", borderRadius: radius }, edge]}
        >
          {uri ? <Image source={{ uri }} style={{ width: "100%", height: "100%" }} contentFit="cover" accessibilityLabel={g.caption ?? ""} /> : null}
        </Pressable>
      </Reveal>
    );
  };
  let body: ReactNode;
  if (variant === "bento") {
    // Alternating full-width and half-width rows — a bento rhythm that works on a phone.
    const pattern = [1, 2, 1, 2];
    const rows: { g: { path: string; caption?: string }; i: number }[][] = [];
    for (let k = 0, r = 0; k < items.length; r++) {
      const n = Math.min(pattern[r % pattern.length], items.length - k);
      rows.push(items.slice(k, k + n).map((g, j) => ({ g, i: k + j })));
      k += n;
    }
    body = (
      <View style={{ gap: 10 }}>
        {rows.map((row, ri) => (
          <View key={ri} style={{ flexDirection: "row", justifyContent: "space-between" }}>
            {row.map(({ g, i }) => tile(g, i, row.length === 1 ? "100%" : "48.5%", row.length === 1 ? 1.6 : 1))}
          </View>
        ))}
      </View>
    );
  } else if (variant === "big") {
    body = <View style={{ gap: 14 }}>{items.map((g, i) => tile(g, i, "100%", 4 / 5))}</View>;
  } else {
    const small = variant === "small";
    body = (
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: small ? 8 : 10 }}>
        {items.map((g, i) => tile(g, i, small ? "31.8%" : "48.5%", 1))}
      </View>
    );
  }
  return (
    <>
      {body}
      {open !== null && urls.length > 0 ? <MediaViewer mediaUrls={urls} startIndex={Math.min(open, urls.length - 1)} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function Contact({ ctx }: { ctx: Ctx }) {
  const c = ctx.config.contact ?? {};
  const inquiry = ctx.config.engagement?.inquiry !== false;
  if (!c.email && !c.phone && !c.address && !inquiry) return null;
  const row = (icon: ReactNode, label: string, href: string) => (
    <Pressable
      key={href}
      onPress={() => !ctx.preview && void openExternal(href)}
      accessibilityRole="link"
      accessibilityLabel={label}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 }}
    >
      <View style={{ opacity: 0.8 }}>{icon}</View>
      <Text className={ctx.t.bodyFont} style={{ color: ctx.t.text, fontSize: 15, flex: 1 }}>
        {label}
      </Text>
    </Pressable>
  );
  return (
    <Card ctx={ctx}>
      <Heading ctx={ctx} small>
        Get in touch
      </Heading>
      <View style={{ marginTop: 12 }}>
        {c.email ? row(<Mail size={18} color={ctx.t.text} />, c.email, `mailto:${c.email}`) : null}
        {c.phone ? row(<Phone size={18} color={ctx.t.text} />, c.phone, `tel:${c.phone.replace(/[^\d+]/g, "")}`) : null}
        {c.address ? row(<MapPin size={18} color={ctx.t.text} />, c.address, `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address)}`) : null}
      </View>
      {inquiry ? (
        <Pressable
          onPress={() => !ctx.preview && ctx.actions.onOpenInquiry?.()}
          accessibilityRole="button"
          accessibilityLabel="Send a message"
          style={{ marginTop: 16, alignSelf: "flex-start" }}
        >
          <ButtonFace btn={ctx.t.primary} radius={buttonRadius(ctx.t)} ctx={ctx} icon={<MessageCircle size={17} color={ctx.t.primary.color} />} label="Send a message" />
        </Pressable>
      ) : null}
    </Card>
  );
}

function Footer({ ctx, slug }: { ctx: Ctx; slug?: string }) {
  const copyright = ctx.config.identity?.copyright?.trim();
  return (
    <View style={{ alignItems: "center", paddingTop: 40, paddingHorizontal: 20, paddingBottom: 48 + ctx.safeBottom }}>
      {copyright ? (
        <Text className={ctx.t.bodyFont} style={{ color: ctx.t.muted, fontSize: 12, textAlign: "center", marginBottom: 20 }}>
          {copyright}
        </Text>
      ) : null}
      {/* Fixed by Akọ — not part of the config, so a page owner can't remove or restyle it. */}
      <View style={{ alignItems: "center", gap: 4, paddingTop: 16, borderTopWidth: 1, borderTopColor: ctx.t.rule }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text className={ctx.t.bodyFont} style={{ color: ctx.t.muted, fontSize: 12 }}>
            Powered by
          </Text>
          {/* Icon matches the page's own surface: the dark-surface artwork on dark pages, the light one on light pages. */}
          <Image
            source={ctx.p.onSecondary === "#FFFFFF" ? AKO_ICON_ON_DARK : AKO_ICON_ON_LIGHT}
            accessibilityLabel="Akọ"
            contentFit="contain"
            style={{ height: 16, width: 16 * (ctx.p.onSecondary === "#FFFFFF" ? 1536 / 826 : 1620 / 821) }}
          />
        </View>
        {ctx.preview ? (
          <Text className={ctx.t.bodyFont} style={{ color: ctx.t.text, fontSize: 12, textDecorationLine: "underline" }}>
            Create your own custom page
          </Text>
        ) : (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Create your own custom page"
            hitSlop={10}
            onPress={() => {
              ctx.actions.onCreateYours?.();
              router.push((slug ? `/me/custom-pages?ref=${encodeURIComponent(slug)}` : "/me/custom-pages") as Href);
            }}
          >
            <Text className={ctx.t.bodyFont} style={{ color: ctx.t.text, fontSize: 12, textDecorationLine: "underline" }}>
              Create your own custom page
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function Section({ ctx, i, children, wide }: { ctx: Ctx; i: number; children: ReactNode; wide?: boolean }) {
  return (
    <Reveal animation={ctx.animation} index={i} style={{ paddingHorizontal: 20, width: "100%", maxWidth: wide ? 960 : 768, alignSelf: "center" }}>
      {children}
    </Reveal>
  );
}

// ── Templates ───────────────────────────────────────────────────────────────────────────────────────────────
function Showcase({ ctx, slug }: { ctx: Ctx; slug?: string }) {
  const id = ctx.config.identity ?? {};
  const hero = ctx.config.brand?.hero ?? [];
  const titleBlock = (
    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "flex-end", paddingHorizontal: 24, paddingBottom: 48 }}>
      <BottomScrim />
      <Logo ctx={ctx} size={56} />
      <Text className={`${ctx.t.headingFont} font-bold`} style={{ color: "#fff", fontSize: 32, lineHeight: 38, marginTop: 12, textAlign: "center", textShadowColor: "rgba(0,0,0,0.35)", textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } }}>
        {id.name}
      </Text>
      {id.tagline ? (
        <Text className={ctx.t.bodyFont} style={{ color: "rgba(255,255,255,0.9)", fontSize: 16, marginTop: 8, textAlign: "center", maxWidth: 520 }}>
          {id.tagline}
        </Text>
      ) : null}
    </View>
  );
  return (
    <>
      {hero.length > 0 ? (
        <HeroSlides images={hero} aspectRatio={4 / 5} overlay={titleBlock} />
      ) : (
        <View style={{ paddingHorizontal: 24, paddingTop: 64 + ctx.safeTop, paddingBottom: 40, alignItems: "center", backgroundColor: ctx.p.primary }}>
          <Logo ctx={ctx} size={56} />
          <Text className={`${ctx.t.headingFont} font-bold`} style={{ color: ctx.p.onPrimary, fontSize: 32, lineHeight: 38, marginTop: 12, textAlign: "center" }}>
            {id.name}
          </Text>
          {id.tagline ? (
            <Text className={ctx.t.bodyFont} style={{ color: ctx.p.onPrimary, opacity: 0.9, marginTop: 8, textAlign: "center" }}>
              {id.tagline}
            </Text>
          ) : null}
        </View>
      )}
      <View style={{ gap: 40, paddingTop: 40 }}>
        <Section ctx={ctx} i={0}>
          <Intro ctx={ctx} />
        </Section>
        <Section ctx={ctx} i={1}>
          <CtaGroup ctx={ctx} />
        </Section>
        {ctx.config.document?.path ? (
          <Section ctx={ctx} i={2}>
            <DocumentCard ctx={ctx} />
          </Section>
        ) : null}
        {(ctx.config.gallery?.length ?? 0) > 0 ? (
          <Section ctx={ctx} i={3}>
            <Gallery ctx={ctx} />
          </Section>
        ) : null}
        <Section ctx={ctx} i={4}>
          <Contact ctx={ctx} />
        </Section>
      </View>
      <Footer ctx={ctx} slug={slug} />
    </>
  );
}

function Stacked({ ctx, slug }: { ctx: Ctx; slug?: string }) {
  const id = ctx.config.identity ?? {};
  const hero = ctx.config.brand?.hero ?? [];
  return (
    <>
      <View style={{ gap: 36, paddingTop: 48 + ctx.safeTop }}>
        <Section ctx={ctx} i={0}>
          <View style={{ alignItems: "center", gap: 12 }}>
            <Logo ctx={ctx} size={76} />
            <Heading ctx={ctx} style={{ textAlign: "center" }}>
              {id.name}
            </Heading>
            {id.tagline ? (
              <Text className={ctx.t.bodyFont} style={{ color: ctx.t.muted, fontSize: 16, textAlign: "center", maxWidth: 520 }}>
                {id.tagline}
              </Text>
            ) : null}
          </View>
        </Section>
        {hero.length > 0 ? (
          <Section ctx={ctx} i={1}>
            <HeroSlides images={hero} aspectRatio={16 / 10} />
          </Section>
        ) : null}
        <Section ctx={ctx} i={2}>
          <Intro ctx={ctx} />
        </Section>
        <Section ctx={ctx} i={3}>
          <CtaGroup ctx={ctx} block />
        </Section>
        {ctx.config.document?.path ? (
          <Section ctx={ctx} i={4}>
            <DocumentCard ctx={ctx} />
          </Section>
        ) : null}
        {(ctx.config.gallery?.length ?? 0) > 0 ? (
          <Section ctx={ctx} i={5}>
            <Gallery ctx={ctx} />
          </Section>
        ) : null}
        <Section ctx={ctx} i={6}>
          <Contact ctx={ctx} />
        </Section>
      </View>
      <Footer ctx={ctx} slug={slug} />
    </>
  );
}

function Brochure({ ctx, slug }: { ctx: Ctx; slug?: string }) {
  const id = ctx.config.identity ?? {};
  const hero = ctx.config.brand?.hero ?? [];
  const hasDoc = !!ctx.config.document?.path;
  return (
    <>
      <View style={{ gap: 36, paddingTop: 48 + ctx.safeTop }}>
        <Section ctx={ctx} i={0}>
          <View style={{ alignItems: "center", gap: 8 }}>
            <Logo ctx={ctx} size={52} />
            <Text className={`${ctx.t.bodyFont} font-semibold`} style={{ color: ctx.t.muted, fontSize: 12, letterSpacing: 2.4, textTransform: "uppercase", textAlign: "center" }}>
              {id.name}
            </Text>
            <Heading ctx={ctx} style={{ textAlign: "center", fontSize: 36, lineHeight: 40 }}>
              {id.tagline || id.name}
            </Heading>
          </View>
        </Section>
        <Section ctx={ctx} i={1}>
          {hasDoc ? <DocumentCard ctx={ctx} /> : <CtaGroup ctx={ctx} />}
        </Section>
        {hero.length > 0 ? (
          <Section ctx={ctx} i={2}>
            <HeroSlides images={hero} aspectRatio={16 / 10} />
          </Section>
        ) : null}
        <Section ctx={ctx} i={3}>
          <Intro ctx={ctx} />
        </Section>
        {hasDoc && (ctx.config.ctas?.length ?? 0) > 0 ? (
          <Section ctx={ctx} i={4}>
            <CtaGroup ctx={ctx} />
          </Section>
        ) : null}
        {(ctx.config.gallery?.length ?? 0) > 0 ? (
          <Section ctx={ctx} i={5}>
            <Gallery ctx={ctx} />
          </Section>
        ) : null}
        <Section ctx={ctx} i={6}>
          <Contact ctx={ctx} />
        </Section>
      </View>
      <Footer ctx={ctx} slug={slug} />
    </>
  );
}

function Spotlight({ ctx, slug }: { ctx: Ctx; slug?: string }) {
  const { width, height } = useWindowDimensions();
  const id = ctx.config.identity ?? {};
  const hero = ctx.config.brand?.hero ?? [];
  const hasHero = hero.length > 0;
  const size = Math.min(76, Math.max(44, width * 0.13));
  const ink = hasHero ? "#fff" : ctx.t.text;
  const content = (
    <View style={{ width: "100%", maxWidth: 960, alignSelf: "center" }}>
      <Logo ctx={ctx} size={52} />
      <Text className={`${ctx.t.headingFont} font-bold`} style={{ color: ink, fontSize: size, lineHeight: size * 0.98, letterSpacing: -size * 0.03, marginTop: 16 }}>
        {id.name}
      </Text>
      {id.tagline ? (
        <Text className={ctx.t.bodyFont} style={{ color: hasHero ? "rgba(255,255,255,0.92)" : ctx.t.muted, fontSize: 18, lineHeight: 26, marginTop: 14, maxWidth: 560 }}>
          {id.tagline}
        </Text>
      ) : null}
      <View style={{ marginTop: 24 }}>
        <CtaGroup ctx={ctx} left />
      </View>
    </View>
  );
  return (
    <>
      {hasHero ? (
        <HeroSlides
          images={hero}
          aspectRatio={width / Math.max(560, height * 0.88)}
          overlay={
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "flex-end", paddingHorizontal: 24, paddingBottom: 56 }}>
              <BottomScrim />
              <BottomScrim />
              {content}
            </View>
          }
        />
      ) : (
        <View style={{ minHeight: height * 0.66, justifyContent: "flex-end", paddingHorizontal: 24, paddingTop: 64 + ctx.safeTop, paddingBottom: 48 }}>{content}</View>
      )}
      <View style={{ gap: 44, paddingTop: 48 }}>
        <Section ctx={ctx} i={0}>
          <Intro ctx={ctx} />
        </Section>
        {ctx.config.document?.path ? (
          <Section ctx={ctx} i={1}>
            <DocumentCard ctx={ctx} />
          </Section>
        ) : null}
        {(ctx.config.gallery?.length ?? 0) > 0 ? (
          <Section ctx={ctx} i={2} wide>
            <Gallery ctx={ctx} variant="big" />
          </Section>
        ) : null}
        <Section ctx={ctx} i={3}>
          <Contact ctx={ctx} />
        </Section>
      </View>
      <Footer ctx={ctx} slug={slug} />
    </>
  );
}

function Linkcard({ ctx, slug }: { ctx: Ctx; slug?: string }) {
  const id = ctx.config.identity ?? {};
  const hero = ctx.config.brand?.hero ?? [];
  const col = { width: "100%", maxWidth: 448, alignSelf: "center" } as const;
  return (
    <>
      <View style={{ gap: 28, paddingTop: 56 + ctx.safeTop }}>
        <Section ctx={ctx} i={0}>
          <View style={{ ...col, alignItems: "center", gap: 12 }}>
            <Logo ctx={ctx} size={96} ring />
            <Heading ctx={ctx} style={{ textAlign: "center", marginTop: 4 }}>
              {id.name}
            </Heading>
            {id.tagline ? (
              <Text className={ctx.t.bodyFont} style={{ color: ctx.t.muted, fontSize: 15, textAlign: "center" }}>
                {id.tagline}
              </Text>
            ) : null}
          </View>
        </Section>
        <Section ctx={ctx} i={1}>
          <View style={col}>
            <CtaGroup ctx={ctx} block />
          </View>
        </Section>
        {hero.length > 0 ? (
          <Section ctx={ctx} i={2}>
            <View style={{ ...col, overflow: "hidden", borderRadius: Math.min(ctx.t.radius + 2, 28) }}>
              <HeroSlides images={hero} aspectRatio={16 / 10} />
            </View>
          </Section>
        ) : null}
        <Section ctx={ctx} i={3}>
          <View style={col}>
            <Intro ctx={ctx} />
          </View>
        </Section>
        {ctx.config.document?.path ? (
          <Section ctx={ctx} i={4}>
            <View style={col}>
              <DocumentCard ctx={ctx} />
            </View>
          </Section>
        ) : null}
        {(ctx.config.gallery?.length ?? 0) > 0 ? (
          <Section ctx={ctx} i={5}>
            <View style={col}>
              <Gallery ctx={ctx} variant="small" />
            </View>
          </Section>
        ) : null}
        <Section ctx={ctx} i={6}>
          <View style={col}>
            <Contact ctx={ctx} />
          </View>
        </Section>
      </View>
      <Footer ctx={ctx} slug={slug} />
    </>
  );
}

function Split({ ctx, slug }: { ctx: Ctx; slug?: string }) {
  const { width } = useWindowDimensions();
  const id = ctx.config.identity ?? {};
  const hero = ctx.config.brand?.hero ?? [];
  const hasHero = hero.length > 0;
  const wideScreen = width >= 720;
  const size = Math.min(60, Math.max(38, width * 0.1));
  const image = hasHero ? (
    <Reveal animation={ctx.animation} index={0} style={{ flex: wideScreen ? 1 : undefined, width: wideScreen ? undefined : "100%" }}>
      <View style={[{ overflow: "hidden", borderRadius: Math.max(ctx.t.radius, 18) + 8 }, ctx.t.hard ? { borderWidth: 2, borderColor: ctx.t.hard } : null]}>
        <HeroSlides images={hero} aspectRatio={4 / 5} />
      </View>
    </Reveal>
  ) : null;
  const text = (
    <Reveal animation={ctx.animation} index={1} style={{ flex: wideScreen && hasHero ? 1 : undefined, width: wideScreen && hasHero ? undefined : "100%", gap: 18, alignItems: "flex-start" }}>
      <Logo ctx={ctx} size={60} />
      <Text className={`${ctx.t.headingFont} font-bold`} style={{ color: ctx.t.text, fontSize: size, lineHeight: size * 1.02, letterSpacing: -size * 0.03 }}>
        {id.name}
      </Text>
      {id.tagline ? (
        <Text className={ctx.t.bodyFont} style={{ color: ctx.t.muted, fontSize: 18, lineHeight: 26, maxWidth: 440 }}>
          {id.tagline}
        </Text>
      ) : null}
      <Intro ctx={ctx} left />
      <CtaGroup ctx={ctx} left />
    </Reveal>
  );
  return (
    <>
      <View style={{ paddingHorizontal: 20, paddingTop: 40 + ctx.safeTop, width: "100%", maxWidth: 1100, alignSelf: "center", flexDirection: wideScreen ? "row" : "column", gap: wideScreen ? 48 : 28, alignItems: wideScreen ? "center" : "stretch" }}>
        {wideScreen ? (
          <>
            {text}
            {image}
          </>
        ) : (
          <>
            {image}
            {text}
          </>
        )}
      </View>
      <View style={{ gap: 44, paddingTop: 48 }}>
        {ctx.config.document?.path ? (
          <Section ctx={ctx} i={2}>
            <DocumentCard ctx={ctx} />
          </Section>
        ) : null}
        {(ctx.config.gallery?.length ?? 0) > 0 ? (
          <Section ctx={ctx} i={3} wide>
            <Gallery ctx={ctx} variant="bento" />
          </Section>
        ) : null}
        <Section ctx={ctx} i={4}>
          <Contact ctx={ctx} />
        </Section>
      </View>
      <Footer ctx={ctx} slug={slug} />
    </>
  );
}

function Portfolio({ ctx, slug }: { ctx: Ctx; slug?: string }) {
  const { width } = useWindowDimensions();
  const id = ctx.config.identity ?? {};
  const hero = ctx.config.brand?.hero ?? [];
  const gallery = ctx.config.gallery ?? [];
  const items = gallery.length > 0 ? [...hero.slice(0, 1), ...gallery] : hero;
  const size = Math.min(84, Math.max(40, width * 0.12));
  const hasDoc = !!ctx.config.document?.path;
  return (
    <>
      <View style={{ gap: 36, paddingTop: 56 + ctx.safeTop }}>
        <Section ctx={ctx} i={0} wide>
          <View style={{ gap: 18, alignItems: "flex-start" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Logo ctx={ctx} size={40} />
              <Text className={`${ctx.t.bodyFont} font-semibold`} style={{ color: ctx.t.muted, fontSize: 12, letterSpacing: 2.6, textTransform: "uppercase" }}>
                {id.name}
              </Text>
            </View>
            <Text className={`${ctx.t.headingFont} font-bold`} style={{ color: ctx.t.text, fontSize: size, lineHeight: size * 1.0, letterSpacing: -size * 0.03 }}>
              {id.tagline || id.name}
            </Text>
            <CtaGroup ctx={ctx} left />
          </View>
        </Section>
        {items.length > 0 ? (
          <Section ctx={ctx} i={1} wide>
            <Gallery ctx={ctx} variant="bento" items={items} />
          </Section>
        ) : null}
        <Section ctx={ctx} i={2} wide>
          <View style={{ gap: 24 }}>
            <Intro ctx={ctx} left />
            {hasDoc ? <DocumentCard ctx={ctx} /> : <Contact ctx={ctx} />}
          </View>
        </Section>
        {hasDoc ? (
          <Section ctx={ctx} i={3}>
            <Contact ctx={ctx} />
          </Section>
        ) : null}
      </View>
      <Footer ctx={ctx} slug={slug} />
    </>
  );
}

function Bento({ ctx, slug }: { ctx: Ctx; slug?: string }) {
  const id = ctx.config.identity ?? {};
  const hero = ctx.config.brand?.hero ?? [];
  const hasHero = hero.length > 0;
  const icon = publicFileUrl(id.icon_path);
  const tile = [{ borderRadius: ctx.t.radius, overflow: "hidden" as const }, ctx.t.card, ctx.t.cardCorners, ctx.t.cardShadow];
  const head = (c: string, size: number) => ({ color: c, fontSize: size, lineHeight: size * 1.02, letterSpacing: -size * 0.03 });
  return (
    <>
      <View style={{ paddingHorizontal: 16, paddingTop: 32 + ctx.safeTop, width: "100%", maxWidth: 1000, alignSelf: "center", gap: 12 }}>
        <Reveal animation={ctx.animation} index={0}>
          <View style={{ flexDirection: "row", gap: 12, height: 300 }}>
            <View style={[tile, { flex: 2, justifyContent: "flex-end", padding: 20 }, hasHero ? null : { backgroundColor: ctx.p.accent, borderWidth: 0 }]}>
              {hasHero ? <HeroSlides images={hero} aspectRatio={0.8} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: undefined, height: undefined, aspectRatio: undefined }} /> : null}
              {hasHero ? <BottomScrim /> : null}
              <Text className={`${ctx.t.headingFont} font-bold`} style={head(hasHero ? "#fff" : ctx.p.onAccent, 30)}>
                {id.name}
              </Text>
            </View>
            <View style={{ flex: 1, gap: 12 }}>
              <View style={[tile, { flex: 1, alignItems: "center", justifyContent: "center" }]}>
                {icon ? <Logo ctx={ctx} size={64} /> : <Text className={`${ctx.t.headingFont} font-bold`} style={head(ctx.t.text, 36)}>{(id.name ?? "•").slice(0, 1)}</Text>}
              </View>
              <View style={[tile, { flex: 1, justifyContent: "flex-end", padding: 14, backgroundColor: ctx.p.primary, borderWidth: 0 }]}>
                <Text className={`${ctx.t.bodyFont} font-semibold`} style={{ color: ctx.p.onPrimary, fontSize: 14, lineHeight: 19 }}>
                  {id.tagline || "Welcome"}
                </Text>
              </View>
            </View>
          </View>
        </Reveal>
        <Reveal animation={ctx.animation} index={1}>
          <View style={[tile, { padding: 22, gap: 20 }]}>
            <Intro ctx={ctx} left />
            <CtaGroup ctx={ctx} left />
          </View>
        </Reveal>
        {(ctx.config.gallery?.length ?? 0) > 0 ? (
          <Reveal animation={ctx.animation} index={2}>
            <Gallery ctx={ctx} variant="bento" />
          </Reveal>
        ) : null}
        {ctx.config.document?.path ? (
          <Reveal animation={ctx.animation} index={3}>
            <DocumentCard ctx={ctx} />
          </Reveal>
        ) : null}
        <Reveal animation={ctx.animation} index={4}>
          <Contact ctx={ctx} />
        </Reveal>
      </View>
      <Footer ctx={ctx} slug={slug} />
    </>
  );
}

function Poster({ ctx, slug }: { ctx: Ctx; slug?: string }) {
  const { width } = useWindowDimensions();
  const id = ctx.config.identity ?? {};
  const hero = ctx.config.brand?.hero ?? [];
  const word = id.name ?? "";
  const items = [word, id.tagline || word];
  const big = Math.min(150, Math.max(56, width * 0.19));
  return (
    <>
      <View style={{ marginTop: 24 + ctx.safeTop, backgroundColor: ctx.p.accent, transform: [{ rotate: "-1deg" }, { scale: 1.04 }], overflow: "hidden" }}>
        <Marquee>
          {[0, 1, 2, 3].map((n) =>
            items.map((t, i) => (
              <View key={`${n}-${i}`} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10 }}>
                <Text className={`${ctx.t.headingFont} font-bold`} style={{ color: ctx.p.onAccent, fontSize: 28, paddingHorizontal: 20 }} numberOfLines={1}>
                  {t}
                </Text>
                <Text style={{ color: ctx.p.onAccent, opacity: 0.7, fontSize: 24, paddingHorizontal: 8 }}>✦</Text>
              </View>
            ))
          )}
        </Marquee>
      </View>
      <View style={{ gap: 32, paddingTop: 44 }}>
        <Section ctx={ctx} i={0} wide>
          <View style={{ gap: 14, alignItems: "flex-start" }}>
            <Logo ctx={ctx} size={52} />
            <Text className={`${ctx.t.headingFont} font-bold`} style={{ color: ctx.t.text, fontSize: big, lineHeight: big * 0.88, letterSpacing: -big * 0.04 }}>
              {word}
            </Text>
            {id.tagline ? (
              <Text className={`${ctx.t.bodyFont} font-medium`} style={{ color: ctx.t.muted, fontSize: 20, lineHeight: 28, maxWidth: 480 }}>
                {id.tagline}
              </Text>
            ) : null}
          </View>
        </Section>
        {hero.length > 0 ? (
          <Section ctx={ctx} i={1} wide>
            <View style={{ overflow: "hidden", borderRadius: Math.min(ctx.t.radius + 4, 28), transform: [{ rotate: "-2deg" }], shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 22, shadowOffset: { width: 0, height: 14 }, elevation: 8, marginHorizontal: 8 }}>
              <HeroSlides images={hero} aspectRatio={4 / 3} />
            </View>
          </Section>
        ) : null}
        <Section ctx={ctx} i={2} wide>
          <View style={{ gap: 22, alignItems: "flex-start" }}>
            <Intro ctx={ctx} left />
            <CtaGroup ctx={ctx} left />
          </View>
        </Section>
        {ctx.config.document?.path ? (
          <Section ctx={ctx} i={3}>
            <DocumentCard ctx={ctx} />
          </Section>
        ) : null}
        {(ctx.config.gallery?.length ?? 0) > 0 ? (
          <Section ctx={ctx} i={4} wide>
            <Gallery ctx={ctx} variant="bento" />
          </Section>
        ) : null}
        <Section ctx={ctx} i={5}>
          <Contact ctx={ctx} />
        </Section>
      </View>
      <Footer ctx={ctx} slug={slug} />
    </>
  );
}

// ── Share button ────────────────────────────────────────────────────────────────────────────────────────────
// Optional, creator-controlled (config.share). Mirrors the web ShareButton: the creator picks a position and a look; the
// template decides the exact spot so the button never lands on the title or logo.
//  · top-left / top-right: a corner at the top of the page, scrolls with the content.
//  · bottom-left / bottom-right: floats above the bottom edge (and the home indicator) while the page scrolls.
//  · center: horizontally centred, in whichever of top or bottom is clear in that template.

/** The share glyph (traced from the supplied artwork). */
function ShareIcon({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="97 97 360 360">
      <Path d="M105.6 449.2C140 373.4 197.2 329.9 271.2 323.4L279 322.8L279.2 365.5C279.5 403.7 279.7 408.4 281.1 409.3C282.6 410.2 305.5 390.8 340.5 358.9C342.7 356.9 364.1 337.8 388 316.5C455.2 256.5 457 254.9 457 253.6C457 252.9 438.2 235.5 415.3 214.9C392.3 194.3 370.8 175 367.5 172C364.1 169 353.3 159.3 343.5 150.4C333.6 141.6 316.1 125.9 304.7 115.6C291.7 104 283.2 97 282.2 97.2C280.6 97.5 280.5 101.1 280.2 139.7L280 181.9L275.7 182.4C273.4 182.7 268.8 183.2 265.5 183.5C246.7 185.4 226.1 191.4 207.5 200.5C148 229.4 110.2 292.3 99.3 380.5C97.5 395.3 96.8 448.7 98.3 454.2C99.6 459 101.9 457.5 105.6 449.2Z" fill={color} />
    </Svg>
  );
}

const SHARE_PLACEMENT: Record<TemplateId, { top: number; media?: boolean; center: "top" | "bottom" }> = {
  // Full-bleed hero first: the top floats over the picture and the title sits low, so top-centre is clear.
  showcase: { top: 10, media: true, center: "top" },
  spotlight: { top: 10, media: true, center: "top" },
  // A centred logo and title start right under the top edge, so a centred button goes to the bottom instead.
  stacked: { top: 10, center: "bottom" },
  brochure: { top: 10, center: "bottom" },
  linkcard: { top: 10, center: "bottom" },
  // Left-aligned headers leave the top edge clear.
  split: { top: 10, center: "top" },
  portfolio: { top: 10, center: "top" },
  bento: { top: 10, center: "top" },
  // Poster opens with the scrolling banner (24 margin + ~56 tall), so the button sits just beneath it.
  poster: { top: 24 + 56 + 14, center: "top" },
};

/** Which edge the button lives on for this page. Layout code uses it to mount the button in the right place. */
function shareEdge(config: CustomPageConfig): "top" | "bottom" {
  const { position } = resolveShare(config);
  const template = resolveDesign(config).template;
  return position === "center" ? SHARE_PLACEMENT[template].center : position.startsWith("bottom") ? "bottom" : "top";
}

function ShareButton({ ctx, slug }: { ctx: Ctx; slug?: string }) {
  const { look, position } = resolveShare(ctx.config);
  const template = resolveDesign(ctx.config).template;
  const place = SHARE_PLACEMENT[template];
  const edge = shareEdge(ctx.config);
  const floating = edge === "bottom";
  const side: "left" | "right" | "center" = position === "center" ? "center" : position.endsWith("left") ? "left" : "right";
  const onMedia = !floating && !!place.media && (ctx.config.brand?.hero?.length ?? 0) > 0;
  const name = ctx.config.identity?.name?.trim() || "this page";
  const size = 44;

  const run = async () => {
    if (ctx.preview) return;
    haptics.light();
    ctx.actions.onShare?.();
    const url = slug ? customPageUrl(slug) : "";
    try {
      await Share.share(Platform.OS === "ios" ? { message: name, url } : { title: name, message: url ? `${name}\n${url}` : name });
    } catch {
      /* the sheet failed to open — nothing useful to show */
    }
  };

  const btn = ctx.t.secondary;
  const radius = look === "auto" ? buttonRadius(ctx.t) : 999;
  // Floating over unknown content needs a surface that reads on anything, so round gets the dark glass chip there.
  const dark = onMedia || floating;
  const iconColor = look === "minimal" ? (onMedia ? "#FFFFFF" : ctx.t.text) : look === "round" ? (dark ? "#FFFFFF" : ctx.t.text) : btn.color;
  let surface: ViewStyle;
  if (look === "minimal") surface = { backgroundColor: "transparent" };
  else if (look === "round") surface = { backgroundColor: dark ? "rgba(0,0,0,0.5)" : withAlpha(ctx.t.text, 0.1) };
  else surface = { backgroundColor: btn.gradient ? btn.gradient[0] : btn.backgroundColor, borderWidth: btn.borderWidth ?? 1, borderColor: btn.borderColor, ...btn.shadow };
  const hard = (look === "auto" || look === "pill") ? ctx.t.hard : undefined;
  const lift: ViewStyle | undefined =
    floating && look === "round"
      ? { shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 }
      : floating && look === "minimal"
        ? { shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } }
        : undefined;

  const face = (
    <View
      style={[
        { height: size, minWidth: size, borderRadius: radius, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, paddingHorizontal: look === "pill" ? 16 : 0 },
        surface,
        lift,
      ]}
    >
      <ShareIcon size={look === "minimal" ? 22 : 18} color={iconColor} />
      {look === "pill" ? (
        <Text className={`${ctx.t.bodyFont} font-semibold`} style={{ color: btn.color, fontSize: 14 }}>
          Share
        </Text>
      ) : null}
    </View>
  );

  const vertical = floating ? { bottom: ctx.safeBottom + 18 } : { top: ctx.safeTop + place.top };
  // Centring: stretch a full-width row and let it centre its single child (no measuring needed).
  const horizontal: ViewStyle = side === "left" ? { left: 14 } : side === "right" ? { right: 14 } : { left: 0, right: 0, alignItems: "center" };

  return (
    <View pointerEvents="box-none" style={{ position: "absolute", zIndex: 10, ...vertical, ...horizontal }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Share this page" hitSlop={8} onPress={() => void run()} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
        {hard ? (
          <View style={{ paddingRight: 4, paddingBottom: 4 }}>
            <View pointerEvents="none" style={{ position: "absolute", left: 4, top: 4, right: 0, bottom: 0, borderRadius: radius, backgroundColor: hard }} />
            {face}
          </View>
        ) : (
          face
        )}
      </Pressable>
    </View>
  );
}

const LAYOUTS: Record<TemplateId, (props: { ctx: Ctx; slug?: string }) => ReactNode> = {
  showcase: Showcase,
  stacked: Stacked,
  brochure: Brochure,
  spotlight: Spotlight,
  linkcard: Linkcard,
  split: Split,
  portfolio: Portfolio,
  bento: Bento,
  poster: Poster,
};

export function CustomPageRenderer({ config, preview = false, actions = {}, slug, safeTop = 0, safeBottom = 0 }: Props) {
  const { style, template, animation } = resolveDesign(config);
  const p = resolvePalette(config);
  const t = styleTokens(style, p);
  const ctx: Ctx = { config, p, t, style, animation, preview, actions, safeTop, safeBottom };
  const Layout = LAYOUTS[template];
  const shareOn = resolveShare(config).enabled;
  const edge = shareEdge(config);
  const bus = useRevealBus();
  const contentRef = useRef<View>(null);
  bus.contentRef = contentRef;

  return (
    <View style={{ flex: 1, backgroundColor: t.pageBg }}>
      {t.glass ? <GlassBackdrop primary={p.primary} accent={p.accent} /> : t.backdrop ? <StyleBackdrop base={t.backdrop.base} glows={t.backdrop.glows} drift={t.backdrop.drift} /> : null}
      <RevealContext.Provider value={bus}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          contentInsetAdjustmentBehavior="never"
          onLayout={(e) => bus.see(e.nativeEvent.layout.height)}
          onScroll={(e) => bus.see(e.nativeEvent.contentOffset.y + e.nativeEvent.layoutMeasurement.height)}
        >
          <View ref={contentRef} collapsable={false}>
            <Layout ctx={ctx} slug={slug} />
            {shareOn && edge === "top" ? <ShareButton ctx={ctx} slug={slug} /> : null}
          </View>
        </ScrollView>
        {/* Bottom positions float over the scroller so they stay put while the page moves. */}
        {shareOn && edge === "bottom" ? <ShareButton ctx={ctx} slug={slug} /> : null}
      </RevealContext.Provider>
    </View>
  );
}
