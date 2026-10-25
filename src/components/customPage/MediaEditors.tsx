// src/components/customPage/MediaEditors.tsx
// Editor controls for the three "page dressing" features (native twin of the web file): background picture,
// foreground picture, page menu.
import Slider from "@react-native-community/slider";
import { ArrowDown, ArrowUp, Plus, RotateCcw, Trash2 } from "lucide-react-native";
import { useRef, useState } from "react";
import { PanResponder, Pressable, View, type GestureResponderEvent } from "react-native";
import Svg, { Path } from "react-native-svg";

import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { Toggle } from "@/components/ui/Toggle";
import {
  BACKGROUND_BY_TEMPLATE,
  BACKGROUND_FITS,
  BACKGROUND_LOOKS,
  FOREGROUND_DEFAULTS,
  FOREGROUND_LIMITS,
  LIMITS,
  NAV_TARGETS,
  SCROLL_ANIMATIONS,
  availableNavTargets,
  newNavId,
  publicFileUrl,
  resolveBackground,
  resolveDesign,
  resolveForeground,
  resolveNav,
  type BackgroundFit,
  type BackgroundLook,
  type CustomPageBackground,
  type CustomPageConfig,
  type CustomPageForeground,
  type CustomPageNav,
  type CustomPageNavItem,
  type NavTarget,
} from "@/lib/customPage";
import { SHAPES } from "@/lib/customPageShapes";
import { useTheme } from "@/theme/ThemeProvider";

import { ForegroundArt } from "./CustomPageRenderer";
import { Choice, Field, Input, SingleImage } from "./EditorParts";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function Chip({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }} className={`rounded-full px-4 py-2 ${on ? "bg-ink" : "border border-border bg-surface"}`}>
      <Text className={`text-sm font-medium ${on ? "text-canvas" : "text-ink-muted"}`}>{label}</Text>
    </Pressable>
  );
}

function SliderRow({ label, value, min, max, step = 1, unit = "", onChange, onReset }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void; onReset?: () => void }) {
  const { colors } = useTheme();
  return (
    <View className="mb-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-[13px] font-medium text-ink">{label}</Text>
        <View className="flex-row items-center gap-2">
          <Text className="text-xs text-ink-muted">{`${Math.round(value * 10) / 10}${unit}`}</Text>
          {onReset ? (
            <Pressable onPress={onReset} accessibilityRole="button" accessibilityLabel={`Reset ${label}`} hitSlop={8}>
              <Icon as={RotateCcw} size={13} className="text-ink-muted" />
            </Pressable>
          ) : null}
        </View>
      </View>
      <Slider
        style={{ height: 36 }}
        minimumValue={min}
        maximumValue={max}
        step={step}
        value={value}
        onValueChange={onChange}
        minimumTrackTintColor={colors.accent}
        maximumTrackTintColor={colors.border}
        thumbTintColor={colors.accent}
        accessibilityLabel={label}
      />
    </View>
  );
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <View className="mb-4 flex-row items-center gap-3 rounded-2xl border border-border bg-surface p-4">
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-medium text-ink">{label}</Text>
        {hint ? <Text className="mt-0.5 text-xs leading-4 text-ink-muted">{hint}</Text> : null}
      </View>
      <Toggle checked={checked} onChange={onChange} accessibilityLabel={label} />
    </View>
  );
}

// ── Background ──────────────────────────────────────────────────────────────────────────────────────────────
export function BackgroundEditor({ config, ownerId, pageId, onChange }: { config: CustomPageConfig; ownerId: string; pageId: string; onChange: (bg: CustomPageBackground | undefined) => void }) {
  const bg = config.brand?.background;
  const resolved = resolveBackground(config);
  const url = publicFileUrl(bg?.path);
  const template = resolveDesign(config).template;
  const auto = BACKGROUND_BY_TEMPLATE[template];
  const patch = (p: Partial<CustomPageBackground>) => onChange({ ...bg, ...p });
  return (
    <View>
      <SingleImage
        label="Background picture"
        hint="Sits behind your whole page. Pick something with room for text, or let the look below soften it."
        path={bg?.path}
        ownerId={ownerId}
        pageId={pageId}
        onChange={(path) => (path ? patch({ path }) : onChange(undefined))}
      />
      {url && resolved ? (
        <>
          <Field label="Fit" hint={`${BACKGROUND_FITS.find((f) => f.id === (bg?.fit ?? "auto"))?.blurb ?? ""}${(bg?.fit ?? "auto") === "auto" ? ` (${auto.fit === "cover" ? "Fill" : auto.fit} for your ${template} layout.)` : ""}`}>
            <View className="flex-row flex-wrap gap-2">
              {BACKGROUND_FITS.map((f) => (
                <Chip key={f.id} on={(bg?.fit ?? "auto") === f.id} label={f.label} onPress={() => patch({ fit: f.id as BackgroundFit })} />
              ))}
            </View>
          </Field>
          <Field label="Look" hint={BACKGROUND_LOOKS.find((l) => l.id === (bg?.look ?? "auto"))?.blurb}>
            <View className="flex-row flex-wrap gap-2">
              {BACKGROUND_LOOKS.map((l) => (
                <Chip key={l.id} on={(bg?.look ?? "auto") === l.id} label={l.label} onPress={() => patch({ look: l.id as BackgroundLook })} />
              ))}
            </View>
          </Field>
        </>
      ) : null}
    </View>
  );
}

