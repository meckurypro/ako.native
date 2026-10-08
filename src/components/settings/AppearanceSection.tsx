// src/components/settings/AppearanceSection.tsx
// Appearance: light / dark / follow the device.
import { Monitor, Moon, Palette, Sun } from "lucide-react-native";

import { OptionList, type OptionRowData } from "@/components/settings/SettingsParts";
import { SettingsSection } from "@/components/ui/SettingsSection";
import { Icon } from "@/components/ui/styled";
import { haptics } from "@/lib/haptics";
import { useTheme, type ThemeSetting } from "@/theme/ThemeProvider";

const THEME_OPTIONS: OptionRowData<ThemeSetting>[] = [
  { value: "light", label: "Light", description: "Always use the light theme", icon: Sun },
  { value: "dark", label: "Dark", description: "Always use the dark theme", icon: Moon },
  { value: "system", label: "System", description: "Match your device's setting", icon: Monitor },
];

export function AppearanceSection({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { theme, setTheme } = useTheme();
  const themeLabel = THEME_OPTIONS.find((o) => o.value === theme)?.label ?? "System";

  return (
    <SettingsSection icon={<Icon as={Palette} size={18} className="text-ink-muted" />} title="Appearance" summary={themeLabel} open={open} onToggle={onToggle}>
      <OptionList
        options={THEME_OPTIONS}
        value={theme}
        onSelect={(next) => {
          haptics.selection();
          setTheme(next);
        }}
      />
    </SettingsSection>
  );
}
