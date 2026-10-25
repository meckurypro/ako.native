// src/components/customPage/CustomPageRenderer.tsx
//
// Renders a Custom Page config. Pure presentation: no data fetching, no routing decisions. The public screen
// (screens/CustomPageView.tsx) and the editor's live preview both use it, so what a person previews is what visitors get.
// Mirrors the web renderer (src/components/customPage/CustomPageRenderer.tsx) — keep the two in step.
//
// Three decisions are kept apart on purpose:
//   • style     — the visual language (minimalist / glass / elegant / midnight / aurora / bold / soft / neo / clay / chrome / mono / organic / forge / noir / nebula / duotone / sand / confetti / skyline / azure / aqua / candy / ultraviolet): surfaces, type, corners, micro-interactions.
//   • template  — the arrangement of sections (showcase / stacked / brochure / spotlight / linkcard / split / portfolio / bento / poster / console / showreel / frame / duo / portrait / arch / banner / diagonal / wave / diamond / float).
//   • animation — how sections arrive (a preset, applied uniformly; never per element).
// Add a style by extending styleTokens(); add a template by adding an entry to LAYOUTS. Neither touches the database —
// design values are just short slugs in the config.
import { router, type Href } from "expo-router";
import { ArrowLeft, ArrowRight, Download, ExternalLink, FileText, Mail, MapPin, MessageCircle, Phone } from "lucide-react-native";
import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import Svg, { ClipPath, Defs, Image as SvgImage, Path } from "react-native-svg";
import { AccessibilityInfo, ActivityIndicator, Image as RNImage, Platform, Pressable, ScrollView, Share, StyleSheet, useWindowDimensions, View, type ViewStyle } from "react-native";

import { Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { MediaViewer } from "@/components/post/MediaViewer";
import { useFileDownload } from "@/hooks/useFileDownload";
import { haptics } from "@/lib/haptics";
import { openExternal } from "@/lib/openExternal";
import {
  LOOK_CSS,
  availableNavTargets,
  customPageUrl,
  isHex,
  publicFileUrl,
  readableOn,
  resolveBackground,
  resolveDesign,
  resolveForeground,
  resolveNav,
  resolveShare,
  resolvePalette,
  shadowGeometry,
  withAlpha,
  type ResolvedForeground,
  type AnimationId,
  type CustomPageConfig,
  type CustomPageCta,
  type StyleId,
  type TemplateId,
} from "../../lib/customPage";
import { animateScroll } from "../../lib/customPageScroll";
import { scaleShapePath } from "../../lib/customPageShapes";
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
  /** True when the visitor is signed in to Akọ — the footer then offers a quiet way back into the app. */
  signedIn?: boolean;
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
  /** Headings in capitals (Forge, Noir Copper, Nebula). */
  headingUpper?: boolean;
  /** Heading colour when it differs from the body text (Noir Copper). */
  headingColor?: string;
  /** Press scale for buttons (Clay squishes harder). */
  pressScale?: number;
  /** Per-corner card radii for blob shapes (Organic). */
  cardCorners?: ViewStyle;
}

