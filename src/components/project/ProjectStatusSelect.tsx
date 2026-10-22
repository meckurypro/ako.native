// src/components/project/ProjectStatusSelect.tsx
// The project Status control on Edit (mirrors web's ProjectStatusSelect): one button showing the current state,
// colour-coded, that opens the app's standard options list (OptionsModal — centred card with a title, themed for light
// and dark) to switch it. Replaces the old three-row radio group.
//
// Colour code (theme palette, so each is tuned for light and dark): Published = green, Draft = amber, Archived = grey.
// Text stays ink for contrast; the colour rides on the tinted fill, the border and the icon chip.
import { Archive, Check, ChevronDown, Globe, Pencil, type LucideIcon } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { OptionsModal } from "@/components/ui/OptionsModal";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import type { ProjectStatus } from "@/hooks/useProjects";
import { hexWithAlpha } from "@/theme/alphaTokens";
import { useTheme } from "@/theme/ThemeProvider";

// 'cancelled' is deliberately not offered here — it only happens through the Event/Meeting cancellation flow, which
// also handles the host's per-cancellation refund choice. Exposing it as a plain status choice would skip that.
type EditableStatus = Extract<ProjectStatus, "active" | "draft" | "archived">;

const STATUS_OPTIONS: { value: EditableStatus; label: string; hint: string; tone: "published" | "draft" | "archived"; icon: LucideIcon }[] = [
  { value: "active", label: "Published", hint: "Visible to everyone", tone: "published", icon: Globe },
  { value: "draft", label: "Draft", hint: "Only visible to you, not published yet", tone: "draft", icon: Pencil },
  { value: "archived", label: "Archived", hint: "Hidden — was published before", tone: "archived", icon: Archive },
];

export function ProjectStatusSelect({ value, onChange }: { value: ProjectStatus; onChange: (next: ProjectStatus) => void }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const toneColor = { published: colors.stanceSupport, draft: colors.pushback, archived: colors.inkMuted };
  // A legacy 'cancelled' row is shown as Archived (EditProject maps it on load), so there is always a match.
  const current = STATUS_OPTIONS.find((o) => o.value === value) ?? STATUS_OPTIONS[2];
  const currentColor = toneColor[current.tone];

  return (
    <View>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Status: ${current.label}. Change status`}
        accessibilityState={{ expanded: open }}
        className="flex-row items-center gap-3 rounded-xl border px-4 py-2.5 active:opacity-90"
        style={{ backgroundColor: hexWithAlpha(currentColor, 12), borderColor: hexWithAlpha(currentColor, 40) }}
      >
        <View className="h-8 w-8 items-center justify-center rounded-full" style={{ backgroundColor: hexWithAlpha(currentColor, 20) }}>
          <Icon as={current.icon} size={18} color={currentColor} />
        </View>
        <Text numberOfLines={1} className="flex-1 text-sm font-semibold text-ink">
          {current.label}
        </Text>
        <Icon as={ChevronDown} size={16} className="text-ink-muted" />
      </Pressable>

      {open ? (
        <OptionsModal
          title="Project status"
          onClose={() => setOpen(false)}
          items={STATUS_OPTIONS.map((o) => {
            const c = toneColor[o.tone];
            return {
              key: o.value,
              label: o.label,
              description: o.hint,
              icon: (
                <View className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: hexWithAlpha(c, 16) }}>
                  <Icon as={o.icon} size={22} color={c} />
                </View>
              ),
              badge: o.value === current.value ? <Icon as={Check} size={20} color={c} /> : undefined,
              onSelect: () => onChange(o.value),
            };
          })}
        />
      ) : null}
    </View>
  );
}
