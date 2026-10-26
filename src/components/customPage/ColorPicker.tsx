// File: src/components/customPage/ColorPicker.tsx
// Native twin of the web colour picker: drag around the saturation/brightness box, slide the hue bar, or type a hex /
// RGB number. Everything stays in sync and the parent gets a valid #RRGGBB on every change, so the live preview updates
// while the person drags. "Pick colours from an image" fills Primary, Secondary and Accent from a photo or logo, with Undo.
import { Check, ChevronDown, ImagePlus, Undo2 } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { PanResponder, Platform, Pressable, TextInput, View, type LayoutChangeEvent } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { clamp, hexToRgb, hsvToRgb, normaliseHex, rgbToHex, rgbToHsv, type Hsv } from "@/lib/colorMath";
import { paletteErrorMessage, paletteFromImage } from "@/lib/imagePalette";
import { pickSingleImage } from "@/lib/pickImage";
import { useTheme } from "@/theme/ThemeProvider";

export { hexToRgb, hsvToRgb, normaliseHex, rgbToHex, rgbToHsv };

const MONO = Platform.select({ ios: "Menlo", default: "monospace" });
const THUMB = 20;
const THUMB_SHADOW = { shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 3, shadowOffset: { width: 0, height: 2 }, elevation: 3 } as const;

/** Touch-driven 1D/2D drag surface. Reports 0–1 positions. The latest callbacks are read through refs so a fast drag
 *  never acts on a stale closure, and the surface refuses to give the touch back, so the editor never scrolls under the finger. */
