// src/lib/customPage.ts
//
// Custom Pages — the low-code landing page a person (or a parish, shop, event…) publishes at myako.site/<slug>.
// Not to be confused with a Page (pages/PagePage.tsx), which is an account-like identity. A Custom Page is only a
// published document: a JSON config rendered through a style + template.
//
// The server (supabase/ako_custom_pages.sql → custom_page_config_problem) is the validator that matters; the limits
// below mirror it so the editor can stop a person before a round trip.
import { randomUUID } from "expo-crypto";

import { APP_URL } from "./config";
import type { LocalFile } from "./localFile";
import { SHAPE_BY_ID, SHAPES, type ShapeDef } from "./customPageShapes";
import { supabase } from "./supabase";

export const CUSTOM_PAGES_BUCKET = "custom-pages";

export const LIMITS = {
  name: 80,
  tagline: 140,
  intro: 1500,
  copyright: 160,
  address: 240,
  docTitle: 120,
  ctaLabel: 40,
  ctas: 6,
  hero: 8,
  gallery: 24,
  caption: 160,
  navItems: 6,
  navLabel: 24,
  fileBytes: 100 * 1024 * 1024,
  imageBytes: 8 * 1024 * 1024,
} as const;

export type CtaAction = "url" | "ako" | "message" | "inquiry" | "download" | "email" | "call";

export const CTA_ACTIONS: { value: CtaAction; label: string; hint: string }[] = [
  { value: "url", label: "Open a link", hint: "Any website address" },
  { value: "download", label: "Download a file", hint: "A PDF, document or image you upload" },
  { value: "inquiry", label: "Send an inquiry", hint: "Opens the inquiry form on your page" },
  { value: "message", label: "Message on Akọ", hint: "Opens a chat with you (needs an Akọ account)" },
  { value: "ako", label: "Open something on Akọ", hint: "A link to a project, profile or post" },
  { value: "email", label: "Email you", hint: "Uses the email address from your contact details" },
  { value: "call", label: "Call you", hint: "Uses the phone number from your contact details" },
];

export interface CustomPageCta {
  id: string;
  label: string;
  action: CtaAction;
  /** url / ako actions */
  url?: string;
  /** download action — storage path inside the custom-pages bucket */
  file_path?: string;
  /** Original file name, so the download keeps a sensible name. */
  file_name?: string;
}

export interface CustomPageImage {
  path: string;
  caption?: string;
}

export interface CustomPageConfig {
  v?: number;
  identity?: { name?: string; tagline?: string; intro?: string; copyright?: string; icon_path?: string };
  brand?: { primary?: string; secondary?: string; accent?: string; hero?: CustomPageImage[]; background?: CustomPageBackground };
  contact?: { email?: string; phone?: string; address?: string };
  gallery?: CustomPageImage[];
  ctas?: CustomPageCta[];
  document?: { path?: string; title?: string; file_name?: string };
  engagement?: { inquiry?: boolean };
  design?: { style?: string; template?: string; animation?: string };
  seo?: { share_image_path?: string };
  /** Optional share button on the public page. Off unless the creator turns it on. */
  share?: { enabled?: boolean; look?: ShareLook; position?: SharePosition };
  /** A picture laid over the top of the page, optionally clipped to a shape. */
  foreground?: CustomPageForeground;
  /** A menu whose items scroll the visitor to a section of the page. */
  nav?: CustomPageNav;
}