function styleTokens(style: StyleId, p: Palette): Tokens {
  if (style === "forge") {
    return {
      glass: false,
      pageBg: "#121214",
      backdrop: { base: "#121214", glows: [{ cx: 0.9, cy: 0, r: 0.8, color: p.accent, opacity: 0.3 }, { cx: 0, cy: 1, r: 0.7, color: p.accent, opacity: 0.14 }] },
      text: "#F4F1EC",
      muted: "rgba(244,241,236,0.66)",
      headingFont: "font-body",
      bodyFont: "font-body",
      headingUpper: true,
      headingTracking: 1,
      card: { backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
      radius: 8,
      primary: { backgroundColor: p.accent, color: p.onAccent, borderColor: "transparent", uppercase: true, letterSpacing: 1 },
      secondary: { backgroundColor: "rgba(255,255,255,0.08)", color: "#F4F1EC", borderColor: "transparent", uppercase: true, letterSpacing: 1 },
      rule: "rgba(255,255,255,0.14)",
      btnRadius: 3,
    };
  }
  if (style === "noir") {
    return {
      glass: false,
      pageBg: "#08080A",
      backdrop: { base: "#08080A", glows: [{ cx: 0.72, cy: 0.18, r: 0.6, color: p.accent, opacity: 0.14 }, { cx: 0.5, cy: 1, r: 0.9, color: "#3C466E", opacity: 0.28 }] },
      text: "#EDE6DD",
      muted: "rgba(237,230,221,0.64)",
      headingFont: "font-body",
      bodyFont: "font-body",
      headingUpper: true,
      headingColor: p.accent,
      headingTracking: 1,
      card: { backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
      radius: 4,
      primary: { backgroundColor: p.accent, color: p.onAccent, borderColor: "transparent", uppercase: true, letterSpacing: 1.2 },
      secondary: { backgroundColor: "rgba(255,255,255,0.07)", color: "#EDE6DD", borderColor: "transparent", uppercase: true, letterSpacing: 1.2 },
      rule: "rgba(255,255,255,0.12)",
      btnRadius: 0,
    };
  }
  if (style === "nebula") {
    return {
      glass: false,
      pageBg: "#1B0D3F",
      backdrop: { base: "#1B0D3F", glows: [{ cx: 0.5, cy: 0, r: 0.9, color: p.accent, opacity: 0.75 }, { cx: 0.5, cy: 1, r: 0.9, color: p.primary, opacity: 0.8 }] },
      text: "#F7F4FF",
      muted: "rgba(247,244,255,0.72)",
      headingFont: "font-body",
      bodyFont: "font-body",
      headingUpper: true,
      headingTracking: 0.5,
      card: { backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.16)" },
      radius: 28,
      primary: { backgroundColor: p.accent, color: p.onAccent, borderColor: "transparent", shadow: { shadowColor: p.accent, shadowOpacity: 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 6 } },
      secondary: { backgroundColor: "transparent", color: "#FFFFFF", borderColor: "rgba(255,255,255,0.85)", borderWidth: 1.5 },
      rule: "rgba(255,255,255,0.18)",
      btnRadius: 999,
      float: true,
    };
  }
  if (style === "duotone") {
    return {
      glass: false,
      pageBg: "#E9E9EB",
      backdrop: { base: "#E9E9EB", glows: [{ cx: 0.2, cy: 0, r: 0.8, color: "#FFFFFF", opacity: 0.9 }] },
      text: "#0E0E10",
      muted: "rgba(14,14,16,0.62)",
      headingFont: "font-body",
      bodyFont: "font-body",
      headingTracking: -1.4,
      card: { backgroundColor: "rgba(255,255,255,0.7)", borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" },
      radius: 14,
      primary: { backgroundColor: "#0E0E10", color: "#FFFFFF", borderColor: "#0E0E10" },
      secondary: { backgroundColor: "transparent", color: "#0E0E10", borderColor: "rgba(0,0,0,0.2)" },
      rule: "rgba(0,0,0,0.14)",
      btnRadius: 999,
    };
  }
  if (style === "sand") {
    return {
      glass: false,
      pageBg: "#E7E2D9",
      backdrop: { base: "#E7E2D9", glows: [{ cx: 1, cy: 0, r: 0.8, color: "#FFFFFF", opacity: 0.55 }] },
      text: "#4B4338",
      muted: "rgba(75,67,56,0.7)",
      headingFont: "font-body",
      bodyFont: "font-body",
      headingTracking: -0.6,
      card: { backgroundColor: "rgba(255,255,255,0.45)", borderWidth: 1, borderColor: "rgba(75,67,56,0.14)" },
      radius: 6,
      primary: { backgroundColor: p.primary, color: p.onPrimary, borderColor: p.primary },
      secondary: { backgroundColor: "transparent", color: "#4B4338", borderColor: "rgba(75,67,56,0.55)" },
      rule: "rgba(75,67,56,0.22)",
      btnRadius: 2,
    };
  }
  if (style === "confetti") {
    return {
      glass: false,
      pageBg: "#F3EFE8",
      backdrop: { base: "#F3EFE8", glows: [{ cx: 0.5, cy: 0.02, r: 0.3, color: "#BFE3D6", opacity: 0.8 }, { cx: 0.95, cy: 0.04, r: 0.3, color: "#F6CFC8", opacity: 0.8 }, { cx: 0.05, cy: 0.5, r: 0.35, color: p.accent, opacity: 0.18 }] },
      text: "#2B2A28",
      muted: "rgba(43,42,40,0.66)",
      headingFont: "font-display",
      bodyFont: "font-body",
      card: { backgroundColor: "rgba(255,255,255,0.72)", borderWidth: 1, borderColor: "rgba(43,42,40,0.08)" },
      radius: 22,
      primary: { backgroundColor: p.primary, color: p.onPrimary, borderColor: p.primary },
      secondary: { backgroundColor: "transparent", color: "#2B2A28", borderColor: "rgba(43,42,40,0.35)" },
      rule: "rgba(43,42,40,0.16)",
      btnRadius: 999,
    };
  }
  if (style === "skyline") {
    return {
      glass: false,
      pageBg: "#E6F3FF",
      backdrop: { base: "#E6F3FF", glows: [{ cx: 0.9, cy: 0, r: 0.6, color: "#4FB0FF", opacity: 0.3 }, { cx: 0.1, cy: 1, r: 0.8, color: "#7DBBF5", opacity: 0.4 }] },
      text: "#0B1B3F",
      muted: "rgba(11,27,63,0.66)",
      headingFont: "font-body",
      bodyFont: "font-body",
      headingTracking: -0.6,
      card: { backgroundColor: "rgba(255,255,255,0.75)", borderWidth: 1, borderColor: "rgba(11,27,63,0.08)" },
      radius: 20,
      primary: { backgroundColor: p.primary, color: p.onPrimary, borderColor: p.primary },
      secondary: { backgroundColor: "rgba(255,255,255,0.7)", color: "#0B1B3F", borderColor: "rgba(11,27,63,0.2)" },
      rule: "rgba(11,27,63,0.14)",
      btnRadius: 12,
    };
  }
  if (style === "azure") {
    return {
      glass: false,
      pageBg: "#F6F9FC",
      backdrop: { base: "#F6F9FC", glows: [{ cx: 1, cy: 0, r: 0.75, color: p.primary, opacity: 0.4 }] },
      text: "#0C1B2E",
      muted: "rgba(12,27,46,0.64)",
      headingFont: "font-body",
      bodyFont: "font-body",
      headingTracking: -0.6,
      card: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "rgba(12,27,46,0.08)" },
      cardShadow: { shadowColor: "#0C1B2E", shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 3 },
      radius: 16,
      primary: { backgroundColor: p.primary, color: p.onPrimary, borderColor: p.primary },
      secondary: { backgroundColor: "#FFFFFF", color: "#0C1B2E", borderColor: "rgba(12,27,46,0.16)" },
      rule: "rgba(12,27,46,0.12)",
      btnRadius: 10,
    };
  }
  if (style === "aqua") {
    return {
      glass: false,
      pageBg: "#B5F0E8",
      backdrop: { base: "#B5F0E8", glows: [{ cx: 0.1, cy: 0, r: 0.9, color: "#E4FFF9", opacity: 0.9 }, { cx: 0.95, cy: 1, r: 0.8, color: "#34BEBE", opacity: 0.55 }] },
      text: "#0C2238",
      muted: "rgba(12,34,56,0.68)",
      headingFont: "font-body",
      bodyFont: "font-body",
      headingTracking: -0.6,
      card: { backgroundColor: "rgba(255,255,255,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.7)" },
      radius: 18,
      primary: { backgroundColor: "#0C2238", color: "#FFFFFF", borderColor: "#0C2238" },
      secondary: { backgroundColor: "transparent", color: "#0C2238", borderColor: "#0C2238" },
      rule: "rgba(12,34,56,0.2)",
      btnRadius: 8,
    };
  }
  if (style === "candy") {
    return {
      glass: false,
      pageBg: "#FDF1F5",
      backdrop: { base: "#FDF1F5", glows: [{ cx: 1, cy: 0, r: 0.8, color: "#A096FF", opacity: 0.35 }, { cx: 0, cy: 1, r: 0.8, color: "#FFA0C8", opacity: 0.4 }] },
      text: "#1B1938",
      muted: "rgba(27,25,56,0.64)",
      headingFont: "font-body",
      bodyFont: "font-body",
      headingTracking: -0.6,
      card: { backgroundColor: "rgba(255,255,255,0.72)", borderWidth: 1, borderColor: "rgba(255,255,255,0.9)" },
      cardShadow: { shadowColor: "#4B4CE0", shadowOpacity: 0.15, shadowRadius: 18, shadowOffset: { width: 0, height: 12 }, elevation: 3 },
      radius: 26,
      primary: { backgroundColor: p.primary, color: p.onPrimary, borderColor: "transparent", gradient: [mix(p.primary, "#FFFFFF", 0.18), p.primary], shadow: { shadowColor: p.primary, shadowOpacity: 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 6 } },
      secondary: { backgroundColor: "transparent", color: "#1B1938", borderColor: "rgba(27,25,56,0.35)" },
      rule: "rgba(27,25,56,0.14)",
      btnRadius: 14,
      float: true,
    };
  }
  if (style === "ultraviolet") {
    return {
      glass: false,
      pageBg: "#2A0C66",
      backdrop: { base: "#2A0C66", glows: [{ cx: 0.85, cy: 0.1, r: 0.7, color: "#FF46C8", opacity: 0.38 }, { cx: 0, cy: 1, r: 0.7, color: "#3C78FF", opacity: 0.32 }] },
      text: "#FFFFFF",
      muted: "rgba(255,255,255,0.74)",
      headingFont: "font-body",
      bodyFont: "font-body",
      headingTracking: -1,
      card: { backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" },
      radius: 24,
      primary: { backgroundColor: p.accent, color: "#FFFFFF", borderColor: "transparent", gradient: [p.accent, "#8C3BFF"], shadow: { shadowColor: p.accent, shadowOpacity: 0.55, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 7 } },
      secondary: { backgroundColor: "transparent", color: "#FFFFFF", borderColor: "rgba(255,255,255,0.7)" },
      rule: "rgba(255,255,255,0.2)",
      btnRadius: 12,
      shine: true,
      float: true,
    };
  }
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
  /** Space the page menu takes at the top / bottom, so floating pieces (the share button) stay clear of it. */
  navInset: { top: number; bottom: number };
  /** The real safe-area insets, for the menu itself (page content gets 0 where the menu has taken over). */
  navInsetSafe: { top: number; bottom: number };
}

/** Section anchors: each shared section registers a view here so the menu can find where it sits on the page. */
type AnchorName = "about" | "buttons" | "document" | "gallery" | "contact";
const AnchorContext = createContext<((name: AnchorName) => RefObject<View | null>) | null>(null);
function useAnchor(name: AnchorName): RefObject<View | null> | undefined {
  const get = useContext(AnchorContext);
  return get ? get(name) : undefined;
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
          color: ctx.t.headingColor ?? ctx.t.text,
          textTransform: ctx.t.headingUpper ? "uppercase" : undefined,
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
  const { busy, label: downloadLabel, start: startDownload } = useFileDownload();
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
        const ext = cta.file_path?.includes(".") ? cta.file_path.split(".").pop() : null;
        void startDownload(ctaHref(cta, ctx.config), cta.file_name || (ext ? `download.${ext}` : "download"));
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
      {({ pressed }) => <ButtonFace btn={btn} radius={buttonRadius(ctx.t)} ctx={ctx} icon={icon} label={isDownload && busy ? downloadLabel(cta.label) : cta.label} block={block} pressed={pressed} shine={primary && ctx.t.shine} />}
    </Pressable>
  );
}

function CtaGroup({ ctx, block, left }: { ctx: Ctx; block?: boolean; left?: boolean }) {
  const anchor = useAnchor("buttons");
  // A draft can hold a button that has no label yet — never draw an empty pill for it.
  const ctas = (ctx.config.ctas ?? []).filter((c) => c.label.trim());
  if (!ctas.length) return null;
  return (
    <View ref={anchor} collapsable={false} style={block ? { gap: 12 } : { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: left ? "flex-start" : "center" }}>
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
  const anchor = useAnchor("about");
  const intro = ctx.config.identity?.intro?.trim();
  if (!intro) return null;
  return (
    <View ref={anchor} collapsable={false} style={{ alignSelf: left ? "flex-start" : "center", maxWidth: 672 }}>
      <Body ctx={ctx} style={{ fontSize: 17, lineHeight: 27, textAlign: left ? "left" : "center" }}>
        {intro}
      </Body>
    </View>
  );
}

function DocumentCard({ ctx }: { ctx: Ctx }) {
  const anchor = useAnchor("document");
  const { busy, label: downloadLabel, start: startDownload } = useFileDownload();
  const doc = ctx.config.document;
  if (!doc?.path) return null;
  const view = publicFileUrl(doc.path);
  const dl = publicFileUrl(doc.path, { download: doc.file_name || `${doc.title || "document"}.pdf` });
  const radius = buttonRadius(ctx.t);
  return (
    <View ref={anchor} collapsable={false}>
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
            void startDownload(dl, doc.file_name || `${doc.title || "document"}.pdf`);
          }}
        >
          <ButtonFace
            btn={ctx.t.secondary}
            radius={radius}
            ctx={ctx}
            icon={busy ? <ActivityIndicator size="small" color={ctx.t.secondary.color} /> : <Download size={17} color={ctx.t.secondary.color} />}
            label={downloadLabel("Download")}
          />
        </Pressable>
      </View>
    </Card>
    </View>
  );
}

type GalleryVariant = "grid" | "small" | "big" | "bento";

function Gallery({ ctx, variant = "grid", items: override }: { ctx: Ctx; variant?: GalleryVariant; items?: { path: string; caption?: string }[] }) {
  const anchor = useAnchor("gallery");
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
      <View ref={anchor} collapsable={false}>
        {body}
      </View>
      {open !== null && urls.length > 0 ? <MediaViewer mediaUrls={urls} startIndex={Math.min(open, urls.length - 1)} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function Contact({ ctx }: { ctx: Ctx }) {
  const anchor = useAnchor("contact");
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
    <View ref={anchor} collapsable={false}>
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
    </View>
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
        {/* Signed-in visitors land here with the app's navigation hidden behind the page — a quiet way back in. */}
        {!ctx.preview && ctx.actions.signedIn ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Open Akọ"
            hitSlop={10}
            onPress={() => router.replace("/" as Href)}
            style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4, opacity: 0.8 }}
          >
            <Text className={ctx.t.bodyFont} style={{ color: ctx.t.muted, fontSize: 12 }}>
              Open Akọ
            </Text>
            <ArrowRight size={12} color={ctx.t.muted} />
          </Pressable>
        ) : null}
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

// ── Templates extracted from reference landing pages ────────────────────────────────────────────────────────
// Native twin of the web templates of the same names. Shapes the web draws with clip-paths are approximated with
// rounded, rotated and skewed boxes. Without a hero image each shape is filled with the page colours.
type LayoutProps = { ctx: Ctx; slug?: string };

const splitName = (name?: string): [string, string] => {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return [words.join(" "), ""];
  const k = Math.ceil(words.length / 2);
  return [words.slice(0, k).join(" "), words.slice(k).join(" ")];
};

type TitleMode = "plain" | "accent-first" | "accent-second" | "outline-first" | "light-first";

function Title({ ctx, mode = "plain", size }: { ctx: Ctx; mode?: TitleMode; size: number }) {
  const name = ctx.config.identity?.name ?? "";
  const [a, b] = splitName(name);
  const base = ctx.t.headingColor ?? ctx.t.text;
  const line = (txt: string, color: string, bold = true) => (
    <Text
      key={txt}
      accessibilityRole="header"
      className={`${ctx.t.headingFont} ${bold ? "font-bold" : ""}`}
      style={{ color, fontSize: size, lineHeight: size * 1.04, letterSpacing: ctx.t.headingTracking ?? -size * 0.03, textTransform: ctx.t.headingUpper ? "uppercase" : undefined }}
    >
      {txt}
    </Text>
  );
  if (mode === "plain" || !b) return line(name, base);
  const first = mode === "accent-first" ? ctx.p.accent : mode === "outline-first" ? withAlpha(ctx.t.text, 0.42) : ctx.t.text;
  const second = mode === "accent-second" ? ctx.p.accent : ctx.t.text;
  return (
    <View>
      {line(a, first, mode !== "light-first")}
      {line(b, second)}
    </View>
  );
}

/** First hero image in a box of the caller's shape — or, with no image, the page colours and the name's first letter. */
function Pic({ ctx, style, index = 0 }: { ctx: Ctx; style: ViewStyle; index?: number }) {
  const hero = ctx.config.brand?.hero ?? [];
  const uri = hero.length ? publicFileUrl(hero[index % hero.length].path) : null;
  const initial = (ctx.config.identity?.name ?? "").trim().slice(0, 1).toUpperCase() || "•";
  return (
    <View style={[{ overflow: "hidden" }, style]}>
      {uri ? (
        <Image source={{ uri }} style={{ width: "100%", height: "100%" }} contentFit="cover" accessibilityLabel="" />
      ) : (
        <>
          <GradientFill from={ctx.p.accent} to={ctx.p.primary} />
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Text className={`${ctx.t.headingFont} font-bold`} style={{ color: ctx.p.onPrimary, fontSize: 72, opacity: 0.9 }}>
              {initial}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

function TextCol({ ctx, mode, size, wide, children }: { ctx: Ctx; mode?: TitleMode; size: number; wide: boolean; children?: ReactNode }) {
  const id = ctx.config.identity ?? {};
  return (
    <Reveal animation={ctx.animation} index={1} style={{ flex: wide ? 1 : undefined, width: wide ? undefined : "100%", gap: 18, alignItems: "flex-start" }}>
      <Logo ctx={ctx} size={56} />
      <Title ctx={ctx} mode={mode} size={size} />
      {children}
      {id.tagline ? (
        <Text className={ctx.t.bodyFont} style={{ color: ctx.t.muted, fontSize: 18, lineHeight: 26, maxWidth: 440 }}>
          {id.tagline}
        </Text>
      ) : null}
      <Intro ctx={ctx} left />
      <CtaGroup ctx={ctx} left />
    </Reveal>
  );
}

function SideRow({ ctx, text, media, wide, mediaFirst }: { ctx: Ctx; text: ReactNode; media: ReactNode; wide: boolean; mediaFirst?: boolean }) {
  const m = (
    <Reveal animation={ctx.animation} index={0} style={{ flex: wide ? 1 : undefined, width: wide ? undefined : "100%", alignItems: "center" }}>
      {media}
    </Reveal>
  );
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 40 + ctx.safeTop, width: "100%", maxWidth: 1100, alignSelf: "center", flexDirection: wide ? "row" : "column", gap: wide ? 48 : 28, alignItems: wide ? "center" : "stretch" }}>
      {wide || !mediaFirst ? (
        <>
          {text}
          {m}
        </>
      ) : (
        <>
          {m}
          {text}
        </>
      )}
    </View>
  );
}

/** What every new template ends with: the document, gallery, contact and the fixed footer. */
function Rest({ ctx, slug }: LayoutProps) {
  return (
    <>
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

const titleSize = (width: number, max = 56) => Math.min(max, Math.max(38, width * 0.11));

function Console({ ctx, slug }: LayoutProps) {
  const { width } = useWindowDimensions();
  const wide = width >= 720;
  return (
    <>
      <SideRow ctx={ctx} wide={wide} mediaFirst text={<TextCol ctx={ctx} wide={wide} mode="accent-second" size={titleSize(width, 60)} />} media={<Pic ctx={ctx} style={{ width: "100%", aspectRatio: 5 / 6, borderRadius: 6 }} />} />
      <Rest ctx={ctx} slug={slug} />
    </>
  );
}

function Showreel({ ctx, slug }: LayoutProps) {
  const { width } = useWindowDimensions();
  const wide = width >= 720;
  const id = ctx.config.identity ?? {};
  const hero = ctx.config.brand?.hero ?? [];
  const n = hero.length;
  const [i, setI] = useState(0);
  const nextUri = n ? publicFileUrl(hero[(i + 1) % n].path) : null;
  const first = (ctx.config.ctas ?? []).find((c) => c.label.trim());
  const ratio = wide ? 16 / 9 : 4 / 5;
  const words = (
    <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, justifyContent: "center", alignItems: "flex-start", gap: 14, paddingHorizontal: 24, paddingTop: ctx.safeTop, paddingBottom: 90, backgroundColor: "rgba(0,0,0,0.42)" }}>
      <Logo ctx={ctx} size={48} />
      <Text className={`${ctx.t.headingFont} font-bold`} style={{ color: ctx.t.headingColor ?? "#FFFFFF", fontSize: titleSize(width, 56), lineHeight: titleSize(width, 56) * 1.04, textTransform: ctx.t.headingUpper ? "uppercase" : undefined }}>
        {id.name}
      </Text>
      {id.intro ? (
        <Text className={ctx.t.bodyFont} numberOfLines={4} style={{ color: "rgba(255,255,255,0.85)", fontSize: 15, lineHeight: 22, maxWidth: 420 }}>
          {id.intro}
        </Text>
      ) : null}
      {first ? <CtaButton cta={first} primary ctx={ctx} /> : null}
    </View>
  );
  return (
    <>
      {n ? (
        <HeroSlides images={hero} aspectRatio={ratio} overlay={words} index={i} onIndexChange={setI} dots={false} />
      ) : (
        <View style={{ width: "100%", aspectRatio: ratio, overflow: "hidden" }}>
          <GradientFill from={ctx.p.primary} to={ctx.p.accent} />
          {words}
        </View>
      )}
      <View style={{ marginTop: -72, marginHorizontal: 20, maxWidth: 380, backgroundColor: "#FFFFFF", padding: 20, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 20, shadowOffset: { width: 0, height: 12 }, elevation: 10 }}>
        <View style={{ flexDirection: "row", gap: 14, alignItems: "flex-start" }}>
          <View style={{ width: 64, height: 80, marginTop: -44, overflow: "hidden", backgroundColor: ctx.p.accent }}>
            {nextUri ? <Image source={{ uri: nextUri }} style={{ width: "100%", height: "100%" }} contentFit="cover" accessibilityLabel="" /> : null}
          </View>
          <Text className="font-body font-bold" style={{ flex: 1, color: "#14120F", fontSize: 17, lineHeight: 22 }}>
            {id.tagline || id.name}
          </Text>
        </View>
        {id.intro ? (
          <Text className="font-body" numberOfLines={3} style={{ marginTop: 12, color: "#555", fontSize: 13, lineHeight: 19 }}>
            {id.intro}
          </Text>
        ) : null}
        {n > 1 ? (
          <View style={{ marginTop: 14, flexDirection: "row", gap: 24 }}>
            <Pressable onPress={() => setI((i + n - 1) % n)} accessibilityRole="button" accessibilityLabel="Previous image" hitSlop={8}>
              <Text className="font-body font-bold" style={{ color: "#14120F", fontSize: 14 }}>
                Previous
              </Text>
            </Pressable>
            <Pressable onPress={() => setI((i + 1) % n)} accessibilityRole="button" accessibilityLabel="Next image" hitSlop={8}>
              <Text className="font-body font-bold" style={{ color: "#14120F", fontSize: 14 }}>
                Next
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
      <Rest ctx={ctx} slug={slug} />
    </>
  );
}

function Frame({ ctx, slug }: LayoutProps) {
  const { width } = useWindowDimensions();
  const wide = width >= 720;
  const id = ctx.config.identity ?? {};
  const hero = ctx.config.brand?.hero ?? [];
  const n = hero.length;
  const [i, setI] = useState(0);
  const ctas = (ctx.config.ctas ?? []).filter((c) => c.label.trim());
  const arrow = { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: ctx.t.rule, alignItems: "center", justifyContent: "center" } as const;
  return (
    <>
      <View style={{ paddingHorizontal: 16, paddingTop: 24 + ctx.safeTop }}>
        <View style={{ width: "100%", maxWidth: 1100, alignSelf: "center", borderRadius: 32, borderWidth: 1, borderColor: ctx.t.rule, backgroundColor: withAlpha(ctx.t.text, 0.03), overflow: "hidden", padding: 24, gap: 20, flexDirection: wide ? "row" : "column", alignItems: wide ? "flex-end" : "stretch" }}>
          <Reveal animation={ctx.animation} index={1} style={{ flex: wide ? 1.2 : undefined, gap: 14, alignItems: "flex-start" }}>
            {id.tagline ? (
              <Text className={ctx.t.bodyFont} style={{ color: ctx.t.muted, fontSize: 13, letterSpacing: 2.2, textTransform: "uppercase" }}>
                {id.tagline}
              </Text>
            ) : null}
            <Title ctx={ctx} size={titleSize(width, 52)} />
            <Intro ctx={ctx} left />
            {ctas[0] ? <CtaButton cta={ctas[0]} primary ctx={ctx} /> : null}
          </Reveal>
          <Reveal animation={ctx.animation} index={0} style={{ flex: wide ? 1 : undefined, width: wide ? undefined : "100%" }}>
            {n ? <HeroSlides images={hero} aspectRatio={3 / 4} index={i} onIndexChange={setI} dots={false} style={{ borderRadius: 24 }} /> : <Pic ctx={ctx} style={{ width: "100%", aspectRatio: 3 / 4, borderRadius: 24 }} />}
          </Reveal>
          <Reveal animation={ctx.animation} index={2} style={{ flex: wide ? 0.7 : undefined, gap: 14, alignItems: "flex-start" }}>
            {ctas.slice(1, 3).map((c) => (
              <CtaButton key={c.id} cta={c} primary={false} ctx={ctx} />
            ))}
            {n > 1 ? (
              <View style={{ flexDirection: "row", gap: 12 }}>
                <Pressable onPress={() => setI((i + n - 1) % n)} accessibilityRole="button" accessibilityLabel="Previous image" style={arrow}>
                  <ArrowLeft size={18} color={ctx.t.text} />
                </Pressable>
                <Pressable onPress={() => setI((i + 1) % n)} accessibilityRole="button" accessibilityLabel="Next image" style={arrow}>
                  <ArrowRight size={18} color={ctx.t.text} />
                </Pressable>
              </View>
            ) : null}
          </Reveal>
        </View>
      </View>
      <Rest ctx={ctx} slug={slug} />
    </>
  );
}

function Duo({ ctx, slug }: LayoutProps) {
  const { width } = useWindowDimensions();
  const wide = width >= 720;
  const device = Math.min(250, width * 0.55);
  return (
    <>
      <View style={{ flexDirection: wide ? "row" : "column" }}>
        <View style={{ flex: wide ? 1.1 : undefined, paddingHorizontal: 24, paddingTop: 40 + ctx.safeTop, paddingBottom: 40, justifyContent: "center" }}>
          <TextCol ctx={ctx} wide={false} size={titleSize(width, 52)} />
        </View>
        <View style={{ flex: wide ? 1 : undefined, backgroundColor: "#0A0A0B", alignItems: "center", justifyContent: "center", paddingVertical: 48 }}>
          <View style={{ width: device, aspectRatio: 9 / 17, transform: [{ rotate: "8deg" }], borderRadius: 34, borderWidth: 6, borderColor: "#1C1C1E", overflow: "hidden" }}>
            <Pic ctx={ctx} style={{ flex: 1 }} />
          </View>
        </View>
      </View>
      <Rest ctx={ctx} slug={slug} />
    </>
  );
}

function Portrait({ ctx, slug }: LayoutProps) {
  const { width } = useWindowDimensions();
  const wide = width >= 720;
  return (
    <>
      <SideRow
        ctx={ctx}
        wide={wide}
        text={
          <TextCol ctx={ctx} wide={wide} mode="outline-first" size={titleSize(width, 56)}>
            <View style={{ width: 120, height: 3, backgroundColor: ctx.p.accent }} />
          </TextCol>
        }
        media={
          <View style={{ width: "100%", borderRadius: 28, padding: 28, backgroundColor: withAlpha(ctx.t.text, 0.06) }}>
            <View style={{ width: "100%", maxWidth: 320, alignSelf: "center" }}>
              <View style={{ position: "absolute", right: -10, top: "52%", width: 36, height: 56, backgroundColor: ctx.p.accent }} />
              <Pic ctx={ctx} style={{ width: "100%", aspectRatio: 1, borderRadius: 999 }} />
            </View>
          </View>
        }
      />
      <Rest ctx={ctx} slug={slug} />
    </>
  );
}

function Arch({ ctx, slug }: LayoutProps) {
  const { width } = useWindowDimensions();
  const wide = width >= 720;
  const initial = (ctx.config.identity?.name ?? "").trim().slice(0, 1).toLowerCase();
  return (
    <>
      <SideRow
        ctx={ctx}
        wide={wide}
        text={
          <TextCol ctx={ctx} wide={wide} size={titleSize(width, 58)}>
            {initial ? (
              <View style={{ width: 48, height: 48, borderRadius: 24, borderWidth: 1.5, borderColor: ctx.t.text, alignItems: "center", justifyContent: "center" }}>
                <Text className={`${ctx.t.headingFont} font-bold`} style={{ color: ctx.t.text, fontSize: 20 }}>
                  {initial}.
                </Text>
              </View>
            ) : null}
          </TextCol>
        }
        media={
          <View style={{ width: "100%", borderRadius: 28, padding: 30, backgroundColor: withAlpha(ctx.p.accent, 0.1), overflow: "hidden" }}>
            <View style={{ position: "absolute", left: 18, top: 18, width: 28, height: 28, borderRadius: 14, backgroundColor: "#BFE3D6" }} />
            <View style={{ position: "absolute", right: 22, top: 30, width: 34, height: 34, backgroundColor: "#F2B9B2", transform: [{ rotate: "12deg" }] }} />
            <View style={{ position: "absolute", left: 14, bottom: 34, width: 48, height: 20, borderRadius: 10, backgroundColor: ctx.p.accent }} />
            <View style={{ position: "absolute", right: 24, bottom: 44, width: 22, height: 22, backgroundColor: "#A3AB98", transform: [{ rotate: "45deg" }] }} />
            <View style={{ position: "absolute", right: 14, top: "46%", width: 32, height: 32, borderRadius: 16, borderWidth: 5, borderColor: ctx.p.accent }} />
            <Pic ctx={ctx} style={{ width: "100%", maxWidth: 280, aspectRatio: 3 / 4, alignSelf: "center", borderTopLeftRadius: 999, borderTopRightRadius: 999, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 }} />
          </View>
        }
      />
      <Rest ctx={ctx} slug={slug} />
    </>
  );
}

function Banner({ ctx, slug }: LayoutProps) {
  const { width } = useWindowDimensions();
  const wide = width >= 720;
  return (
    <>
      <SideRow
        ctx={ctx}
        wide={wide}
        text={<TextCol ctx={ctx} wide={wide} mode="light-first" size={titleSize(width, 58)} />}
        media={
          <View style={{ width: "100%", maxWidth: 400, aspectRatio: 1, borderRadius: 999, padding: 24, backgroundColor: "rgba(255,255,255,0.85)", shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 16 }, elevation: 6 }}>
            <Pic ctx={ctx} style={{ flex: 1, borderRadius: 999 }} />
            <FloatView style={{ position: "absolute", left: -4, top: "18%" }}>
              <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: ctx.p.accent, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: ctx.p.onAccent, fontSize: 20 }}>✦</Text>
              </View>
            </FloatView>
            <FloatView style={{ position: "absolute", right: 0, bottom: "14%" }}>
              <View style={{ width: 78, height: 34, borderRadius: 12, backgroundColor: "#FFFFFF", justifyContent: "center", paddingHorizontal: 10, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4 }}>
                <View style={{ height: 9, borderRadius: 5, backgroundColor: ctx.p.primary }} />
              </View>
            </FloatView>
          </View>
        }
      />
      <Rest ctx={ctx} slug={slug} />
    </>
  );
}

function Diagonal({ ctx, slug }: LayoutProps) {
  const { width } = useWindowDimensions();
  const wide = width >= 720;
  const mediaW = wide ? (Math.min(width, 1100) - 40 - 48) / 2 : width - 40;
  const h = mediaW * 0.8;
  return (
    <>
      <SideRow
        ctx={ctx}
        wide={wide}
        text={<TextCol ctx={ctx} wide={wide} mode="accent-first" size={titleSize(width, 56)} />}
        media={
          <View style={{ width: mediaW, height: h, overflow: "hidden" }}>
            <View style={{ position: "absolute", left: mediaW * 0.05, width: mediaW * 0.1, top: -10, bottom: -10, backgroundColor: withAlpha(ctx.p.primary, 0.55), transform: [{ skewX: "-12deg" }] }} />
            <View style={{ position: "absolute", left: mediaW * 0.13, width: mediaW * 0.04, top: -10, bottom: -10, backgroundColor: ctx.p.accent, transform: [{ skewX: "-12deg" }] }} />
            <View style={{ position: "absolute", left: mediaW * 0.22, right: -mediaW * 0.12, top: -10, bottom: -10, overflow: "hidden", transform: [{ skewX: "-12deg" }] }}>
              <Pic ctx={ctx} style={{ position: "absolute", left: -mediaW * 0.14, right: -mediaW * 0.14, top: 10, bottom: 10, transform: [{ skewX: "12deg" }] }} />
            </View>
          </View>
        }
      />
      <Rest ctx={ctx} slug={slug} />
    </>
  );
}

function Wave({ ctx, slug }: LayoutProps) {
  const { width } = useWindowDimensions();
  const wide = width >= 720;
  const s = Math.min(380, wide ? (Math.min(width, 1100) - 88) / 2 : width - 56);
  return (
    <>
      <SideRow
        ctx={ctx}
        wide={wide}
        text={
          <TextCol ctx={ctx} wide={wide} mode="accent-second" size={titleSize(width, 56)}>
            <View style={{ width: 84, height: 4, borderRadius: 2, backgroundColor: ctx.p.accent }} />
          </TextCol>
        }
        media={
          <View style={{ width: s, height: s * 1.2 }}>
            <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: withAlpha(ctx.p.accent, 0.4), borderTopLeftRadius: s * 0.6, borderTopRightRadius: s * 0.4, borderBottomRightRadius: s * 0.5, borderBottomLeftRadius: s * 0.5, transform: [{ rotate: "-6deg" }] }} />
            <View style={{ position: "absolute", left: s * 0.04, right: s * 0.04, top: s * 0.05, bottom: s * 0.05, backgroundColor: withAlpha(ctx.p.primary, 0.55), borderTopLeftRadius: s * 0.4, borderTopRightRadius: s * 0.55, borderBottomRightRadius: s * 0.45, borderBottomLeftRadius: s * 0.55, transform: [{ rotate: "3deg" }] }} />
            <Pic ctx={ctx} style={{ position: "absolute", left: s * 0.1, right: s * 0.1, top: s * 0.12, bottom: s * 0.12, borderTopLeftRadius: s * 0.46, borderTopRightRadius: s * 0.5, borderBottomRightRadius: s * 0.42, borderBottomLeftRadius: s * 0.5 }} />
          </View>
        }
      />
      <Rest ctx={ctx} slug={slug} />
    </>
  );
}

