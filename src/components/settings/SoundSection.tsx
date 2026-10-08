// src/components/settings/SoundSection.tsx
// Sound: on/off and how chatty it is.
import { Volume1, Volume2, VolumeX } from "lucide-react-native";
import { View } from "react-native";

import { OptionList, ToggleRow, type OptionRowData } from "@/components/settings/SettingsParts";
import { SettingsSection } from "@/components/ui/SettingsSection";
import { Icon } from "@/components/ui/styled";
import { useSound, type SoundMode } from "@/hooks/useSound";
import { haptics } from "@/lib/haptics";

const SOUND_MODE_OPTIONS: OptionRowData<SoundMode>[] = [
  { value: "normal", label: "Normal", description: "Sounds for messages, likes, gifts, purchases, and live rooms", icon: Volume2 },
  { value: "minimalist", label: "Minimalist", description: "Only the moments that matter — new messages, gifts, purchases, errors", icon: Volume1 },
];

export function SoundSection({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { enabled, setEnabled, mode, setMode } = useSound();
  const label = enabled ? (SOUND_MODE_OPTIONS.find((o) => o.value === mode)?.label ?? "Normal") : "Off";

  return (
    <SettingsSection icon={<Icon as={Volume2} size={18} className="text-ink-muted" />} title="Sound" summary={label} open={open} onToggle={onToggle}>
      <View className="mt-3">
        <ToggleRow icon={enabled ? Volume2 : VolumeX} title="Sounds" description="Play sounds for messages, likes, gifts, and more" checked={enabled} onToggle={() => setEnabled(!enabled)} />
      </View>
      {enabled && (
        <View className="-mt-2">
          <OptionList
            options={SOUND_MODE_OPTIONS}
            value={mode}
            onSelect={(next) => {
              haptics.selection();
              setMode(next);
            }}
          />
        </View>
      )}
    </SettingsSection>
  );
}
