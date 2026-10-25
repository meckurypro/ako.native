// src/components/customPage/CustomPageRenderer.tsx
//
// Renders a Custom Page config. Pure presentation: no data fetching, no routing decisions. The public screen
// (screens/CustomPageView.tsx) and the editor's live preview both use it, so what a person previews is what visitors get.
// Mirrors the web renderer (src/components/customPage/CustomPageRenderer.tsx) — keep the two in step.
//
// Three decisions are kept apart on purpose:
//   • style     — the visual language (minimalist / glass / elegant): surfaces, type, corners.
//   • template  — the arrangement of sections (showcase / stacked / brochure).
//   • animation — how sections arrive (a preset, applied uniformly; never per element).
// Add a style by extending styleTokens(); add a template by adding an entry to LAYOUTS. Neither touches the database —
// design values are just short slugs in the config.
import { router, type Href } from "expo-router";
import { Download, ExternalLink, FileText, Mail, MapPin, MessageCircle, Phone } from "lucide-react-native";
import { useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, View, type ViewStyle } from "react-native";

import { Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { MediaViewer } from "@/components/post/MediaViewer";
import { openExternal } from "@/lib/openExternal";
import {
  publicFileUrl,
  resolveDesign,
  resolvePalette,
  withAlpha,
  type AnimationId,
  type CustomPageConfig,
  type CustomPageCta,
  type StyleId,
  type TemplateId,
} from "../../lib/customPage";
import { BottomScrim, GlassBackdrop } from "./Gradients";
import { HeroSlides } from "./HeroSlides";
import { Reveal, RevealContext, useRevealBus } from "./Reveal";

type Palette = ReturnType<typeof resolvePalette>;

export interface CustomPageActions {
  /** A button was tapped. Analytics hook — never required to navigate. */
  onCta?: (cta: CustomPageCta) => void;
  onOpenInquiry?: () => void;
  onMessageOwner?: () => void;
  onDocumentRead?: () => void;
  onDocumentDownload?: () => void;
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

const buttonRadius = (t: Tokens) => (t.radius > 20 ? 999 : Math.min(t.radius, 12));

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
      style={[{ color: ctx.t.text, fontSize: small ? 20 : 30, lineHeight: small ? 26 : 36, letterSpacing: -0.3 }, style]}
    >
      {children}
    </Text>
  );
}

function ButtonFace({ btn, radius, ctx, icon, label, block }: { btn: Btn; radius: number; ctx: Ctx; icon?: ReactNode; label: string; block?: boolean }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        paddingHorizontal: 24,
        paddingVertical: 14,
        borderWidth: 1,
        borderRadius: radius,
        backgroundColor: btn.backgroundColor,
        borderColor: btn.borderColor,
        width: block ? "100%" : undefined,
      }}
    >
      {icon}
      <Text
        className={`${ctx.t.bodyFont} font-semibold`}
        style={{ color: btn.color, fontSize: btn.fontSize ?? 15, letterSpacing: btn.letterSpacing, textTransform: btn.uppercase ? "uppercase" : "none" }}
      >
        {label}
      </Text>
    </View>
  );
}

function CtaButton({ cta, primary, ctx, block }: { cta: CustomPageCta; primary: boolean; ctx: Ctx; block?: boolean }) {
  const btn = primary ? ctx.t.primary : ctx.t.secondary;
  const c = btn.color;
  const icon =
    cta.action === "download" ? <Download size={17} color={c} /> : cta.action === "email" ? <Mail size={17} color={c} /> : cta.action === "call" ? <Phone size={17} color={c} /> : cta.action === "message" || cta.action === "inquiry" ? <MessageCircle size={17} color={c} /> : cta.action === "url" ? <ExternalLink size={16} color={c} /> : undefined;
  return (
    <Pressable
      onPress={() => runCta(cta, ctx)}
      accessibilityRole="button"
      accessibilityLabel={cta.label}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }], width: block ? "100%" : undefined })}
    >
      <ButtonFace btn={btn} radius={buttonRadius(ctx.t)} ctx={ctx} icon={icon} label={cta.label} block={block} />
    </Pressable>
  );
}