function Diamond({ ctx, slug }: LayoutProps) {
  const { width } = useWindowDimensions();
  const wide = width >= 720;
  const s = Math.min(380, wide ? (Math.min(width, 1100) - 88) / 2 : width - 56);
  const d = s * 0.52;
  return (
    <>
      <SideRow
        ctx={ctx}
        wide={wide}
        text={<TextCol ctx={ctx} wide={wide} size={titleSize(width, 56)} />}
        media={
          <View style={{ width: s, height: s, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            <View style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: s * 0.26, backgroundColor: ctx.p.primary }} />
            <View style={{ width: d, height: d, transform: [{ rotate: "45deg" }] }}>
              <View style={{ position: "absolute", left: -10, top: -10, right: 10, bottom: 10, borderWidth: 6, borderColor: ctx.p.primary }} />
              <View style={{ flex: 1, overflow: "hidden" }}>
                <Pic ctx={ctx} style={{ position: "absolute", left: -d * 0.3, right: -d * 0.3, top: -d * 0.3, bottom: -d * 0.3, transform: [{ rotate: "-45deg" }] }} />
              </View>
            </View>
          </View>
        }
      />
      <Rest ctx={ctx} slug={slug} />
    </>
  );
}

function Orb({ size, c1, c2, style }: { size: number; c1: string; c2: string; style: ViewStyle }) {
  return (
    <FloatView style={{ position: "absolute", ...style }}>
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c2, overflow: "hidden", shadowColor: c2, shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 10 }, elevation: 5 }}>
        <View style={{ position: "absolute", left: -size * 0.1, top: -size * 0.1, width: size * 0.9, height: size * 0.9, borderRadius: size, backgroundColor: c1, opacity: 0.55 }} />
        <View style={{ position: "absolute", left: size * 0.2, top: size * 0.14, width: size * 0.3, height: size * 0.3, borderRadius: size, backgroundColor: "rgba(255,255,255,0.8)" }} />
      </View>
    </FloatView>
  );
}

