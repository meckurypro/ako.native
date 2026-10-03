// src/components/post/HeadingColorPicker.tsx
// Round swatch beside the heading field; tapping opens a small palette popover
// (Default + 8 colours) anchored under it.
import { Check } from "lucide-react-native";
import { useRef, useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";

import { OverlayPanel } from "@/components/ui/OverlayPanel";
import { Portal } from "@/components/ui/Portal";
import { Icon } from "@/components/ui/styled";
import { useBackDismiss } from "@/hooks/useBackDismiss";
import { HEADING_COLORS, getHeadingColorDef } from "@/lib/headingColors";
import { useTheme } from "@/theme/ThemeProvider";
import { headingSwatchColor } from "./PostContent";

interface HeadingColorPickerProps {
  value: string | null;
  onChange: (key: string | null) => void;
}

const COLUMNS = 4;
const SWATCH = 36;
const GAP = 12;
const PADDING = 12;
const PANEL_WIDTH = COLUMNS * SWATCH + (COLUMNS - 1) * GAP + PADDING * 2;

export function HeadingColorPicker({ value, onChange }: HeadingColorPickerProps) {
  const { colors } = useTheme();
  const { width: windowW, height: windowH } = useWindowDimensions();
  const anchorRef = useRef<View>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const open = pos !== null;
  useBackDismiss(() => setPos(null), open);

  const currentDef = getHeadingColorDef(value);
  const rows = Math.ceil((HEADING_COLORS.length + 1) / COLUMNS);
  const panelHeight = rows * SWATCH + (rows - 1) * GAP + PADDING * 2;

  function openPicker() {
    anchorRef.current?.measureInWindow((x, y, w, h) => {
      const left = Math.min(Math.max(x + w / 2 - PANEL_WIDTH / 2, 8), windowW - PANEL_WIDTH - 8);
      const spaceBelow = windowH - (y + h);
      const top = spaceBelow > panelHeight + 12 ? y + h + 8 : y - panelHeight - 8;
      setPos({ top, left });
    });
  }

  function pick(key: string | null) {
    onChange(key);
    setPos(null);
  }

  return (
    <>
      <Pressable
        ref={anchorRef}
        collapsable={false}
        onPress={openPicker}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={currentDef ? `Heading color: ${currentDef.label}` : "Heading color"}
        accessibilityState={{ expanded: open }}
        className={`h-6 w-6 shrink-0 rounded-full ${currentDef ? "" : "border-2 border-dashed border-ink-muted/40"}`}
        style={currentDef ? { backgroundColor: headingSwatchColor(currentDef.key, colors) } : undefined}
      />

      {open ? (
        <Portal zIndex={50}>
          <Pressable className="absolute inset-0" onPress={() => setPos(null)} accessibilityLabel="Close" />
          <View style={{ position: "absolute", top: pos.top, left: pos.left, width: PANEL_WIDTH }}>
            <OverlayPanel className="rounded-2xl" style={{ padding: PADDING }}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: GAP }}>
                {/* "Default" clears the pick — same dashed ring as the unset button. */}
                <Pressable
                  onPress={() => pick(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Default heading color"
                  className="items-center justify-center rounded-full border-2 border-dashed border-overlay-ink-muted/60"
                  style={{ width: SWATCH, height: SWATCH }}
                >
                  {value === null ? <Icon as={Check} size={16} className="text-overlay-ink-muted" /> : null}
                </Pressable>

                {HEADING_COLORS.map((c) => (
                  <Pressable
                    key={c.key}
                    onPress={() => pick(c.key)}
                    accessibilityRole="button"
                    accessibilityLabel={c.label}
                    className="items-center justify-center rounded-full"
                    style={{ width: SWATCH, height: SWATCH, backgroundColor: headingSwatchColor(c.key, colors) }}
                  >
                    {/* Always-white badge behind the check: the swatch fills range from deep wine to
                        pale gold, so one fixed icon colour can't stay legible against all of them. */}
                    {value === c.key ? (
                      <View className="h-4 w-4 items-center justify-center rounded-full bg-white/95">
                        <Icon as={Check} size={11} strokeWidth={3} className="text-neutral-800" />
                      </View>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            </OverlayPanel>
          </View>
        </Portal>
      ) : null}
    </>
  );
}
