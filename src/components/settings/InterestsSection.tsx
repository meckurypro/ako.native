// src/components/settings/InterestsSection.tsx
// Settings → Interests. The same tags chosen at onboarding, editable any time. They drive the Discover chips,
// what's ranked first, and who is suggested, so changes take effect straight away.
import { Check, Tags } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";

import { InterestBrowser } from "@/components/interests/InterestBrowser";
import { Button } from "@/components/ui/Button";
import { SettingsSection } from "@/components/ui/SettingsSection";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useMyInterestIds, useSaveInterests } from "@/hooks/useOnboarding";

const MIN_INTERESTS = 3;

export function InterestsSection({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { data: saved } = useMyInterestIds();
  const save = useSaveInterests();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [savedNote, setSavedNote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current || !saved) return;
    setSelected(new Set(saved));
    seeded.current = true;
  }, [saved]);

  const dirty = !!saved && (saved.length !== selected.size || saved.some((id) => !selected.has(id)));

  function toggle(id: string) {
    setSavedNote(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    setError(null);
    try {
      await save.mutateAsync(Array.from(selected));
      setSavedNote(true);
    } catch {
      setError("Couldn't save your interests. Check your connection and try again.");
    }
  }

  return (
    <SettingsSection
      icon={<Icon as={Tags} size={18} className="text-ink-muted" />}
      title="Interests"
      summary={saved && saved.length > 0 ? `${saved.length} chosen` : undefined}
      open={open}
      onToggle={onToggle}
    >
      <Text className="mb-4 mt-3 text-sm text-ink-muted">
        Pick the topics you reason about. They shape the chips on Discover, what's shown first, and who we suggest.
      </Text>
      <InterestBrowser selected={selected} onToggle={toggle} />

      <View className="mt-5">
        {error ? (
          <Text accessibilityRole="alert" className="mb-2 text-sm text-danger">
            {error}
          </Text>
        ) : null}
        <View className="flex-row items-center justify-between gap-3">
          <Text className="flex-1 text-sm text-ink-muted">
            {selected.size} selected
            {selected.size < MIN_INTERESTS ? ` (${MIN_INTERESTS} minimum)` : ""}
          </Text>
          {savedNote && !dirty ? (
            <View className="flex-row items-center gap-1">
              <Icon as={Check} size={15} className="text-accent" />
              <Text className="text-sm text-accent">Saved</Text>
            </View>
          ) : (
            <View className="w-36">
              <Button onPress={handleSave} disabled={!dirty || selected.size < MIN_INTERESTS} loading={save.isPending}>
                Save
              </Button>
            </View>
          )}
        </View>
      </View>
    </SettingsSection>
  );
}