function Float({ ctx, slug }: LayoutProps) {
  const { width } = useWindowDimensions();
  const wide = width >= 720;
  const s = Math.min(420, wide ? (Math.min(width, 1100) - 88) / 2 : width - 40);
  const hasHero = (ctx.config.brand?.hero?.length ?? 0) > 0;
  return (
    <>
      <SideRow
        ctx={ctx}
        wide={wide}
        text={<TextCol ctx={ctx} wide={wide} mode="accent-first" size={titleSize(width, 56)} />}
        media={
          <View style={{ width: s, height: s }}>
            {hasHero ? <Pic ctx={ctx} style={{ position: "absolute", left: s * 0.1, right: s * 0.1, top: s * 0.1, bottom: s * 0.1, borderRadius: 36, transform: [{ rotate: "3deg" }] }} /> : null}
            <Orb size={hasHero ? s * 0.2 : s * 0.34} c1={ctx.p.accent} c2={ctx.p.primary} style={hasHero ? { left: -2, top: s * 0.06 } : { left: s * 0.08, top: s * 0.14 }} />
            <Orb size={hasHero ? s * 0.13 : s * 0.24} c1="#9BE8DA" c2="#2BB5A3" style={hasHero ? { right: s * 0.02, top: 0 } : { right: s * 0.08, top: s * 0.06 }} />
            <Orb size={hasHero ? s * 0.24 : s * 0.3} c1="#FFC2DD" c2="#E0679E" style={hasHero ? { right: 0, bottom: s * 0.04 } : { right: s * 0.14, bottom: s * 0.08 }} />
            <Orb size={hasHero ? s * 0.1 : s * 0.16} c1="#C9C6FF" c2="#6B67E8" style={hasHero ? { left: s * 0.1, bottom: 0 } : { left: s * 0.22, bottom: s * 0.04 }} />
          </View>
        }
      />
      <Rest ctx={ctx} slug={slug} />
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
  console: { top: 10, center: "top" },
  showreel: { top: 10, media: true, center: "top" },
  frame: { top: 14, center: "top" },
  duo: { top: 10, center: "top" },
  portrait: { top: 10, center: "top" },
  arch: { top: 10, center: "top" },
  banner: { top: 10, center: "top" },
  diagonal: { top: 10, center: "top" },
  wave: { top: 10, center: "top" },
  diamond: { top: 10, center: "top" },
  float: { top: 10, center: "top" },
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

  const vertical = floating ? { bottom: ctx.safeBottom + ctx.navInset.bottom + 18 } : { top: ctx.safeTop + place.top };
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

// ── Background, foreground and menu ─────────────────────────────────────────────────────────────────────────────
const NAV_BAR_H = 48;
const NAV_PILL_H = 44;
const NAV_PILL_PAD = 10;

/** The page's background picture, behind everything. Looks use RN's `filter` style; "soft" uses the image's own blur. */
function BackgroundLayer({ ctx }: { ctx: Ctx }) {
  const bg = resolveBackground(ctx.config);
  const uri = bg ? publicFileUrl(bg.path) : null;
  if (!bg || !uri) return null;
  const look = LOOK_CSS[bg.look];
  // Blur is Android-only as a style filter, so it goes through the image's blurRadius, which works on both.
  const filter = look.filter.replace(/blur\([^)]*\)\s*/, "").trim();
  const veil = isHex(ctx.t.text) ? readableOn(ctx.t.text) : "#14120F";
  const fill = StyleSheet.absoluteFill;
  const picture =
    bg.fit === "tile" ? (
      <RNImage source={{ uri }} resizeMode="repeat" style={[fill, { transform: [{ scale: bg.zoom }] }]} />
    ) : (
      <Image
        source={{ uri }}
        contentFit={bg.fit === "stretch" ? "fill" : "cover"}
        blurRadius={bg.look === "soft" ? 14 : 0}
        durable={false}
        fallback="none"
        style={[fill, { transform: [{ scale: bg.zoom }] }]}
      />
    );
  return (
    <View pointerEvents="none" style={fill}>
      <View style={[fill, { overflow: "hidden" }, filter && filter !== "none" ? ({ filter } as ViewStyle) : null]}>{picture}</View>
      <View style={[fill, { backgroundColor: withAlpha(veil, look.veil) }]} />
    </View>
  );
}

/**
 * The picture laid over the top of the page. Everything is in pixels of a "stage" (4:5, up to 640 wide) measured on
 * layout. Shape clipping is an SVG clip path scaled to the box; the shadow wraps the rotating layer, so it keeps
 * falling in the chosen direction however the picture is turned.
 */
export function ForegroundArt({ fg, uri, stageW }: { fg: ResolvedForeground; uri: string; stageW: number }) {
  const clipId = `fg${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    let live = true;
    RNImage.getSize(
      uri,
      (w, h) => live && setNat({ w, h }),
      () => {}
    );
    return () => {
      live = false;
    };
  }, [uri]);

  const stageH = stageW * 1.25;
  const boxW = (stageW * fg.size) / 100;
  const boxH = fg.shape ? boxW / fg.shape.aspect : nat ? (boxW * nat.h) / nat.w : boxW;
  const left = (stageW * fg.x) / 100 - boxW / 2;
  const top = (stageH * fg.y) / 100 - boxH / 2;
  const sh = fg.shadow.enabled ? shadowGeometry(fg.shadow.intensity, fg.shadow.angle) : null;
  const shadowStyle: ViewStyle | undefined = sh
    ? Platform.OS === "android"
      ? ({ filter: [{ dropShadow: { offsetX: sh.dx, offsetY: sh.dy, standardDeviation: sh.blur / 2, color: `rgba(0,0,0,${sh.alpha})` } }] } as unknown as ViewStyle)
      : { shadowColor: "#000", shadowOpacity: sh.alpha, shadowRadius: sh.blur / 2, shadowOffset: { width: sh.dx, height: sh.dy } }
    : undefined;

  // Where the picture sits inside the box. Same maths as the web: cover at the focal point, then zoom about that point.
  if (!nat || boxW <= 0 || boxH <= 0) return null;
  let art: ReactNode;
  if (fg.shape) {
    const k = Math.max(boxW / nat.w, boxH / nat.h);
    const dw = nat.w * k;
    const dh = nat.h * k;
    const fx = fg.crop.x / 100;
    const fy = fg.crop.y / 100;
    const l0 = (boxW - dw) * fx;
    const t0 = (boxH - dh) * fy;
    const ox = boxW * fx;
    const oy = boxH * fy;
    const z = fg.crop.zoom;
    art = (
      <Svg width={boxW} height={boxH} viewBox={`0 0 ${boxW} ${boxH}`}>
        <Defs>
          <ClipPath id={clipId}>
            <Path d={scaleShapePath(fg.shape.path, boxW, boxH)} />
          </ClipPath>
        </Defs>
        <SvgImage x={ox + z * (l0 - ox)} y={oy + z * (t0 - oy)} width={dw * z} height={dh * z} href={{ uri }} preserveAspectRatio="none" clipPath={`url(#${clipId})`} />
      </Svg>
    );
  } else {
    art = <Image source={{ uri }} contentFit="fill" durable={false} fallback="none" style={{ width: boxW, height: boxH }} />;
  }
  return (
    <View style={[{ position: "absolute", left, top, width: boxW, height: boxH }, shadowStyle]}>
      <View style={{ width: boxW, height: boxH, transform: fg.rotation ? [{ rotate: `${fg.rotation}deg` }] : undefined }}>{art}</View>
    </View>
  );
}

