// src/lib/pageTemplates.ts
// ============================================================
// Page templates — ten different ARRANGEMENTS of the same page content.
// A template never changes what a page says (name, bio, hero slides, team, projects); it changes
// where things sit, how big they are and how they are framed. Switching is always safe.
//
// The web and native apps share this file (identical copies): each renders the same config with its
// own primitives, so a page looks like the same template on every device.
// Stored in pages.page_template (null = "classic").
// ============================================================

export type PageTemplateId =
  | "classic"
  | "spotlight"
  | "magazine"
  | "gallery"
  | "hub"
  | "storefront"
  | "studio"
  | "story"
  | "minimal"
  | "poster";

/** Where the banner image goes and how tall it is. "backdrop" = soft blurred wash behind the identity. */
export type BannerMode = "standard" | "tall" | "strip" | "backdrop" | "none";

/**
 * How the identity (photo, name, handle, tagline, actions, stats) is arranged.
 *  overlap-left   photo overlaps the banner's lower-left edge, text below (the original layout)
 *  over-left      text sits ON the banner, bottom-left, in white
 *  over-center    text sits ON the banner, centered, in white, big
 *  inline         small photo beside the text, compact row
 *  stack-center   everything centered in a column
 *  masthead       centered newspaper-style title block between hairlines
 */
export type IdentityMode = "overlap-left" | "over-left" | "over-center" | "inline" | "stack-center" | "masthead";

export type AvatarShape = "circle" | "squircle" | "square";
export type ActionsMode = "side" | "row" | "stack" | "text";
export type StatsMode = "inline" | "tiles" | "none";
export type HeroFrame = "card" | "bleed" | "inset";
export type HeadingStyle = "display" | "eyebrow" | "numbered" | "rule";
export type AboutStyle = "plain" | "lead" | "clamp";
export type SectionKey = "about" | "team" | "subs";
export type Density = "tight" | "cozy" | "airy";

export interface PageTemplateConfig {
  banner: BannerMode;
  identity: IdentityMode;
  avatarSize: number; // px
  avatarShape: AvatarShape;
  actions: ActionsMode;
  stats: StatsMode;
  /** Hero slideshow before the identity block (needs hero slides; otherwise the standard banner is used). */
  heroFirst: boolean;
  heroFrame: HeroFrame;
  order: SectionKey[];
  headings: HeadingStyle;
  about: AboutStyle;
  /** Wrap each section in a soft card. */
  panels: boolean;
  /** Projects tab columns. */
  columns: 2 | 3;
  density: Density;
  /** Center section headings and text. */
  centered: boolean;
  uppercaseName: boolean;
}

export interface PageTemplate {
  id: PageTemplateId;
  name: string;
  blurb: string;
  config: PageTemplateConfig;
}

const base: PageTemplateConfig = {
  banner: "standard",
  identity: "overlap-left",
  avatarSize: 112,
  avatarShape: "circle",
  actions: "side",
  stats: "inline",
  heroFirst: false,
  heroFrame: "card",
  order: ["about", "team", "subs"],
  headings: "display",
  about: "plain",
  panels: false,
  columns: 2,
  density: "cozy",
  centered: false,
  uppercaseName: false,
};