function useDrag(onMove: (x: number, y: number) => void, onEnd: () => void) {
  const size = useRef({ w: 1, h: 1 });
  const start = useRef({ x: 0, y: 0 });
  const move = useRef(onMove);
  const end = useRef(onEnd);
  move.current = onMove;
  end.current = onEnd;
  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        start.current = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
        move.current(clamp(start.current.x / size.current.w, 0, 1), clamp(start.current.y / size.current.h, 0, 1));
      },
      onPanResponderMove: (_e, g) => {
        move.current(clamp((start.current.x + g.dx) / size.current.w, 0, 1), clamp((start.current.y + g.dy) / size.current.h, 0, 1));
      },
      onPanResponderRelease: () => end.current(),
      onPanResponderTerminate: () => end.current(),
    }),
  );
  const onLayout = (e: LayoutChangeEvent) => {
    size.current = { w: Math.max(1, e.nativeEvent.layout.width), h: Math.max(1, e.nativeEvent.layout.height) };
  };
  return { handlers: responder.panHandlers, onLayout };
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const { colors } = useTheme();
  // The picker owns its colour while the person is interacting (HSV is the source of truth — hex → HSV loses the hue at
  // black/white/grey, which would make the hue slider jump back to red). The parent only receives updates at most once
  // per animation frame, so a drag doesn't re-render the whole editor and live preview on every touch event.
  const [hsv, setHsv] = useState<Hsv>(() => rgbToHsv(...hexToRgb(value)));
  const hsvRef = useRef(hsv);
  const [hexText, setHexText] = useState(value.toUpperCase());
  const sent = useRef(value.toUpperCase()); // last value handed to the parent
  const pending = useRef<string | null>(null);
  const raf = useRef<number | null>(null);
  const dragging = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const flush = useCallback(() => {
    raf.current = null;
    if (pending.current && pending.current !== sent.current) {
      sent.current = pending.current;
      onChangeRef.current(pending.current);
    }
    pending.current = null;
  }, []);

  // Pick up changes that came from outside (e.g. colours read from an image, or Undo). Our own echoes are ignored, and
  // nothing is applied mid-drag, so the thumb can never be yanked back to an older value.
  useEffect(() => {
    const v = value.toUpperCase();
    if (dragging.current || v === sent.current || v === pending.current) return;
    sent.current = v;
    const next = rgbToHsv(...hexToRgb(v));
    const merged = next.s === 0 || next.v === 0 ? { ...next, h: hsvRef.current.h } : next;
    hsvRef.current = merged;
    setHsv(merged);
    setHexText(v);
  }, [value]);

  useEffect(
    () => () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      if (pending.current && pending.current !== sent.current) onChangeRef.current(pending.current);
    },
    [],
  );

  const emit = useCallback(
    (next: Hsv, immediate = false) => {
      hsvRef.current = next;
      setHsv(next);
      const hex = rgbToHex(...hsvToRgb(next));
      setHexText(hex);
      pending.current = hex;
      if (immediate) {
        if (raf.current !== null) cancelAnimationFrame(raf.current);
        flush();
      } else if (raf.current === null) {
        raf.current = requestAnimationFrame(flush);
      }
    },
    [flush],
  );

  const endDrag = useCallback(() => {
    dragging.current = false;
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    flush(); // make sure the final position is what the parent has
  }, [flush]);

  const box = useDrag((x, y) => {
    dragging.current = true;
    emit({ ...hsvRef.current, s: x, v: 1 - y });
  }, endDrag);
  const hue = useDrag((x) => {
    dragging.current = true;
    emit({ ...hsvRef.current, h: x * 359.999 });
  }, endDrag);

  const [r, g, b] = hsvToRgb(hsv).map(Math.round) as [number, number, number];
  const hex = rgbToHex(r, g, b);
  const pure = `hsl(${Math.round(hsv.h)}, 100%, 50%)`;

  function commitHex(text: string) {
    const h = normaliseHex(text);
    if (!h) {
      setHexText(hex); // invalid → snap back to what's showing
      return;
    }
    const next = rgbToHsv(...hexToRgb(h));
    // Keep the current hue when the typed colour has none (greys), so the slider doesn't snap to red.
    emit(next.s === 0 || next.v === 0 ? { ...next, h: hsvRef.current.h } : next, true);
  }

  function setChannel(i: 0 | 1 | 2, raw: string) {
    const n = clamp(parseInt(raw.replace(/\D/g, "") || "0", 10), 0, 255);
    const rgb: [number, number, number] = [r, g, b];
    rgb[i] = n;
    const next = rgbToHsv(...rgb);
    emit(next.s === 0 || next.v === 0 ? { ...next, h: hsvRef.current.h } : next, true);
  }

  const inputBase = { fontFamily: MONO, color: colors.ink } as const;

  return (
    <View className="rounded-2xl border border-border bg-surface p-3">
      {/* Saturation (→) and brightness (↑) */}
      <View
        {...box.handlers}
        onLayout={box.onLayout}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Colour shade"
        accessibilityValue={{ text: hex }}
        className="h-44 w-full overflow-hidden rounded-xl"
        style={{ backgroundColor: pure }}
      >
        <Svg width="100%" height="100%" pointerEvents="none">
          <Defs>
            <LinearGradient id="cpWhite" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#fff" stopOpacity={1} />
              <Stop offset="1" stopColor="#fff" stopOpacity={0} />
            </LinearGradient>
            <LinearGradient id="cpBlack" x1="0" y1="1" x2="0" y2="0">
              <Stop offset="0" stopColor="#000" stopOpacity={1} />
              <Stop offset="1" stopColor="#000" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#cpWhite)" />
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#cpBlack)" />
        </Svg>
        <View
          pointerEvents="none"
          style={[
            { position: "absolute", width: THUMB, height: THUMB, marginLeft: -THUMB / 2, marginTop: -THUMB / 2, borderRadius: THUMB / 2, borderWidth: 2, borderColor: "#fff", backgroundColor: hex, left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` },
            THUMB_SHADOW,
          ]}
        />
      </View>

      {/* Hue */}
      <View
        {...hue.handlers}
        onLayout={hue.onLayout}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Hue"
        accessibilityValue={{ min: 0, max: 360, now: Math.round(hsv.h) }}
        className="mt-3 h-4 w-full rounded-full"
      >
        <View className="absolute inset-0 overflow-hidden rounded-full" pointerEvents="none">
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id="cpHue" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#f00" />
                <Stop offset="0.17" stopColor="#ff0" />
                <Stop offset="0.33" stopColor="#0f0" />
                <Stop offset="0.5" stopColor="#0ff" />
                <Stop offset="0.67" stopColor="#00f" />
                <Stop offset="0.83" stopColor="#f0f" />
                <Stop offset="1" stopColor="#f00" />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#cpHue)" />
          </Svg>
        </View>
        <View
          pointerEvents="none"
          style={[
            { position: "absolute", top: "50%", width: THUMB, height: THUMB, marginLeft: -THUMB / 2, marginTop: -THUMB / 2, borderRadius: THUMB / 2, borderWidth: 2, borderColor: "#fff", backgroundColor: pure, left: `${(hsv.h / 360) * 100}%` },
            THUMB_SHADOW,
          ]}
        />
      </View>

      {/* Number inputs */}
      <View className="mt-3 flex-row items-end gap-2">
        <View className="h-11 w-11 rounded-xl border border-border" style={{ backgroundColor: hex }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
        <View className="min-w-0 flex-1">
          <Text className="mb-1 text-[10px] uppercase tracking-wide text-ink-muted">Hex</Text>
          <TextInput
            value={hexText}
            onChangeText={(t) => {
              setHexText(t);
              // Apply live only on a full 6-digit value, so typing "#3D5" isn't expanded under the person's fingers.
              if (/^#?[0-9a-fA-F]{6}$/.test(t.trim())) commitHex(t);
            }}
            onBlur={() => commitHex(hexText)}
            onSubmitEditing={() => commitHex(hexText)}
            autoCapitalize="characters"
            autoCorrect={false}
            spellCheck={false}
            maxLength={7}
            accessibilityLabel="Hex colour"
            selectionColor={colors.accent}
            className="rounded-lg border border-border bg-canvas px-2.5 py-2 text-sm"
            style={inputBase}
          />
        </View>
        {(["R", "G", "B"] as const).map((label, i) => (
          <View key={label} className="w-12">
            <Text className="mb-1 text-[10px] uppercase tracking-wide text-ink-muted">{label}</Text>
            <TextInput
              value={String([r, g, b][i])}
              onChangeText={(t) => setChannel(i as 0 | 1 | 2, t)}
              keyboardType="number-pad"
              maxLength={3}
              accessibilityLabel={`${label} channel`}
              selectionColor={colors.accent}
              className="rounded-lg border border-border bg-canvas px-1.5 py-2 text-center text-sm"
              style={inputBase}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

type Slot = "primary" | "secondary" | "accent";
const KEYS = ["primary", "secondary", "accent"] as const;
const SLOT_LABEL: Record<Slot, string> = { primary: "Primary", secondary: "Secondary", accent: "Accent" };

/** Three brand-colour swatches; tapping one opens the picker beneath. */
export function BrandColorFields({ colors: brand, onChange }: { colors: Record<Slot, string>; onChange: (slot: Slot, hex: string) => void }) {
  const [open, setOpen] = useState<Slot | null>("primary");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const [before, setBefore] = useState<Record<Slot, string> | null>(null);

  const fromImage = async () => {
    if (busy) return;
    const file = await pickSingleImage();
    if (!file) return;
    setBusy(true);
    setNote(null);
    try {
      const found = await paletteFromImage(file);
      setBefore(brand);
      KEYS.forEach((k) => onChange(k, found[k]));
      setNote({ text: "Colours picked from your image. Tap any swatch to fine-tune." });
    } catch (err) {
      setNote({ text: paletteErrorMessage(err), error: true });
    } finally {
      setBusy(false);
    }
  };
  const undo = () => {
    if (!before) return;
    KEYS.forEach((k) => onChange(k, before[k]));
    setBefore(null);
    setNote(null);
  };

  return (
    <View className="mb-6">
      <View className="mb-3 rounded-xl border border-border bg-surface p-3">
        <View className="flex-row flex-wrap items-center gap-2">
          <Pressable
            onPress={() => void fromImage()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy, busy }}
            className={`flex-row items-center gap-2 rounded-full bg-accent-soft px-4 py-2 ${busy ? "opacity-50" : ""}`}
          >
            <Icon as={ImagePlus} size={15} className="text-accent" />
            <Text className="text-sm font-medium text-accent">{busy ? "Reading image…" : "Pick colours from an image"}</Text>
          </Pressable>
          {before && !busy ? (
            <Pressable onPress={undo} accessibilityRole="button" hitSlop={6} className="flex-row items-center gap-1.5 px-2 py-2">
              <Icon as={Undo2} size={14} className="text-ink-muted" />
              <Text className="text-sm font-medium text-ink-muted">Undo</Text>
            </Pressable>
          ) : null}
        </View>
        <Text accessibilityLiveRegion="polite" className={`mt-2 text-xs ${note?.error ? "text-danger" : "text-ink-muted"}`}>
          {note?.text ?? "Upload a logo or photo and we'll fill Primary, Secondary and Accent from it. The image stays on your device."}
        </Text>
      </View>

      <View className="flex-row gap-3">
        {KEYS.map((k) => {
          const active = open === k;
          return (
            <Pressable
              key={k}
              onPress={() => setOpen(active ? null : k)}
              accessibilityRole="button"
              accessibilityState={{ expanded: active }}
              accessibilityLabel={`${SLOT_LABEL[k]} colour ${brand[k]}`}
              className={`flex-1 items-center gap-2 rounded-xl border bg-surface p-3 ${active ? "border-accent" : "border-border"}`}
              style={active ? { borderWidth: 2 } : undefined}
            >
              <View className="h-12 w-12 items-center justify-center rounded-lg border border-border" style={{ backgroundColor: brand[k] }}>
                {active ? <Icon as={ChevronDown} size={16} className="text-canvas" /> : null}
              </View>
              <Text className="text-xs font-medium capitalize text-ink">{k}</Text>
              <Text className="text-[11px] uppercase text-ink-muted" style={{ fontFamily: MONO }}>
                {brand[k]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {open ? (
        <View className="mt-3">
          <ColorPicker key={open} value={brand[open]} onChange={(hex) => onChange(open, hex)} />
          <Pressable onPress={() => setOpen(null)} accessibilityRole="button" className="mt-2 flex-row items-center gap-1.5 self-start rounded-full bg-accent-soft px-4 py-2">
            <Icon as={Check} size={14} className="text-accent" />
            <Text className="text-sm font-medium text-accent">Done</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
