// src/components/page/TemplateThumb.tsx
// A tiny wireframe of a template — banner, photo, text, slideshow, sections, project wall — drawn from the same
// config the real page uses, so the picker shows what each arrangement actually does. (Mirrors the web component.)
import { View } from "react-native";

import type { PageTemplateConfig } from "@/lib/pageTemplates";

const INK = "bg-ink/25";
const SOFT = "bg-accent/25";

function Lines({ center, light, w = [70, 45] }: { center?: boolean; light?: boolean; w?: number[] }) {
  return (
    <View className={`min-w-0 flex-1 gap-[3px] ${center ? "items-center" : ""}`}>
      {w.map((width, i) => (
        <View key={i} style={{ width: `${width}%` }} className={`h-[3px] rounded-full ${light ? "bg-white/80" : i === 0 ? "bg-ink/60" : INK}`} />
      ))}
    </View>
  );
}

function Dot({ size, shape, ring }: { size: number; shape: PageTemplateConfig["avatarShape"]; ring?: boolean }) {
  const px = Math.max(6, Math.round(size / 6.5));
  const r = shape === "circle" ? px / 2 : shape === "squircle" ? px * 0.3 : 2;
  return <View style={{ width: px, height: px, borderRadius: r, borderWidth: ring ? 2 : 0 }} className="shrink-0 border-canvas bg-accent/60" />;
}

export function TemplateThumb({ cfg }: { cfg: PageTemplateConfig }) {
  const overlay = cfg.identity === "over-left" || cfg.identity === "over-center";
  const hasBanner = cfg.banner === "standard" || cfg.banner === "tall" || cfg.banner === "strip";
  const bannerH = { standard: 28, tall: 52, strip: 10 }[cfg.banner as "standard" | "tall" | "strip"];
  const center = cfg.identity === "over-center" || cfg.identity === "stack-center" || cfg.identity === "masthead";

  const hero = (
    <View
      className={`h-7 ${SOFT} ${cfg.heroFrame === "bleed" ? "-mx-1.5" : cfg.heroFrame === "inset" ? "rounded-[4px] border border-ink/20" : "rounded-lg"}`}
    />
  );

  const sections = cfg.order.map((key) => {
    const body = (
      <>
        <View className={`h-[3px] w-1/3 rounded-full ${cfg.headings === "eyebrow" ? "bg-accent/70" : "bg-ink/55"} ${cfg.centered ? "self-center" : ""}`} />
        {key === "team" ? (
          <View className="mt-1 flex-row gap-1">
            <View className={`h-4 flex-1 rounded-[3px] ${INK}`} />
            <View className={`h-4 flex-1 rounded-[3px] ${INK}`} />
          </View>
        ) : (
          <View className={`mt-1 gap-[3px] ${cfg.centered ? "items-center" : ""}`}>
            <View className={`h-[2px] w-full rounded-full ${INK}`} />
            <View className={`h-[2px] w-4/5 rounded-full ${INK}`} />
          </View>
        )}
      </>
    );
    return cfg.panels ? (
      <View key={key} className="rounded-md border border-ink/15 bg-ink/5 p-1">
        {body}
      </View>
    ) : (
      <View key={key}>{body}</View>
    );
  });

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className="w-full overflow-hidden rounded-xl border border-border bg-canvas p-1.5" style={{ aspectRatio: 3 / 4 }}>
      <View className="gap-1.5">
        {cfg.heroFirst ? hero : null}
        {cfg.banner === "backdrop" ? <View className="-mx-1.5 -mt-1.5 h-9 bg-accent/20" /> : null}
        {hasBanner ? (
          <View className={`-mx-1.5 -mt-1.5 justify-end px-1.5 pb-1 ${overlay ? "bg-black/70" : SOFT}`} style={{ height: bannerH }}>
            {overlay ? (
              <View className={center ? "items-center gap-[3px]" : "flex-row items-end gap-1"}>
                <Dot size={cfg.avatarSize} shape={cfg.avatarShape} />
                <Lines center={center} light w={center ? [60, 40] : [55, 35]} />
              </View>
            ) : null}
          </View>
        ) : null}

        {!overlay && cfg.identity === "overlap-left" ? (
          <View className="-mt-3 gap-1">
            <Dot size={cfg.avatarSize} shape={cfg.avatarShape} ring />
            <Lines w={[60, 40]} />
            {cfg.stats === "tiles" ? (
              <View className="flex-row gap-1">
                <View className={`h-3 flex-1 rounded-[3px] ${INK}`} />
                <View className={`h-3 flex-1 rounded-[3px] ${INK}`} />
              </View>
            ) : null}
          </View>
        ) : null}
        {!overlay && cfg.identity === "inline" ? (
          <View className="flex-row items-center gap-1.5" style={cfg.banner === "strip" ? { marginTop: -8 } : undefined}>
            <Dot size={cfg.avatarSize} shape={cfg.avatarShape} ring={cfg.banner === "strip"} />
            <Lines w={[70, 45]} />
          </View>
        ) : null}
        {!overlay && cfg.identity === "stack-center" ? (
          <View className="items-center gap-1 pt-1">
            <Dot size={cfg.avatarSize} shape={cfg.avatarShape} />
            <Lines center w={[55, 35]} />
            <View className="h-2.5 w-3/4 rounded-full bg-accent/40" />
            <View className="h-2.5 w-3/4 rounded-full bg-ink/15" />
          </View>
        ) : null}
        {!overlay && cfg.identity === "masthead" ? (
          <View className="items-center gap-1 border-y border-ink/60 py-1.5">
            <Dot size={cfg.avatarSize} shape={cfg.avatarShape} />
            <View className="h-1 w-2/3 rounded-full bg-ink/70" />
            <View className="h-[2px] w-1/2 rounded-full bg-ink/30" />
          </View>
        ) : null}

        {!cfg.heroFirst ? hero : null}
        {sections}
        <View className="mt-0.5 flex-row flex-wrap gap-[3px]">
          {Array.from({ length: cfg.columns === 3 ? 6 : 4 }).map((_, i) => (
            <View key={i} style={{ width: cfg.columns === 3 ? "31%" : "48%", aspectRatio: 1 }} className={`rounded-[3px] ${i % 2 ? "bg-ink/15" : "bg-ink/25"}`} />
          ))}
        </View>
      </View>
    </View>
  );
}