/** The picture laid over the top of the page, in a 4:5 "stage" up to 640 wide. */
function ForegroundLayer({ ctx }: { ctx: Ctx }) {
  const fg = resolveForeground(ctx.config);
  const uri = fg ? publicFileUrl(fg.path) : null;
  const [stageW, setStageW] = useState(0);
  if (!fg || !uri) return null;
  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, alignItems: "center", zIndex: 6 }}>
      <View style={{ width: "100%", maxWidth: 640, aspectRatio: 4 / 5 }} onLayout={(e) => setStageW(e.nativeEvent.layout.width)}>
        {stageW > 0 ? <ForegroundArt fg={fg} uri={uri} stageW={stageW} /> : null}
      </View>
    </View>
  );
}

/** The page menu: a bar or a floating pill. It sits outside the scroller, so it stays put while the page moves. */
function NavBar({ ctx, active, onGo }: { ctx: Ctx; active: string | null; onGo: (id: string, target: string) => void }) {
  const nav = resolveNav(ctx.config);
  const available = availableNavTargets(ctx.config);
  const items = nav.items.filter((i) => available.includes(i.target));
  if (!items.length) return null;
  const top = nav.position === "top";
  const pill = nav.look === "pill";
  const surface = withAlpha(isHex(ctx.t.text) ? readableOn(ctx.t.text) : "#FFFFFF", 0.92);
  const edge = withAlpha(isHex(ctx.t.text) ? ctx.t.text : "#000000", 0.14);
  const inset = top ? ctx.navInsetSafe.top : ctx.navInsetSafe.bottom;
  const list = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="menu"
      contentContainerStyle={{ alignItems: "center", gap: 4, paddingHorizontal: pill ? 6 : 12, minWidth: pill ? undefined : "100%", justifyContent: pill ? "flex-start" : "center" }}
      style={[
        { flexGrow: 0, height: pill ? NAV_PILL_H : NAV_BAR_H, backgroundColor: surface },
        pill
          ? { borderRadius: 999, borderWidth: 1, borderColor: edge, maxWidth: "100%", shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 }
          : top
            ? { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: edge }
            : { borderTopWidth: StyleSheet.hairlineWidth, borderColor: edge },
      ]}
    >
      {items.map((item) => {
        const on = item.id === active;
        return (
          <Pressable
            key={item.id}
            onPress={() => onGo(item.id, item.target)}
            accessibilityRole="menuitem"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: on }}
            hitSlop={4}
            style={{
              height: pill ? 34 : NAV_BAR_H,
              paddingHorizontal: 14,
              justifyContent: "center",
              borderRadius: pill ? 999 : 0,
              backgroundColor: on && pill ? ctx.p.accent : "transparent",
              borderBottomWidth: !pill && top ? 3 : 0,
              borderTopWidth: !pill && !top ? 3 : 0,
              borderColor: on ? ctx.p.accent : "transparent",
            }}
          >
            <Text className={`${ctx.t.bodyFont} font-semibold`} style={{ fontSize: 14, color: on && pill ? ctx.p.onAccent : ctx.t.text, opacity: on || pill ? 1 : 0.72 }}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
  if (pill) {
    return (
      <View pointerEvents="box-none" style={{ alignItems: "center", paddingHorizontal: 12, paddingTop: top ? inset + NAV_PILL_PAD : NAV_PILL_PAD, paddingBottom: top ? NAV_PILL_PAD : inset + NAV_PILL_PAD }}>
        {list}
      </View>
    );
  }
  return <View style={{ paddingTop: top ? inset : 0, paddingBottom: top ? 0 : inset, backgroundColor: surface }}>{list}</View>;
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
  console: Console,
  showreel: Showreel,
  frame: Frame,
  duo: Duo,
  portrait: Portrait,
  arch: Arch,
  banner: Banner,
  diagonal: Diagonal,
  wave: Wave,
  diamond: Diamond,
  float: Float,
};

export function CustomPageRenderer({ config, preview = false, actions = {}, slug, safeTop = 0, safeBottom = 0 }: Props) {
  const { style, template, animation } = resolveDesign(config);
  const p = resolvePalette(config);
  const t = styleTokens(style, p);
  const nav = resolveNav(config);
  const hasNav = nav.enabled && nav.items.some((i) => availableNavTargets(config).includes(i.target));
  const navTop = hasNav && nav.position === "top";
  const navBottom = hasNav && nav.position === "bottom";
  const navH = nav.look === "pill" ? NAV_PILL_H + NAV_PILL_PAD * 2 : NAV_BAR_H;
  // The menu sits outside the scroller and takes the status-bar / home-indicator room itself, so the page doesn't pad twice.
  const ctx: Ctx = {
    config,
    p,
    t,
    style,
    animation,
    preview,
    actions,
    safeTop: navTop ? 0 : safeTop,
    safeBottom: navBottom ? 0 : safeBottom,
    navInset: { top: 0, bottom: navBottom ? navH + safeBottom : 0 },
    navInsetSafe: { top: safeTop, bottom: safeBottom },
  };
  const Layout = LAYOUTS[template];
  const shareOn = resolveShare(config).enabled;
  const edge = shareEdge(config);
  const bus = useRevealBus();
  const contentRef = useRef<View>(null);
  bus.contentRef = contentRef;

  // ── Menu: where each section sits, which one is showing, and the animated scroll ──
  const scrollRef = useRef<ScrollView>(null);
  const anchors = useRef<Partial<Record<AnchorName, RefObject<View | null>>>>({});
  const getAnchor = useRef((name: AnchorName) => (anchors.current[name] ??= { current: null })).current;
  const ys = useRef<Record<string, number>>({});
  const scrollY = useRef(0);
  const viewH = useRef(0);
  const contentH = useRef(0);
  const cancelScroll = useRef<(() => void) | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const offset = navTop || !hasNav ? 8 : 12;

  const measure = (then?: () => void) => {
    const root = contentRef.current;
    const names = Object.keys(anchors.current) as AnchorName[];
    if (!root || !names.length) return then?.();
    let left = names.length;
    const done = () => {
      if (--left === 0) then?.();
    };
    for (const name of names) {
      const node = anchors.current[name]?.current;
      if (!node) {
        delete ys.current[name];
        done();
        continue;
      }
      node.measureLayout(
        root,
        (_x, y) => {
          ys.current[name] = y;
          done();
        },
        done
      );
    }
  };

  const spy = () => {
    if (!hasNav) return;
    let current: string | null = null;
    for (const item of nav.items) {
      if (item.target === "top") current = current ?? item.id;
      else if (ys.current[item.target] !== undefined && ys.current[item.target] - offset - 24 <= scrollY.current) current = item.id;
    }
    setActive((prev) => (prev === current ? prev : current));
  };

  const go = (id: string, target: string) => {
    cancelScroll.current?.();
    setActive(id);
    const run = (reduceMotion: boolean) =>
      measure(() => {
        const raw = target === "top" ? 0 : ys.current[target];
        if (raw === undefined) return;
        const max = Math.max(0, contentH.current - viewH.current);
        const to = Math.max(0, Math.min(max, raw - (target === "top" ? 0 : offset)));
        cancelScroll.current = animateScroll({
          from: scrollY.current,
          to,
          animation: nav.scroll,
          reduceMotion,
          // Overshooting curves (spring, bounce) are held inside the page so the bar never opens a gap.
          set: (y) => scrollRef.current?.scrollTo({ y: Math.max(0, Math.min(max, y)), animated: false }),
        });
      });
    AccessibilityInfo.isReduceMotionEnabled().then(run, () => run(false));
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.pageBg }}>
      {t.glass ? <GlassBackdrop primary={p.primary} accent={p.accent} /> : t.backdrop ? <StyleBackdrop base={t.backdrop.base} glows={t.backdrop.glows} drift={t.backdrop.drift} /> : null}
      <BackgroundLayer ctx={ctx} />
      {navTop ? <NavBar ctx={ctx} active={active} onGo={go} /> : null}
      <RevealContext.Provider value={bus}>
        <AnchorContext.Provider value={getAnchor}>
          <ScrollView
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            contentInsetAdjustmentBehavior="never"
            onLayout={(e) => {
              viewH.current = e.nativeEvent.layout.height;
              bus.see(e.nativeEvent.layout.height);
            }}
            onContentSizeChange={(_w, h) => {
              contentH.current = h;
              measure(spy);
            }}
            onScrollBeginDrag={() => cancelScroll.current?.()}
            onScroll={(e) => {
              scrollY.current = e.nativeEvent.contentOffset.y;
              bus.see(e.nativeEvent.contentOffset.y + e.nativeEvent.layoutMeasurement.height);
              spy();
            }}
          >
            <View ref={contentRef} collapsable={false}>
              <Layout ctx={ctx} slug={slug} />
              <ForegroundLayer ctx={ctx} />
              {shareOn && edge === "top" ? <ShareButton ctx={ctx} slug={slug} /> : null}
            </View>
          </ScrollView>
        </AnchorContext.Provider>
        {/* Bottom positions float over the scroller so they stay put while the page moves. */}
        {shareOn && edge === "bottom" ? <ShareButton ctx={ctx} slug={slug} /> : null}
      </RevealContext.Provider>
      {navBottom ? <NavBar ctx={ctx} active={active} onGo={go} /> : null}
    </View>
  );
}