export interface CustomPageRow {
  id: string;
  owner_id: string;
  slug: string;
  name: string;
  visibility: "public" | "unlisted" | "private";
  is_published: boolean;
  draft: CustomPageConfig;
  published: CustomPageConfig | null;
  published_at: string | null;
  referred_by_page_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomPageSummary {
  id: string;
  slug: string;
  name: string;
  visibility: "public" | "unlisted" | "private";
  is_published: boolean;
  has_unpublished_changes: boolean;
  published_at: string | null;
  updated_at: string;
  icon_path: string | null;
  new_inquiries: number;
  views_30d: number;
}

export interface PublicCustomPage {
  id: string;
  slug: string;
  name: string;
  /** live | unpublished | private — the last two are only ever returned to the owner. */
  state: "live" | "unpublished" | "private";
  is_owner: boolean;
  visibility: "public" | "unlisted" | "private";
  published_at: string | null;
  config: CustomPageConfig;
  owner: { id: string; username: string; display_name: string; avatar_url: string | null };
}

export interface CustomPageInquiry {
  id: string;
  page_id: string;
  sender_id: string | null;
  name: string;
  contact: string;
  subject: string | null;
  message: string;
  status: "new" | "read" | "archived";
  created_at: string;
}

export interface CustomPageStats {
  days: number;
  views: number;
  visitors: number;
  clicks: number;
  downloads: number;
  inquiries: number;
  create_clicks: number;
  per_cta: { cta_id: string; event_type: "cta_click" | "download"; count: number }[];
  daily: { day: string; views: number }[];
}

// ── Design vocabulary ───────────────────────────────────────────────────────────────────────────────────────
export type StyleId = "minimalist" | "glass" | "elegant" | "midnight" | "aurora" | "bold" | "soft" | "neo" | "clay" | "chrome" | "mono" | "organic";
export type TemplateId = "showcase" | "stacked" | "brochure" | "spotlight" | "linkcard" | "split" | "portfolio" | "bento" | "poster";
export type AnimationId = "none" | "fade" | "slide-up" | "zoom" | "stagger" | "blur" | "pop" | "slide-left" | "tilt" | "bounce";

export const STYLES: { id: StyleId; label: string; blurb: string }[] = [
  { id: "minimalist", label: "Minimalist", blurb: "Clean, airy, lots of white space." },
  { id: "glass", label: "Glass", blurb: "Frosted panels floating over your colours." },
  { id: "elegant", label: "Elegant", blurb: "Serif headlines and a quiet, formal tone." },
  { id: "midnight", label: "Midnight", blurb: "Deep dark with a soft glow, glowing buttons and a light-sweep shine." },
  { id: "aurora", label: "Aurora", blurb: "Slowly drifting gradient colours, frosted panels and white pill buttons." },
  { id: "bold", label: "Bold", blurb: "Huge heavy headlines, chunky rounded buttons and strong contrast." },
  { id: "soft", label: "Soft", blurb: "Pastel light, floating cards, gentle shadows and a calm glow." },
  { id: "neo", label: "Neo", blurb: "Thick outlines and hard shadows that press down when tapped." },
  { id: "clay", label: "Clay", blurb: "Soft inflated shapes, pastel depth and buttons that squish when pressed." },
  { id: "chrome", label: "Chrome", blurb: "Y2K silver gloss, iridescent colour clouds and shiny metal buttons." },
  { id: "mono", label: "Mono", blurb: "Stark black and white, hairline rules and sharp uppercase buttons." },
  { id: "organic", label: "Organic", blurb: "Earthy warmth, blob-shaped cards, a touch of paper grain and serif headlines." },
];

export const TEMPLATES: { id: TemplateId; label: string; blurb: string }[] = [
  { id: "showcase", label: "Showcase", blurb: "Full-width hero slideshow, then message, gallery and buttons." },
  { id: "stacked", label: "Stacked", blurb: "Logo first, then a hero image and your buttons as cards." },
  { id: "brochure", label: "Brochure", blurb: "Built to put a document front and centre with read and download buttons." },
  { id: "spotlight", label: "Spotlight", blurb: "A full-screen hero with a giant title and your buttons on top of the image." },
  { id: "linkcard", label: "Link card", blurb: "A compact link-in-bio card: round logo, stacked buttons, small images." },
  { id: "split", label: "Split", blurb: "Big image beside your story and buttons. Stacks on phones." },
  { id: "portfolio", label: "Portfolio", blurb: "Big headline, then a bento grid of large and small images." },
  { id: "bento", label: "Bento", blurb: "Everything in tiles of different sizes: hero, logo, tagline, buttons and more." },
  { id: "poster", label: "Poster", blurb: "A scrolling name ticker, giant type and a tilted image. Loud and memorable." },
];

/** How the share button looks. "auto" inherits the page style's own button shape. */
export type ShareLook = "auto" | "minimal" | "round" | "pill";
export const SHARE_LOOKS: ShareLook[] = ["auto", "minimal", "round", "pill"];

/** Where the creator wants the share button. The template decides the exact spot so it stays findable and clear of content. */
export type SharePosition = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";
export const SHARE_POSITIONS: SharePosition[] = ["top-right", "top-left", "bottom-right", "bottom-left", "center"];

export function resolveShare(config: CustomPageConfig): { enabled: boolean; look: ShareLook; position: SharePosition } {
  const sh = config.share ?? {};
  return {
    enabled: sh.enabled === true,
    look: SHARE_LOOKS.includes(sh.look as ShareLook) ? (sh.look as ShareLook) : "auto",
    position: SHARE_POSITIONS.includes(sh.position as SharePosition) ? (sh.position as SharePosition) : "top-right",
  };
}

export const ANIMATIONS: { id: AnimationId; label: string }[] = [
  { id: "none", label: "None" },
  { id: "fade", label: "Fade in" },
  { id: "slide-up", label: "Slide up" },
  { id: "zoom", label: "Zoom in" },
  { id: "stagger", label: "Staggered reveal" },
  { id: "blur", label: "Blur in" },
  { id: "pop", label: "Pop" },
  { id: "slide-left", label: "Slide in" },
  { id: "tilt", label: "Tilt in" },
  { id: "bounce", label: "Bounce" },
];

export const DEFAULT_COLORS = { primary: "#3D5A45", secondary: "#F7F4EF", accent: "#B8862E" } as const;

export function resolveDesign(config: CustomPageConfig): { style: StyleId; template: TemplateId; animation: AnimationId } {
  const d = config.design ?? {};
  const style = STYLES.some((s) => s.id === d.style) ? (d.style as StyleId) : "minimalist";
  const template = TEMPLATES.some((t) => t.id === d.template) ? (d.template as TemplateId) : "showcase";
  const animation = ANIMATIONS.some((a) => a.id === d.animation) ? (d.animation as AnimationId) : "fade";
  return { style, template, animation };
}

// ── Design presets ──────────────────────────────────────────────────────────────────────────────────────────
// A preset is everything on the editor's Design tab that is a *choice* — style, template, animation and the share
// button. Colours, content and uploaded images are not part of it. Presets belong to the person (not a page), so one
// can be applied to any of their pages, on web or native. Stored by supabase/ako_custom_pages.sql (custom_page_presets).
export const PRESET_LIMIT = 20;
export const PRESET_NAME_MAX = 40;

export interface PresetDesign {
  style: StyleId;
  template: TemplateId;
  animation: AnimationId;
  share: { enabled: boolean; look: ShareLook; position: SharePosition };
}

export interface DesignPreset {
  id: string;
  name: string;
  /** As stored. Always read it through resolvePresetDesign(): a preset saved before a style was renamed still opens. */
  design: Partial<PresetDesign> | null;
  updated_at: string;
}

/** The design choices a config currently has, with the same fallbacks the renderer uses. */
export function designOfConfig(config: CustomPageConfig): PresetDesign {
  return { ...resolveDesign(config), share: resolveShare(config) };
}

/** A stored preset as a complete design (anything missing or no longer offered falls back to the defaults). */
export function resolvePresetDesign(raw: DesignPreset["design"]): PresetDesign {
  const d = raw ?? {};
  return designOfConfig({ design: { style: d.style, template: d.template, animation: d.animation }, share: d.share });
}

/** Puts a preset's choices onto a config. Everything else (colours, content, images, link-preview image) is untouched. */
export function applyPresetToConfig(config: CustomPageConfig, raw: DesignPreset["design"]): CustomPageConfig {
  const p = resolvePresetDesign(raw);
  return {
    ...config,
    design: { ...config.design, style: p.style, template: p.template, animation: p.animation },
    share: { ...config.share, ...p.share },
  };
}

/** Whether a config's design is exactly this preset's. A switched-off share button ignores its look and position. */
export function presetMatchesConfig(config: CustomPageConfig, raw: DesignPreset["design"]): boolean {
  const a = designOfConfig(config);
  const b = resolvePresetDesign(raw);
  if (a.style !== b.style || a.template !== b.template || a.animation !== b.animation) return false;
  if (a.share.enabled !== b.share.enabled) return false;
  return !a.share.enabled || (a.share.look === b.share.look && a.share.position === b.share.position);
}

/** "Midnight · Poster · Fade in · Share button" — the one-line reminder of what a preset holds. */
export function describePreset(raw: DesignPreset["design"]): string {
  const p = resolvePresetDesign(raw);
  const label = <T extends { id: string; label: string }>(list: T[], id: string) => list.find((x) => x.id === id)?.label ?? id;
  return [label(STYLES, p.style), label(TEMPLATES, p.template), label(ANIMATIONS, p.animation), p.share.enabled ? "Share button" : null]
    .filter(Boolean)
    .join(" · ");
}

// ── Background image ────────────────────────────────────────────────────────────────────────────────────────
/** How the picture fills the page. "auto" lets the template decide. */
export type BackgroundFit = "auto" | "cover" | "stretch" | "tile";
/** The treatment laid on the picture. "auto" lets the template decide. */
export type BackgroundLook = "auto" | "clear" | "soft" | "dim" | "mono" | "warm" | "cool" | "vivid";

export interface CustomPageBackground {
  path?: string;
  fit?: BackgroundFit;
  look?: BackgroundLook;
}

export const BACKGROUND_FITS: { id: BackgroundFit; label: string; blurb: string }[] = [
  { id: "auto", label: "Automatic", blurb: "Your template picks what suits it best." },
  { id: "cover", label: "Fill", blurb: "Fills the screen and crops the edges. Never distorted." },
  { id: "stretch", label: "Stretch", blurb: "Stretched to the screen exactly. Can distort the picture." },
  { id: "tile", label: "Tile", blurb: "Repeats a small picture or pattern across the page." },
];

export const BACKGROUND_LOOKS: { id: BackgroundLook; label: string; blurb: string }[] = [
  { id: "auto", label: "Automatic", blurb: "Your template picks a treatment that keeps text readable." },
  { id: "clear", label: "Clear", blurb: "The picture as it is, with only a light veil for readability." },
  { id: "soft", label: "Soft blur", blurb: "Gently blurred so your content stands out." },
  { id: "dim", label: "Dimmed", blurb: "Darkened, for a moody backdrop." },
  { id: "mono", label: "Black and white", blurb: "Drains the colour." },
  { id: "warm", label: "Warm", blurb: "A golden, sunlit tint." },
  { id: "cool", label: "Cool", blurb: "A crisp blue tint." },
  { id: "vivid", label: "Vivid", blurb: "Richer colour and contrast." },
];

export interface BackgroundTreatment {
  fit: "cover" | "stretch" | "tile";
  look: Exclude<BackgroundLook, "auto">;
  /** Extra scale so blurred edges never show. */
  zoom: number;
}

/** What each template does with a background when the creator leaves fit/look on "auto". */
export const BACKGROUND_BY_TEMPLATE: Record<TemplateId, BackgroundTreatment> = {
  showcase: { fit: "cover", look: "soft", zoom: 1.08 },
  stacked: { fit: "cover", look: "soft", zoom: 1.08 },
  brochure: { fit: "cover", look: "soft", zoom: 1.08 },
  spotlight: { fit: "cover", look: "dim", zoom: 1.02 },
  linkcard: { fit: "cover", look: "soft", zoom: 1.12 },
  split: { fit: "cover", look: "soft", zoom: 1.08 },
  portfolio: { fit: "cover", look: "dim", zoom: 1.02 },
  bento: { fit: "cover", look: "soft", zoom: 1.08 },
  poster: { fit: "cover", look: "vivid", zoom: 1.02 },
};

/** CSS filter for each look, and how heavy a readability veil it needs (0..1). */
export const LOOK_CSS: Record<Exclude<BackgroundLook, "auto">, { filter: string; veil: number }> = {
  clear: { filter: "none", veil: 0.28 },
  soft: { filter: "blur(6px) saturate(1.1)", veil: 0.34 },
  dim: { filter: "brightness(0.62)", veil: 0.12 },
  mono: { filter: "grayscale(1) contrast(1.05)", veil: 0.3 },
  warm: { filter: "sepia(0.35) saturate(1.2) hue-rotate(-10deg)", veil: 0.3 },
  cool: { filter: "hue-rotate(15deg) saturate(0.9) brightness(0.96)", veil: 0.3 },
  vivid: { filter: "saturate(1.5) contrast(1.08)", veil: 0.3 },
};

export function resolveBackground(config: CustomPageConfig): { path: string; fit: BackgroundTreatment["fit"]; look: BackgroundTreatment["look"]; zoom: number } | null {
  const bg = config.brand?.background;
  if (!bg?.path) return null;
  const base = BACKGROUND_BY_TEMPLATE[resolveDesign(config).template];
  const fit = BACKGROUND_FITS.some((f) => f.id === bg.fit && f.id !== "auto") ? (bg.fit as BackgroundTreatment["fit"]) : base.fit;
  const look = BACKGROUND_LOOKS.some((l) => l.id === bg.look && l.id !== "auto") ? (bg.look as BackgroundTreatment["look"]) : base.look;
  return { path: bg.path, fit, look, zoom: fit === "cover" ? base.zoom : 1 };
}

// ── Foreground image ────────────────────────────────────────────────────────────────────────────────────────
export interface CustomPageForeground {
  path?: string;
  /** A shape id, or "none" to show the picture unclipped. */
  shape?: string;
  /** Width as a percentage of the stage (the first screen of the page). */
  size?: number;
  /** Centre of the picture, as a percentage of the stage. */
  x?: number;
  y?: number;
  /** Degrees, clockwise. */
  rotation?: number;
  /** Which part of the picture shows inside the shape. zoom 1 = whole fit, x/y = focal point (0..100). */
  crop?: { zoom?: number; x?: number; y?: number };
  shadow?: { enabled?: boolean; intensity?: number; angle?: number };
}

export const FOREGROUND_LIMITS = {
  size: [8, 100],
  pos: [0, 100],
  rotation: [-180, 180],
  zoom: [1, 4],
  intensity: [0, 100],
  angle: [0, 360],
} as const;

export const FOREGROUND_DEFAULTS = {
  shape: "circle",
  size: 56,
  x: 50,
  y: 38,
  rotation: 0,
  crop: { zoom: 1, x: 50, y: 50 },
  shadow: { enabled: false, intensity: 45, angle: 60 },
} as const;

const clamp = (v: unknown, [lo, hi]: readonly [number, number], fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

export interface ResolvedForeground {
  path: string;
  /** null = unclipped */
  shape: ShapeDef | null;
  size: number;
  x: number;
  y: number;
  rotation: number;
  crop: { zoom: number; x: number; y: number };
  shadow: { enabled: boolean; intensity: number; angle: number };
}

export function resolveForeground(config: CustomPageConfig): ResolvedForeground | null {
  const fg = config.foreground;
  if (!fg?.path) return null;
  const shape = fg.shape === "none" ? null : SHAPE_BY_ID[fg.shape ?? ""] ?? SHAPE_BY_ID[FOREGROUND_DEFAULTS.shape];
  return {
    path: fg.path,
    shape,
    size: clamp(fg.size, FOREGROUND_LIMITS.size, FOREGROUND_DEFAULTS.size),
    x: clamp(fg.x, FOREGROUND_LIMITS.pos, FOREGROUND_DEFAULTS.x),
    y: clamp(fg.y, FOREGROUND_LIMITS.pos, FOREGROUND_DEFAULTS.y),
    rotation: clamp(fg.rotation, FOREGROUND_LIMITS.rotation, 0),
    crop: {
      zoom: clamp(fg.crop?.zoom, FOREGROUND_LIMITS.zoom, 1),
      x: clamp(fg.crop?.x, FOREGROUND_LIMITS.pos, 50),
      y: clamp(fg.crop?.y, FOREGROUND_LIMITS.pos, 50),
    },
    shadow: {
      enabled: fg.shadow?.enabled === true,
      intensity: clamp(fg.shadow?.intensity, FOREGROUND_LIMITS.intensity, FOREGROUND_DEFAULTS.shadow.intensity),
      angle: clamp(fg.shadow?.angle, FOREGROUND_LIMITS.angle, FOREGROUND_DEFAULTS.shadow.angle),
    },
  };
}

/**
 * Turns the shadow controls into pixels. The angle is the direction the shadow falls, measured clockwise from
 * "to the right" (0 = right, 90 = down, 180 = left, 270 = up), so it stays put when the picture is rotated.
 */
export function shadowGeometry(intensity: number, angle: number) {
  const rad = (angle * Math.PI) / 180;
  const distance = 2 + intensity * 0.28;
  return {
    dx: Math.round(Math.cos(rad) * distance * 10) / 10,
    dy: Math.round(Math.sin(rad) * distance * 10) / 10,
    blur: Math.round((4 + intensity * 0.4) * 10) / 10,
    alpha: Math.round((0.18 + intensity * 0.0042) * 100) / 100,
  };
}

export { SHAPES };

// ── Menu (nav) ──────────────────────────────────────────────────────────────────────────────────────────────
export type NavTarget = "top" | "about" | "buttons" | "document" | "gallery" | "contact";
export type ScrollAnimationId = "smooth" | "ease-out" | "spring" | "bounce" | "slow" | "snap" | "instant";
export type NavPosition = "top" | "bottom";
export type NavLook = "bar" | "pill";

export interface CustomPageNavItem {
  id: string;
  label: string;
  target: NavTarget;
}

export interface CustomPageNav {
  enabled?: boolean;
  items?: CustomPageNavItem[];
  scroll?: ScrollAnimationId;
  position?: NavPosition;
  look?: NavLook;
}

export const NAV_TARGETS: { id: NavTarget; label: string; hint: string }[] = [
  { id: "top", label: "Top of page", hint: "Back to the very start." },
  { id: "about", label: "Page message", hint: "Your welcome note." },
  { id: "buttons", label: "Buttons", hint: "Your buttons." },
  { id: "document", label: "Document", hint: "The document card." },
  { id: "gallery", label: "Gallery", hint: "Your photos." },
  { id: "contact", label: "Contact", hint: "Contact details and the message form." },
];

export const SCROLL_ANIMATIONS: { id: ScrollAnimationId; label: string; blurb: string; ms: number }[] = [
  { id: "smooth", label: "Smooth", blurb: "Eases in and out. A safe, polished default.", ms: 700 },
  { id: "ease-out", label: "Glide", blurb: "Starts fast and settles gently.", ms: 800 },
  { id: "spring", label: "Spring", blurb: "Overshoots a touch, then settles back.", ms: 900 },
  { id: "bounce", label: "Bounce", blurb: "Lands and bounces. Playful.", ms: 1100 },
  { id: "slow", label: "Slow drift", blurb: "A long, calm cinematic scroll.", ms: 1400 },
  { id: "snap", label: "Snap", blurb: "Quick and decisive.", ms: 260 },
  { id: "instant", label: "Instant", blurb: "Jumps straight there, no animation.", ms: 0 },
];

export function resolveNav(config: CustomPageConfig): { enabled: boolean; items: CustomPageNavItem[]; scroll: ScrollAnimationId; position: NavPosition; look: NavLook } {
  const n = config.nav ?? {};
  const items = (n.items ?? [])
    .filter((i) => i && typeof i.label === "string" && i.label.trim() && NAV_TARGETS.some((t) => t.id === i.target))
    .slice(0, LIMITS.navItems);
  return {
    enabled: n.enabled === true && items.length > 0,
    items,
    scroll: SCROLL_ANIMATIONS.some((a) => a.id === n.scroll) ? (n.scroll as ScrollAnimationId) : "smooth",
    position: n.position === "bottom" ? "bottom" : "top",
    look: n.look === "pill" ? "pill" : "bar",
  };
}

/** Which targets this page can actually scroll to, given what it contains. Mirrors what the templates render. */
export function availableNavTargets(config: CustomPageConfig): NavTarget[] {
  const out: NavTarget[] = ["top"];
  if (config.identity?.intro?.trim()) out.push("about");
  if ((config.ctas ?? []).some((c) => c.label.trim())) out.push("buttons");
  if (config.document?.path) out.push("document");
  if ((config.gallery?.length ?? 0) > 0) out.push("gallery");
  const c = config.contact ?? {};
  if (c.email || c.phone || c.address || config.engagement?.inquiry !== false) out.push("contact");
  return out;
}

export function newNavId(existing: CustomPageNavItem[]): string {
  const used = new Set(existing.map((n) => n.id));
  for (let i = 1; i < 100; i++) {
    const id = `nav-${i}`;
    if (!used.has(id)) return id;
  }
  return `nav-${Date.now().toString(36)}`;
}

// ── Colours ─────────────────────────────────────────────────────────────────────────────────────────────────
const HEX = /^#[0-9a-fA-F]{6}$/;
export const isHex = (v: string | undefined): v is string => !!v && HEX.test(v);

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

/** Black or white — whichever reads better on `bg`. */
export function readableOn(bg: string): "#14120F" | "#FFFFFF" {
  return luminance(bg) > 0.4 ? "#14120F" : "#FFFFFF";
}

export function resolvePalette(config: CustomPageConfig) {
  const b = config.brand ?? {};
  const primary = isHex(b.primary) ? b.primary : DEFAULT_COLORS.primary;
  const secondary = isHex(b.secondary) ? b.secondary : DEFAULT_COLORS.secondary;
  const accent = isHex(b.accent) ? b.accent : DEFAULT_COLORS.accent;
  return {
    primary,
    secondary,
    accent,
    onPrimary: readableOn(primary),
    onSecondary: readableOn(secondary),
    onAccent: readableOn(accent),
  };
}

// ── Files ───────────────────────────────────────────────────────────────────────────────────────────────────
export function publicFileUrl(path: string | undefined | null, opts?: { download?: string }): string | null {
  if (!path) return null;
  const { data } = supabase.storage.from(CUSTOM_PAGES_BUCKET).getPublicUrl(path, opts?.download ? { download: opts.download } : undefined);
  return data.publicUrl;
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const FILE_TYPES = [
  ...IMAGE_TYPES,
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/csv",
  "text/plain",
];

export function fileProblem(file: Pick<LocalFile, "type" | "size">, kind: "image" | "file"): string | null {
  const allowed = kind === "image" ? IMAGE_TYPES : FILE_TYPES;
  if (!allowed.includes(file.type)) {
    return kind === "image"
      ? "Please choose a JPEG, PNG, WebP or GIF image."
      : "That file type isn't supported. Use a PDF, Office document, CSV, text file or image.";
  }
  const max = kind === "image" ? LIMITS.imageBytes : LIMITS.fileBytes;
  if (file.size > max) return `That file is too large (max ${Math.round(max / 1024 / 1024)} MB).`;
  return null;
}

export function storagePathFor(ownerId: string, pageId: string, file: Pick<LocalFile, "name">): string {
  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
  const rand = randomUUID().replace(/-/g, "").slice(0, 12);
  return `${ownerId}/${pageId}/${rand}.${ext}`;
}

// ── Links ───────────────────────────────────────────────────────────────────────────────────────────────────
export const customPagePath = (slug: string) => `/${slug}`;
export const customPageUrl = (slug: string) => `${APP_URL}/${slug}`;

export function newCtaId(existing: CustomPageCta[]): string {
  const used = new Set(existing.map((c) => c.id));
  for (let i = 1; i < 100; i++) {
    const id = `cta-${i}`;
    if (!used.has(id)) return id;
  }
  return `cta-${Date.now().toString(36)}`;
}

/** Why a CTA can't be saved yet, or null. Mirrors the server rules. */
export function ctaProblem(cta: CustomPageCta, config: CustomPageConfig): string | null {
  if (!cta.label.trim()) return "Give every button a label.";
  if (cta.action === "url" && !/^https?:\/\/\S+$/i.test(cta.url ?? "")) return "Link buttons need an address starting with http:// or https://.";
  if (cta.action === "ako" && !/^\/[A-Za-z0-9/_.~%?=&#-]*$/.test(cta.url ?? "")) return "An Akọ button needs a link like /your-project.";
  if (cta.action === "download" && !cta.file_path) return "Upload the file this button should download.";
  if (cta.action === "email" && !config.contact?.email) return "Add an email address under Contact first.";
  if (cta.action === "call" && !config.contact?.phone) return "Add a phone number under Contact first.";
  return null;
}

/** Hex to rgba — for glass panels. */
export function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const VISITOR_KEY = "ako:cp-visitor";
/** Anonymous, per-install id so reopening the app isn't counted as a new visitor. Never leaves analytics. */
export function visitorId(): string {
  try {
    let v = localStorage.getItem(VISITOR_KEY);
    if (!v) {
      v = randomUUID().replace(/-/g, "");
      localStorage.setItem(VISITOR_KEY, v);
    }
    return v;
  } catch {
    return randomUUID().replace(/-/g, "");
  }
}

const REF_KEY = "ako:cp-ref";
export function rememberReferrer(slug: string) {
  try {
    sessionStorage.setItem(REF_KEY, slug);
  } catch {
    /* attribution is best-effort */
  }
}
export function takeReferrer(): string | null {
  try {
    return sessionStorage.getItem(REF_KEY);
  } catch {
    return null;
  }
}

/**
 * Client twin of custom_page_config_problem(..., p_strict := false): what the server refuses even for a DRAFT.
 * Lengths and shapes only. A half-typed email, an unfinished button or an empty label must never block autosave.
 */
export function draftProblem(c: CustomPageConfig): string | null {
  const id = c.identity ?? {};
  if ((id.name ?? "").length > LIMITS.name) return `Page name must be ${LIMITS.name} characters or fewer.`;
  if ((id.tagline ?? "").length > LIMITS.tagline) return `Tagline must be ${LIMITS.tagline} characters or fewer.`;
  if ((id.intro ?? "").length > LIMITS.intro) return `The page message must be ${LIMITS.intro} characters or fewer.`;
  if ((id.copyright ?? "").length > LIMITS.copyright) return `The copyright line must be ${LIMITS.copyright} characters or fewer.`;
  const ct = c.contact ?? {};
  if ((ct.email ?? "").length > 120) return "That email address is too long.";
  if ((ct.phone ?? "").length > 30) return "That phone number is too long.";
  if ((ct.address ?? "").length > LIMITS.address) return `The address must be ${LIMITS.address} characters or fewer.`;
  if ((c.document?.title ?? "").length > LIMITS.docTitle) return `The document title must be ${LIMITS.docTitle} characters or fewer.`;
  for (const [i, cta] of (c.ctas ?? []).entries()) {
    if (cta.label.trim().length > LIMITS.ctaLabel) return `Button ${i + 1}: the label must be ${LIMITS.ctaLabel} characters or fewer.`;
    if ((cta.url ?? "").length > 500) return `Button ${i + 1}: the link is too long.`;
  }
  for (const [i, item] of (c.nav?.items ?? []).entries()) {
    if ((item.label ?? "").trim().length > LIMITS.navLabel) return `Menu item ${i + 1}: the label must be ${LIMITS.navLabel} characters or fewer.`;
  }
  if ((c.nav?.items?.length ?? 0) > LIMITS.navItems) return `Use up to ${LIMITS.navItems} menu items.`;
  return null;
}

export type EditorStage = "identity" | "brand" | "media" | "content" | "buttons" | "contact" | "menu" | "design";

/**
 * Client twin of the strict check publish_custom_page() runs. Returns what to fix and which editor stage holds it, so
 * "Publish" can explain itself and jump there instead of failing with a server message.
 */
export function publishProblem(c: CustomPageConfig): { message: string; stage: EditorStage } | null {
  if (!c.identity?.name?.trim()) return { message: "Give your page a name before publishing.", stage: "identity" };
  const ct = c.contact ?? {};
  if (ct.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ct.email)) return { message: "Enter a valid contact email address.", stage: "contact" };
  if (ct.phone && !/^[0-9+()\-\s.]{5,30}$/.test(ct.phone)) return { message: "Enter a valid contact phone number.", stage: "contact" };
  for (const cta of c.ctas ?? []) {
    const message = ctaProblem(cta, c);
    if (message) return { message, stage: "buttons" };
  }
  for (const [i, item] of (c.nav?.items ?? []).entries()) {
    if (!item.label.trim()) return { message: `Menu item ${i + 1} needs a label.`, stage: "menu" };
  }
  return null;
}