// ── Foreground ──────────────────────────────────────────────────────────────────────────────────────────────
function ShapeTile({ label, path, aspect, active, onPress }: { label: string; path?: string; aspect?: number; active: boolean; onPress: () => void }) {
  const box = 34;
  const w = aspect && aspect < 1 ? box * aspect : box;
  const h = aspect && aspect > 1 ? box / aspect : box;
  const { colors } = useTheme();
  const color = active ? colors.accent : colors.inkMuted;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      className={`items-center justify-center gap-1 rounded-xl border p-2 ${active ? "border-accent bg-accent-soft" : "border-border bg-surface"}`}
      style={{ width: "23%" }}
    >
      <View style={{ width: box, height: box, alignItems: "center", justifyContent: "center" }}>
        {path ? (
          <Svg width={w} height={h} viewBox="0 0 1 1" preserveAspectRatio="none">
            <Path d={path} fill={color} />
          </Svg>
        ) : (
          <Svg width={box} height={box} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8}>
            <Path d="M5 5h14v14H5zM5 15l4-4 4 4 3-3 3 3" />
          </Svg>
        )}
      </View>
      <Text className="text-[10.5px] text-ink-muted" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A compass: drag or tap anywhere to set the direction the shadow falls. */
function AngleDial({ angle, onChange }: { angle: number; onChange: (a: number) => void }) {
  const size = 96;
  const rad = (angle * Math.PI) / 180;
  // The responder is created once, so it reads the latest callback through a ref.
  const latest = useRef(onChange);
  latest.current = onChange;
  const set = (e: GestureResponderEvent) => {
    const { locationX, locationY } = e.nativeEvent;
    const deg = (Math.atan2(locationY - size / 2, locationX - size / 2) * 180) / Math.PI;
    latest.current(Math.round((deg + 360) % 360));
  };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => set(e),
      onPanResponderMove: (e) => set(e),
    })
  ).current;
  return (
    <View
      {...pan.panHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Shadow direction"
      accessibilityValue={{ min: 0, max: 360, now: angle }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => onChange((angle + (e.nativeEvent.actionName === "increment" ? 10 : 350)) % 360)}
      className="rounded-full border border-border bg-surface"
      style={{ width: size, height: size }}
    >
      <View pointerEvents="none" style={{ position: "absolute", left: size / 2 - 18, top: size / 2 - 18, width: 36, height: 36, borderRadius: 8, backgroundColor: "rgba(0,0,0,0.12)", shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 3, shadowOffset: { width: Math.cos(rad) * 5, height: Math.sin(rad) * 5 } }} />
      <View pointerEvents="none" className="absolute h-3 w-3 rounded-full bg-accent" style={{ left: size / 2 + Math.cos(rad) * 38 - 6, top: size / 2 + Math.sin(rad) * 38 - 6 }} />
    </View>
  );
}