function CtaGroup({ ctx, block }: { ctx: Ctx; block?: boolean }) {
  // A draft can hold a button that has no label yet — never draw an empty pill for it.
  const ctas = (ctx.config.ctas ?? []).filter((c) => c.label.trim());
  if (!ctas.length) return null;
  return (
    <View style={block ? { gap: 12 } : { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
      {ctas.map((c, i) => (
        <CtaButton key={c.id} cta={c} primary={i === 0} ctx={ctx} block={block} />
      ))}
    </View>
  );
}

function Card({ ctx, children, center }: { ctx: Ctx; children: ReactNode; center?: boolean }) {
  const inner = <View style={[{ padding: 24, borderRadius: ctx.t.radius }, ctx.t.card, center ? { alignItems: "center" } : null]}>{children}</View>;
  if (!ctx.t.outerRule) return inner;
  return <View style={{ borderWidth: 1, borderColor: ctx.t.outerRule, padding: 4, borderRadius: ctx.t.radius + 2 }}>{inner}</View>;
}

function Logo({ ctx, size = 64 }: { ctx: Ctx; size?: number }) {
  const url = publicFileUrl(ctx.config.identity?.icon_path);
  if (!url) return null;
  return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: ctx.style === "elegant" ? 4 : size / 4 }} contentFit="cover" accessibilityLabel="" />;
}

function Intro({ ctx }: { ctx: Ctx }) {
  const intro = ctx.config.identity?.intro?.trim();
  if (!intro) return null;
  return (
    <Body ctx={ctx} style={{ fontSize: 17, lineHeight: 27, textAlign: "center", maxWidth: 672, alignSelf: "center" }}>
      {intro}
    </Body>
  );
}

function DocumentCard({ ctx }: { ctx: Ctx }) {
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
          onPress={() => {
            if (ctx.preview || !dl) return;
            ctx.actions.onDocumentDownload?.();
            void openExternal(dl);
          }}
        >
          <ButtonFace btn={ctx.t.secondary} radius={radius} ctx={ctx} icon={<Download size={17} color={ctx.t.secondary.color} />} label="Download" />
        </Pressable>
      </View>
    </Card>
  );
}

function Gallery({ ctx }: { ctx: Ctx }) {
  const items = ctx.config.gallery ?? [];
  const [open, setOpen] = useState<number | null>(null);
  if (!items.length) return null;
  const urls = items.map((g) => publicFileUrl(g.path)).filter((u): u is string => !!u);
  return (
    <>
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 10 }}>
        {items.map((g, i) => {
          const uri = publicFileUrl(g.path);
          return (
            <Reveal key={g.path} animation={ctx.animation} index={i % 6} style={{ width: "48.5%" }}>
              <Pressable
                onPress={() => !ctx.preview && setOpen(i)}
                accessibilityRole="imagebutton"
                accessibilityLabel={g.caption || `Open photo ${i + 1}`}
                style={{ width: "100%", aspectRatio: 1, overflow: "hidden", borderRadius: Math.min(ctx.t.radius, 16) }}
              >
                {uri ? <Image source={{ uri }} style={{ width: "100%", height: "100%" }} contentFit="cover" accessibilityLabel={g.caption ?? ""} /> : null}
              </Pressable>
            </Reveal>
          );
        })}
      </View>
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
        <Text className={ctx.t.bodyFont} style={{ color: ctx.t.muted, fontSize: 12 }}>
          Powered by Akọ
        </Text>
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

function Section({ ctx, i, children }: { ctx: Ctx; i: number; children: ReactNode }) {
  return (
    <Reveal animation={ctx.animation} index={i} style={{ paddingHorizontal: 20, width: "100%", maxWidth: 768, alignSelf: "center" }}>
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

const LAYOUTS: Record<TemplateId, (props: { ctx: Ctx; slug?: string }) => ReactNode> = {
  showcase: Showcase,
  stacked: Stacked,
  brochure: Brochure,
};

export function CustomPageRenderer({ config, preview = false, actions = {}, slug, safeTop = 0, safeBottom = 0 }: Props) {
  const { style, template, animation } = resolveDesign(config);
  const p = resolvePalette(config);
  const t = styleTokens(style, p);
  const ctx: Ctx = { config, p, t, style, animation, preview, actions, safeTop, safeBottom };
  const Layout = LAYOUTS[template];
  const bus = useRevealBus();
  const contentRef = useRef<View>(null);
  bus.contentRef = contentRef;

  return (
    <View style={{ flex: 1, backgroundColor: t.pageBg }}>
      {t.glass ? <GlassBackdrop primary={p.primary} accent={p.accent} /> : null}
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
          </View>
        </ScrollView>
      </RevealContext.Provider>
    </View>
  );
}
