// src/components/customPage/ColorPicker.tsx
// Brand colour fields for the Custom Page editor: three swatches (primary, secondary, accent); tap one to tune it with
// hue / saturation / brightness sliders, a hex field or a preset. Native has no colour input, so this is built from
// sliders. Every change is a valid #RRGGBB — the editor never sees a half-typed colour.
import Slider from "@react-native-community/slider";
import { useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { Text } from "@/components/ui/Text";
import { isHex, readableOn } from "@/lib/customPage";
import { useTheme } from "@/theme/ThemeProvider";

type Slot = "primary" | "secondary" | "accent";
const SLOTS: { id: Slot; label: string }[] = [
  { id: "primary", label: "Primary" },
  { id: "secondary", label: "Secondary" },
  { id: "accent", label: "Accent" },
];

const PRESETS = [
  "#3D5A45", "#1F3A5F", "#7A1F3D", "#B8862E", "#C2410C", "#0F766E", "#4338CA", "#111827",
  "#F7F4EF", "#FFFFFF", "#FDE68A", "#FBCFE8", "#BAE6FD", "#BBF7D0", "#E5E7EB", "#6B7280",
];

function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

function SliderRow({ label, value, max, onChange, accessibilityLabel }: { label: string; value: number; max: number; onChange: (v: number) => void; accessibilityLabel: string }) {
  const { colors } = useTheme();
  return (
    <View className="mb-1 flex-row items-center gap-3">
      <Text className="w-24 text-xs text-ink-muted">{label}</Text>
      <Slider
        style={{ flex: 1, height: 36 }}
        minimumValue={0}
        maximumValue={max}
        value={value}
        onValueChange={onChange}
        minimumTrackTintColor={colors.accent}
        maximumTrackTintColor={colors.border}
        thumbTintColor={colors.accent}
        accessibilityLabel={accessibilityLabel}
      />
    </View>
  );
}

export function BrandColorFields({ colors: brand, onChange }: { colors: Record<Slot, string>; onChange: (slot: Slot, hex: string) => void }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState<Slot>("primary");
  const hex = brand[open];
  const [hsv, setHsv] = useState(() => hexToHsv(hex));
  const [text, setText] = useState(hex);

  // Switching slots (or a preset / hex entry) re-seeds the sliders from the new colour.
  useEffect(() => {
    setHsv(hexToHsv(hex));
    setText(hex);
  }, [hex, open]);

  const fromHsv = (next: { h: number; s: number; v: number }) => {
    setHsv(next);
    const out = hsvToHex(next.h, next.s, next.v);
    setText(out);
    if (out !== hex) onChange(open, out);
  };

  return (
    <View className="mb-6">
      <View className="flex-row gap-3">
        {SLOTS.map((s) => {
          const active = open === s.id;
          return (
            <Pressable
              key={s.id}
              onPress={() => setOpen(s.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${s.label} colour ${brand[s.id]}`}
              className={`flex-1 items-center gap-2 rounded-xl border p-3 ${active ? "border-accent bg-accent-soft" : "border-border bg-surface"}`}
            >
              <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: brand[s.id], borderWidth: 1, borderColor: "rgba(0,0,0,0.12)" }} />
              <Text className="text-xs font-medium text-ink">{s.label}</Text>
              <Text className="text-[11px] uppercase text-ink-muted">{brand[s.id]}</Text>
            </Pressable>
          );
        })}
      </View>

      <View className="mt-3 rounded-2xl border border-border bg-surface p-4">
        <View className="mb-3 h-14 items-center justify-center rounded-xl" style={{ backgroundColor: hex }}>
          <Text className="text-sm font-semibold" style={{ color: readableOn(hex) }}>
            {SLOTS.find((s) => s.id === open)?.label}
          </Text>
        </View>
        <SliderRow label="Hue" value={hsv.h} max={359} onChange={(h) => fromHsv({ ...hsv, h })} accessibilityLabel="Hue" />
        <SliderRow label="Saturation" value={hsv.s * 100} max={100} onChange={(s) => fromHsv({ ...hsv, s: s / 100 })} accessibilityLabel="Saturation" />
        <SliderRow label="Brightness" value={hsv.v * 100} max={100} onChange={(v) => fromHsv({ ...hsv, v: v / 100 })} accessibilityLabel="Brightness" />
        <View className="mt-2 flex-row items-center gap-3">
          <Text className="w-24 text-xs text-ink-muted">Hex</Text>
          <TextInput
            value={text}
            onChangeText={(t) => {
              const v = `#${t.replace(/[^0-9a-fA-F]/g, "").slice(0, 6)}`.toUpperCase();
              setText(v);
              if (isHex(v)) onChange(open, v);
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={7}
            accessibilityLabel="Hex colour"
            placeholderTextColor={colors.inkMuted}
            selectionColor={colors.accent}
            className="flex-1 rounded-xl border border-border px-3 py-2 text-sm text-ink"
            style={{ fontFamily: "Inter_400Regular" }}
          />
        </View>
        <View className="mt-4 flex-row flex-wrap gap-2.5">
          {PRESETS.map((p) => (
            <Pressable
              key={p}
              onPress={() => onChange(open, p)}
              accessibilityRole="button"
              accessibilityLabel={`Use ${p}`}
              style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: p, borderWidth: p === hex ? 3 : 1, borderColor: p === hex ? colors.accent : "rgba(0,0,0,0.15)" }}
            />
          ))}
        </View>
      </View>
    </View>
  );
}
