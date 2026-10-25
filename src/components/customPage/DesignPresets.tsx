// src/components/customPage/DesignPresets.tsx
// The Design stage's presets dropdown. A preset remembers the stage's choices (style, template, animation, share button) so
// a creator who experiments and loses track of what they had can get it back in one tap. Presets belong to the person, so
// they are available on all their pages. Mirrors the web DesignPresets.
import { Check, ChevronDown, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useDeleteDesignPreset, useMyDesignPresets, useSaveDesignPreset } from "@/hooks/useCustomPages";
import {
  PRESET_LIMIT,
  PRESET_NAME_MAX,
  applyPresetToConfig,
  describePreset,
  designOfConfig,
  presetMatchesConfig,
  type CustomPageConfig,
  type DesignPreset,
} from "@/lib/customPage";
import { friendlyError } from "@/lib/friendlyError";
import { Input } from "./EditorParts";

export function DesignPresets({ config, onChange }: { config: CustomPageConfig; onChange: (fn: (c: CustomPageConfig) => CustomPageConfig) => void }) {
  const toast = useToast();
  const presets = useMyDesignPresets();
  const save = useSaveDesignPreset();
  const remove = useDeleteDesignPreset();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [toDelete, setToDelete] = useState<DesignPreset | null>(null);

  const list = presets.data ?? [];
  const current = list.find((p) => presetMatchesConfig(config, p.design)) ?? null;
  const trimmed = name.trim();
  const sameName = list.find((p) => p.name.trim().toLowerCase() === trimmed.toLowerCase()) ?? null;
  const full = list.length >= PRESET_LIMIT && !sameName;

  function apply(p: DesignPreset) {
    onChange((c) => applyPresetToConfig(c, p.design));
    setOpen(false);
    toast(`Applied “${p.name}”`);
  }

  async function saveCurrent() {
    if (!trimmed || full || save.isPending) return;
    try {
      // The same name replaces that preset — the way to update one after tweaking it.
      await save.mutateAsync({ name: trimmed, design: designOfConfig(config), id: sameName?.id });
      toast(sameName ? `Updated “${trimmed}”` : `Saved “${trimmed}”`, { variant: "success" });
      setName("");
    } catch (err) {
      toast(friendlyError(err, "Couldn't save that preset. Please try again."), { variant: "error" });
    }
  }

  async function confirmDelete() {
    const p = toDelete;
    setToDelete(null);
    if (!p) return;
    try {
      await remove.mutateAsync(p.id);
      toast(`Deleted “${p.name}”`);
    } catch (err) {
      toast(friendlyError(err, "Couldn't delete that preset. Please try again."), { variant: "error" });
    }
  }

  return (
    <View className="mb-6">
      <Text className="mb-1.5 text-[13px] font-medium text-ink">Presets</Text>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityLabel="Presets"
        accessibilityState={{ expanded: open }}
        className="flex-row items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3"
      >
        <View className="min-w-0 flex-1">
          <Text className="text-[15px] text-ink" numberOfLines={1}>
            {current ? current.name : "Choose a preset"}
          </Text>
          <Text className="text-xs text-ink-muted" numberOfLines={1}>
            {current ? describePreset(current.design) : list.length ? "This design isn't saved as a preset" : "Save the look you like and bring it back any time"}
          </Text>
        </View>
        <View style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}>
          <Icon as={ChevronDown} size={18} className="text-ink-muted" />
        </View>
      </Pressable>

      {open ? (
        <View className="mt-2 overflow-hidden rounded-2xl border border-border bg-surface">
          {presets.isLoading ? (
            <View className="flex-row items-center gap-2 px-4 py-4">
              <ActivityIndicator size="small" />
              <Text className="text-sm text-ink-muted">Loading your presets…</Text>
            </View>
          ) : presets.isError ? (
            <View className="px-4 py-4">
              <Text className="text-sm text-ink-muted">Couldn't load your presets.</Text>
              <Pressable onPress={() => void presets.refetch()} accessibilityRole="button" hitSlop={8} className="mt-1 self-start">
                <Text className="text-sm text-ink" style={{ textDecorationLine: "underline" }}>
                  Try again
                </Text>
              </Pressable>
            </View>
          ) : list.length === 0 ? (
            <Text className="px-4 py-4 text-sm leading-5 text-ink-muted">No presets yet. Set up your style, template and animation below, then save it here.</Text>
          ) : (
            list.map((p, i) => {
              const active = current?.id === p.id;
              return (
                <View key={p.id} className={`flex-row items-stretch ${i > 0 ? "border-t border-border" : ""}`}>
                  <Pressable
                    onPress={() => apply(p)}
                    accessibilityRole="button"
                    accessibilityLabel={`Apply preset ${p.name}`}
                    accessibilityState={{ selected: active }}
                    className="min-w-0 flex-1 flex-row items-center gap-3 px-4 py-3"
                  >
                    <View className="w-5">{active ? <Icon as={Check} size={18} className="text-accent" /> : null}</View>
                    <View className="min-w-0 flex-1">
                      <Text className="text-[15px] font-medium text-ink" numberOfLines={1}>
                        {p.name}
                      </Text>
                      <Text className="text-xs text-ink-muted" numberOfLines={1}>
                        {describePreset(p.design)}
                      </Text>
                    </View>
                  </Pressable>
                  <Pressable onPress={() => setToDelete(p)} accessibilityRole="button" accessibilityLabel={`Delete preset ${p.name}`} className="justify-center px-4">
                    <Icon as={Trash2} size={17} className="text-ink-muted" />
                  </Pressable>
                </View>
              );
            })
          )}

          <View className="border-t border-border p-3">
            <Text className="mb-1.5 text-xs text-ink-muted">Save this design as a preset</Text>
            <View className="flex-row items-center gap-2">
              <View className="min-w-0 flex-1">
                <Input
                  value={name}
                  onChangeText={(t) => setName(t.slice(0, PRESET_NAME_MAX))}
                  onSubmitEditing={() => void saveCurrent()}
                  placeholder="e.g. Night poster"
                  maxLength={PRESET_NAME_MAX}
                  returnKeyType="done"
                  accessibilityLabel="Preset name"
                />
              </View>
              <Pressable
                onPress={() => void saveCurrent()}
                disabled={!trimmed || full || save.isPending}
                accessibilityRole="button"
                accessibilityLabel={sameName ? "Replace preset" : "Save preset"}
                className="h-12 min-w-[72px] items-center justify-center rounded-xl bg-ink px-4"
                style={{ opacity: !trimmed || full || save.isPending ? 0.4 : 1 }}
              >
                {save.isPending ? <ActivityIndicator size="small" color="#fff" /> : <Text className="text-sm font-medium text-canvas">{sameName ? "Replace" : "Save"}</Text>}
              </Pressable>
            </View>
            <Text className="mt-1.5 text-xs leading-4 text-ink-muted">
              {full
                ? `You can keep up to ${PRESET_LIMIT} presets. Delete one to save another.`
                : sameName
                  ? `This will replace “${sameName.name}” with your current design.`
                  : "Saves your style, template, animation and share button. Colours and content aren't included."}
            </Text>
          </View>
        </View>
      ) : null}

      {toDelete ? (
        <ConfirmDialog
          title="Delete this preset?"
          description={`“${toDelete.name}” will be removed from your presets. Pages already using this design aren't changed.`}
          confirmLabel="Delete"
          themed
          onConfirm={() => void confirmDelete()}
          onCancel={() => setToDelete(null)}
        />
      ) : null}
    </View>
  );
}
