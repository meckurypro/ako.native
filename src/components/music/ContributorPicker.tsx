// src/components/music/ContributorPicker.tsx
//
// "Tag contributors" step of Publish Music to Akọ. Port of the web ContributorPicker: contributors
// must be real Akọ accounts (reuses PeoplePicker), then role + split are layered on top. Splits are
// only meaningful for paid usage, so the split inputs are hidden for free usage (the server
// validates the 100% total itself for paid usage regardless of what's shown here).
import { Check, ChevronDown, Plus, X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";

import { PeoplePicker } from "@/components/post/PeoplePicker";
import { Avatar } from "@/components/ui/Avatar";
import { Sheet } from "@/components/ui/Sheet";
import { SheetCancel, SheetRow } from "@/components/ui/SheetParts";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import type { MentionCandidate } from "@/hooks/useMentions";
import { useTheme } from "@/theme/ThemeProvider";
import { CONTRIBUTOR_ROLE_LABELS, CONTRIBUTOR_ROLE_OPTIONS, type ContributorDraft } from "@/types/music";

interface ContributorPickerProps {
  contributors: ContributorDraft[];
  onChange: (contributors: ContributorDraft[]) => void;
  usageMode: "free" | "paid";
}

/** Web's inline <select>: a small muted label that opens the role list. */
function RoleSelect({ value, onChange }: { value: ContributorDraft["role"]; onChange: (role: ContributorDraft["role"]) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Role: ${CONTRIBUTOR_ROLE_LABELS[value]}`}
        className="flex-row items-center gap-1 self-start"
      >
        <Text className="text-xs text-ink-muted">{CONTRIBUTOR_ROLE_LABELS[value]}</Text>
        <Icon as={ChevronDown} size={12} className="text-ink-muted" />
      </Pressable>

      {open ? (
        <Sheet onClose={() => setOpen(false)} dragZone="handle" maxHeightRatio={0.7} zIndex={65} accessibilityLabel="Contributor role">
          <ScrollView showsHorizontalScrollIndicator={false} style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false}>
            {CONTRIBUTOR_ROLE_OPTIONS.map((role) => (
              <SheetRow
                key={role}
                label={CONTRIBUTOR_ROLE_LABELS[role]}
                onPress={() => onChange(role)}
                icon={role === value ? <Icon as={Check} size={16} className="text-accent" /> : undefined}
              />
            ))}
          </ScrollView>
          <SheetCancel />
        </Sheet>
      ) : null}
    </>
  );
}

export function ContributorPicker({ contributors, onChange, usageMode }: ContributorPickerProps) {
  const { colors } = useTheme();
  const [pickerOpen, setPickerOpen] = useState(false);

  const splitTotal = contributors.reduce((sum, c) => sum + (c.split_percent || 0), 0);

  function handlePickerConfirm(selected: MentionCandidate[]) {
    // Contributors must be real accounts, not Pages — PeoplePicker can surface both.
    const people = selected.filter((s) => s.kind === "profile");
    const existingIds = new Set(contributors.map((c) => c.contributor_id));

    const added: ContributorDraft[] = people
      .filter((p) => !existingIds.has(p.id))
      .map((p) => ({
        contributor_id: p.id,
        username: p.username,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
        role: "other_contributor",
        split_percent: 0,
      }));

    const stillSelectedIds = new Set(people.map((p) => p.id));
    const kept = contributors.filter((c) => stillSelectedIds.has(c.contributor_id));

    onChange([...kept, ...added]);
    setPickerOpen(false);
  }

  function updateContributor(id: string, patch: Partial<ContributorDraft>) {
    onChange(contributors.map((c) => (c.contributor_id === id ? { ...c, ...patch } : c)));
  }

  function removeContributor(id: string) {
    onChange(contributors.filter((c) => c.contributor_id !== id));
  }

  return (
    <View className="mb-4">
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="text-sm font-medium text-ink-muted">Contributors</Text>
        <Pressable onPress={() => setPickerOpen(true)} accessibilityRole="button" className="flex-row items-center gap-1">
          <Icon as={Plus} size={14} className="text-accent" />
          <Text className="text-xs font-medium text-accent">Add</Text>
        </Pressable>
      </View>

      {contributors.length === 0 ? (
        <Text className="mb-2 text-xs text-ink-muted">Tag at least one contributor — usually yourself as Artist.</Text>
      ) : null}

      <View className="gap-2">
        {contributors.map((c) => (
          <View key={c.contributor_id} className="flex-row items-center gap-2 rounded-xl border border-border bg-surface p-2">
            <Avatar src={c.avatar_url} name={c.display_name} size="sm" />
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="text-sm font-medium text-ink">
                {c.display_name}
              </Text>
              <RoleSelect value={c.role} onChange={(role) => updateContributor(c.contributor_id, { role })} />
            </View>

            {usageMode === "paid" ? (
              <View className="shrink-0 flex-row items-center gap-1">
                <TextInput
                  value={String(c.split_percent)}
                  onChangeText={(text) =>
                    updateContributor(c.contributor_id, { split_percent: Math.max(0, Math.min(100, Number(text.replace(/[^0-9.]/g, "")) || 0)) })
                  }
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  accessibilityLabel={`${c.display_name} split percent`}
                  selectionColor={colors.accent}
                  className="w-14 rounded-lg border border-border bg-canvas px-1.5 py-1 text-right text-sm text-ink"
                />
                <Text className="text-xs text-ink-muted">%</Text>
              </View>
            ) : null}

            <Pressable onPress={() => removeContributor(c.contributor_id)} accessibilityRole="button" accessibilityLabel="Remove" hitSlop={8} className="p-1">
              <Icon as={X} size={14} className="text-ink-muted" />
            </Pressable>
          </View>
        ))}
      </View>

      {usageMode === "paid" && contributors.length > 0 ? (
        <Text className={`mt-2 text-xs ${splitTotal === 100 ? "text-ink-muted" : "text-danger"}`}>
          Splits total {splitTotal}% — must equal exactly 100% to publish paid usage.
        </Text>
      ) : null}

      {pickerOpen ? (
        <PeoplePicker
          title="Tag contributors"
          subtitle="Contributors must be real Akọ accounts."
          confirmLabel="Add"
          initialSelected={contributors.map((c) => ({
            kind: "profile" as const,
            id: c.contributor_id,
            username: c.username,
            display_name: c.display_name,
            avatar_url: c.avatar_url,
          }))}
          onConfirm={handlePickerConfirm}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </View>
  );
}