export const PAGE_TEMPLATES: PageTemplate[] = [
  {
    id: "classic",
    name: "Classic",
    blurb: "Wide banner, photo on the edge, everything in a familiar order.",
    config: { ...base },
  },
  {
    id: "spotlight",
    name: "Spotlight",
    blurb: "A tall, immersive cover with your name set right on the image.",
    config: { ...base, banner: "tall", identity: "over-left", avatarSize: 64, actions: "row", stats: "inline", headings: "eyebrow" },
  },
  {
    id: "magazine",
    name: "Magazine",
    blurb: "An editorial masthead, a full-bleed cover story and numbered sections.",
    config: {
      ...base,
      banner: "none",
      identity: "masthead",
      avatarSize: 56,
      actions: "row",
      stats: "inline",
      heroFrame: "bleed",
      headings: "numbered",
      about: "lead",
      centered: true,
      uppercaseName: true,
      density: "airy",
    },
  },
  {
    id: "gallery",
    name: "Gallery",
    blurb: "Your slides lead edge to edge, then a slim header and a dense project wall.",
    config: {
      ...base,
      banner: "none",
      identity: "inline",
      avatarSize: 48,
      actions: "row",
      stats: "none",
      heroFirst: true,
      heroFrame: "bleed",
      order: ["team", "subs", "about"],
      headings: "eyebrow",
      about: "clamp",
      columns: 3,
      density: "tight",
    },
  },
  {
    id: "hub",
    name: "Hub",
    blurb: "Centered and tap-friendly: big photo, stacked buttons, sections as cards.",
    config: {
      ...base,
      banner: "backdrop",
      identity: "stack-center",
      avatarSize: 120,
      actions: "stack",
      stats: "inline",
      panels: true,
      centered: true,
      headings: "display",
    },
  },
  {
    id: "storefront",
    name: "Storefront",
    blurb: "Banner, a squared logo and a row of key numbers — built to make people follow.",
    config: {
      ...base,
      banner: "standard",
      identity: "overlap-left",
      avatarSize: 96,
      avatarShape: "squircle",
      actions: "row",
      stats: "tiles",
      panels: true,
      order: ["about", "team", "subs"],
      headings: "rule",
    },
  },
  {
    id: "studio",
    name: "Studio",
    blurb: "A thin banner strip, a horizontal header and your team up front.",
    config: {
      ...base,
      banner: "strip",
      identity: "inline",
      avatarSize: 88,
      avatarShape: "squircle",
      actions: "row",
      stats: "inline",
      heroFrame: "inset",
      order: ["team", "about", "subs"],
      headings: "eyebrow",
    },
  },
  {
    id: "story",
    name: "Story",
    blurb: "Opens with a full-width slideshow, then reads like a long-form feature.",
    config: {
      ...base,
      banner: "none",
      identity: "inline",
      avatarSize: 56,
      actions: "row",
      stats: "inline",
      heroFirst: true,
      heroFrame: "bleed",
      headings: "numbered",
      about: "lead",
      density: "airy",
    },
  },
  {
    id: "minimal",
    name: "Minimal",
    blurb: "Quiet and typographic: a small photo, text links and lots of white space.",
    config: {
      ...base,
      banner: "none",
      identity: "inline",
      avatarSize: 40,
      actions: "text",
      stats: "none",
      heroFrame: "inset",
      headings: "rule",
      columns: 3,
      density: "airy",
    },
  },
  {
    id: "poster",
    name: "Poster",
    blurb: "A tall centered cover with oversized capitals — loud on purpose.",
    config: {
      ...base,
      banner: "tall",
      identity: "over-center",
      avatarSize: 88,
      actions: "row",
      stats: "inline",
      heroFrame: "bleed",
      headings: "display",
      centered: true,
      uppercaseName: true,
    },
  },
];

export const DEFAULT_TEMPLATE_ID: PageTemplateId = "classic";

export function getPageTemplate(id: string | null | undefined): PageTemplate {
  return PAGE_TEMPLATES.find((t) => t.id === id) ?? PAGE_TEMPLATES[0];
}

/**
 * The config actually used to draw a page. A template that opens with the hero slideshow has nothing to
 * open with on a page that has no slides yet, so it falls back to a standard banner rather than a blank top.
 */
export function resolveTemplateConfig(template: PageTemplate, hasSlides: boolean): PageTemplateConfig {
  const c = template.config;
  if (c.heroFirst && !hasSlides) {
    return { ...c, heroFirst: false, banner: "standard", identity: "overlap-left", avatarSize: 96 };
  }
  return c;
}