export function ForegroundEditor({ config, ownerId, pageId, onChange, onDragging }: { config: CustomPageConfig; ownerId: string; pageId: string; onChange: (fg: CustomPageForeground | undefined) => void; onDragging?: (dragging: boolean) => void }) {
  const fg = config.foreground;
  const resolved = resolveForeground(config);
  const url = publicFileUrl(fg?.path);

  // The pan responders live for the whole mount, so they read the latest state through a ref.
  const live = useRef({ fg, resolved, onChange, onDragging });
  live.current = { fg, resolved, onChange, onDragging };
  const patch = (p: Partial<CustomPageForeground>) => onChange({ ...fg, ...p });
  const patchCrop = (p: Partial<NonNullable<CustomPageForeground["crop"]>>) => patch({ crop: { ...fg?.crop, ...p } });
  const patchShadow = (p: Partial<NonNullable<CustomPageForeground["shadow"]>>) => patch({ shadow: { ...fg?.shadow, ...p } });

  const [stageW, setStageW] = useState(0);
  const stageSize = useRef(0);
  stageSize.current = stageW;
  const grab = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const moveTo = (e: GestureResponderEvent) => {
    const { resolved: r, fg: f, onChange: change } = live.current;
    const w = stageSize.current;
    if (!r || !w) return;
    const x = (e.nativeEvent.locationX / w) * 100 - grab.current.dx;
    const y = (e.nativeEvent.locationY / (w * 1.25)) * 100 - grab.current.dy;
    change({ ...f, x: Math.round(clamp(x, 0, 100) * 10) / 10, y: Math.round(clamp(y, 0, 100) * 10) / 10 });
  };
  const stagePan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const { resolved: r } = live.current;
        const w = stageSize.current;
        live.current.onDragging?.(true);
        if (!r || !w) return;
        const px = (e.nativeEvent.locationX / w) * 100;
        const py = (e.nativeEvent.locationY / (w * 1.25)) * 100;
        // Grab where you touched, so the picture doesn't jump to the finger.
        const near = Math.abs(px - r.x) < r.size / 2 + 6 && Math.abs(py - r.y) < r.size / 2 + 6;
        grab.current = near ? { dx: px - r.x, dy: py - r.y } : { dx: 0, dy: 0 };
        moveTo(e);
      },
      onPanResponderMove: (e) => moveTo(e),
      onPanResponderRelease: () => live.current.onDragging?.(false),
      onPanResponderTerminate: () => live.current.onDragging?.(false),
    })
  ).current;

  const padW = 132;
  const panFrom = useRef({ cx: 50, cy: 50 });
  const padPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        const r = live.current.resolved;
        if (r) panFrom.current = { cx: r.crop.x, cy: r.crop.y };
        live.current.onDragging?.(true);
      },
      onPanResponderMove: (_e, g) => {
        const { resolved: r, fg: f, onChange: change } = live.current;
        if (!r) return;
        // Dragging the picture right reveals more of its left, so the focal point moves the other way.
        const k = 100 / Math.max(1, r.crop.zoom);
        const nx = clamp(panFrom.current.cx - (g.dx / padW) * k, 0, 100);
        const ny = clamp(panFrom.current.cy - (g.dy / (padW * 1.25)) * k, 0, 100);
        change({ ...f, crop: { ...f?.crop, x: Math.round(nx), y: Math.round(ny) } });
      },
      onPanResponderRelease: () => live.current.onDragging?.(false),
      onPanResponderTerminate: () => live.current.onDragging?.(false),
    })
  ).current;

  return (
    <View>
      <SingleImage
        label="Foreground picture"
        hint="A picture that sits on top of your page. Use a PNG with a transparent background to place a cut-out."
        path={fg?.path}
        ownerId={ownerId}
        pageId={pageId}
        onChange={(path) => (path ? patch({ path }) : onChange(undefined))}
      />

      {url && resolved ? (
        <>
          <Field label="Shape" hint="The picture is clipped to this shape. Choose “None” to show it as it is.">
            <View className="flex-row flex-wrap" style={{ gap: 8 }}>
              <ShapeTile label="None" active={!resolved.shape} onPress={() => patch({ shape: "none" })} />
              {SHAPES.map((s) => (
                <ShapeTile key={s.id} label={s.label} path={s.path} aspect={s.aspect} active={resolved.shape?.id === s.id} onPress={() => patch({ shape: s.id })} />
              ))}
            </View>
          </Field>

          <Field label="Position" hint="Drag the picture to place it. This is the first screen of your page.">
            <View className="items-center">
              <View
                {...stagePan.panHandlers}
                onLayout={(e) => setStageW(e.nativeEvent.layout.width)}
                className="overflow-hidden rounded-2xl border border-border bg-ink/5"
                style={{ width: "62%", aspectRatio: 4 / 5 }}
              >
                {stageW > 0 ? (
                  <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }}>
                    <ForegroundArt fg={resolved} uri={url} stageW={stageW} />
                  </View>
                ) : null}
              </View>
              <Pressable onPress={() => patch({ x: FOREGROUND_DEFAULTS.x, y: FOREGROUND_DEFAULTS.y })} accessibilityRole="button" className="mt-2 flex-row items-center gap-1" hitSlop={8}>
                <Icon as={RotateCcw} size={12} className="text-ink-muted" />
                <Text className="text-xs text-ink-muted">Centre it</Text>
              </Pressable>
            </View>
          </Field>

          <SliderRow label="Size" value={resolved.size} min={FOREGROUND_LIMITS.size[0]} max={FOREGROUND_LIMITS.size[1]} unit="%" onChange={(size) => patch({ size: Math.round(size) })} onReset={() => patch({ size: FOREGROUND_DEFAULTS.size })} />
          <SliderRow label="Rotation" value={resolved.rotation} min={FOREGROUND_LIMITS.rotation[0]} max={FOREGROUND_LIMITS.rotation[1]} unit="°" onChange={(rotation) => patch({ rotation: Math.round(rotation) })} onReset={() => patch({ rotation: 0 })} />

          {resolved.shape ? (
            <Field label="Crop" hint="Drag inside the shape to choose which part of the picture shows. Zoom in to crop closer.">
              <View className="flex-row items-start gap-4">
                <View {...padPan.panHandlers} className="overflow-hidden rounded-xl border border-border bg-ink/5" style={{ width: padW, height: padW * 1.25 }}>
                  <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }}>
                    <ForegroundArt fg={{ ...resolved, x: 50, y: 50, size: 84, rotation: 0, shadow: { ...resolved.shadow, enabled: false } }} uri={url} stageW={padW} />
                  </View>
                </View>
                <View className="min-w-0 flex-1">
                  <SliderRow label="Zoom" value={resolved.crop.zoom} min={FOREGROUND_LIMITS.zoom[0]} max={FOREGROUND_LIMITS.zoom[1]} step={0.05} unit="×" onChange={(zoom) => patchCrop({ zoom: Math.round(zoom * 100) / 100 })} onReset={() => patchCrop({ zoom: 1, x: 50, y: 50 })} />
                  <SliderRow label="Left / right" value={resolved.crop.x} min={0} max={100} unit="%" onChange={(x) => patchCrop({ x: Math.round(x) })} />
                  <SliderRow label="Up / down" value={resolved.crop.y} min={0} max={100} unit="%" onChange={(y) => patchCrop({ y: Math.round(y) })} />
                </View>
              </View>
            </Field>
          ) : null}

          <ToggleRow label="Drop shadow" hint="Lifts the picture off the page." checked={resolved.shadow.enabled} onChange={(enabled) => patchShadow({ enabled })} />
          {resolved.shadow.enabled ? (
            <View className="-mt-1 mb-4 flex-row items-center gap-4">
              <AngleDial angle={resolved.shadow.angle} onChange={(angle) => patchShadow({ angle })} />
              <View className="min-w-0 flex-1">
                <SliderRow label="Intensity" value={resolved.shadow.intensity} min={FOREGROUND_LIMITS.intensity[0]} max={FOREGROUND_LIMITS.intensity[1]} unit="%" onChange={(intensity) => patchShadow({ intensity: Math.round(intensity) })} />
                <SliderRow label="Direction" value={resolved.shadow.angle} min={0} max={360} unit="°" onChange={(angle) => patchShadow({ angle: Math.round(angle) })} />
              </View>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

// ── Menu ────────────────────────────────────────────────────────────────────────────────────────────────────
const DEFAULT_LABEL: Record<NavTarget, string> = { top: "Home", about: "About", buttons: "Links", document: "Document", gallery: "Gallery", contact: "Contact" };

export function MenuEditor({ config, onChange }: { config: CustomPageConfig; onChange: (nav: CustomPageNav) => void }) {
  const nav = config.nav ?? {};
  const resolved = resolveNav(config);
  const items = nav.items ?? [];
  const available = availableNavTargets(config);
  const patch = (p: Partial<CustomPageNav>) => onChange({ ...nav, ...p });
  const setItems = (next: CustomPageNavItem[]) => patch({ items: next });
  const patchItem = (i: number, p: Partial<CustomPageNavItem>) => setItems(items.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    setItems(next);
  };
  const addAll = () => {
    const have = new Set(items.map((i) => i.target));
    const added: CustomPageNavItem[] = [];
    for (const t of available) {
      if (have.has(t) || items.length + added.length >= LIMITS.navItems) continue;
      added.push({ id: newNavId([...items, ...added]), label: DEFAULT_LABEL[t], target: t });
    }
    if (added.length) patch({ items: [...items, ...added], enabled: true });
  };

  return (
    <View>
      <ToggleRow label="Show a menu" hint="A bar on your page. Each item scrolls the visitor to a section." checked={nav.enabled === true} onChange={(enabled) => patch({ enabled })} />
      {nav.enabled === true ? (
        <>
          <Field label="Menu items" count={items.length} max={LIMITS.navItems}>
            <View style={{ gap: 12 }}>
              {items.map((item, i) => {
                const missing = !available.includes(item.target);
                return (
                  <View key={item.id} className="rounded-2xl border border-border bg-surface p-3">
                    <View className="flex-row items-center gap-1">
                      <View className="min-w-0 flex-1">
                        <Input value={item.label} maxLength={LIMITS.navLabel + 6} placeholder="Label" onChangeText={(v) => patchItem(i, { label: v })} accessibilityLabel={`Menu item ${i + 1} label`} />
                      </View>
                      <Pressable onPress={() => move(i, -1)} disabled={i === 0} accessibilityRole="button" accessibilityLabel="Move up" hitSlop={6} className={`p-1.5 ${i === 0 ? "opacity-30" : ""}`}>
                        <Icon as={ArrowUp} size={16} className="text-ink-muted" />
                      </Pressable>
                      <Pressable onPress={() => move(i, 1)} disabled={i === items.length - 1} accessibilityRole="button" accessibilityLabel="Move down" hitSlop={6} className={`p-1.5 ${i === items.length - 1 ? "opacity-30" : ""}`}>
                        <Icon as={ArrowDown} size={16} className="text-ink-muted" />
                      </Pressable>
                      <Pressable onPress={() => setItems(items.filter((_, k) => k !== i))} accessibilityRole="button" accessibilityLabel="Remove item" hitSlop={6} className="p-1.5">
                        <Icon as={Trash2} size={16} className="text-danger" />
                      </Pressable>
                    </View>
                    <View className="mt-2 flex-row flex-wrap gap-1.5">
                      {NAV_TARGETS.map((t) => (
                        <Chip key={t.id} on={item.target === t.id} label={t.label} onPress={() => patchItem(i, { target: t.id })} />
                      ))}
                    </View>
                    {missing ? <Text className="mt-1.5 text-xs text-danger">{`Your page has no ${NAV_TARGETS.find((t) => t.id === item.target)?.label.toLowerCase()} yet, so this item stays hidden.`}</Text> : null}
                  </View>
                );
              })}
            </View>
            <View className="mt-3 flex-row flex-wrap gap-2">
              {items.length < LIMITS.navItems ? (
                <Pressable
                  onPress={() => {
                    const used = new Set(items.map((i) => i.target));
                    const t = available.find((x) => !used.has(x)) ?? "top";
                    setItems([...items, { id: newNavId(items), label: DEFAULT_LABEL[t], target: t }]);
                  }}
                  accessibilityRole="button"
                  className="flex-row items-center gap-2 rounded-full bg-accent-soft px-4 py-2.5"
                >
                  <Icon as={Plus} size={16} className="text-accent" />
                  <Text className="text-sm font-medium text-accent">Add an item</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={addAll} accessibilityRole="button" className="rounded-full border border-border bg-surface px-4 py-2.5">
                <Text className="text-sm font-medium text-ink-muted">Add every section</Text>
              </Pressable>
            </View>
          </Field>

          <Field label="Scroll animation" hint="How the page moves when someone taps an item. Instant is used automatically for people who prefer reduced motion.">
            <View style={{ gap: 10 }}>
              {SCROLL_ANIMATIONS.map((a) => (
                <Choice key={a.id} active={resolved.scroll === a.id} title={a.label} blurb={a.blurb} onPress={() => patch({ scroll: a.id })} />
              ))}
            </View>
          </Field>

          <Field label="Position">
            <View className="flex-row gap-2">
              <Chip on={resolved.position === "top"} label="Top" onPress={() => patch({ position: "top" })} />
              <Chip on={resolved.position === "bottom"} label="Bottom" onPress={() => patch({ position: "bottom" })} />
            </View>
          </Field>
          <Field label="Style">
            <View className="flex-row gap-2">
              <Chip on={resolved.look === "bar"} label="Full-width bar" onPress={() => patch({ look: "bar" })} />
              <Chip on={resolved.look === "pill"} label="Floating pill" onPress={() => patch({ look: "pill" })} />
            </View>
          </Field>
        </>
      ) : null}
    </View>
  );
}
