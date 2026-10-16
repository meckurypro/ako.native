// src/components/ui/EditorToolbar.tsx
// Save / Undo / Redo bar for creator editors (book chapters, course lessons).
import { Check, Redo2, Undo2 } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { haptics } from "@/lib/haptics";

interface EditorToolbarProps {
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onSave: () => void;
  saving: boolean;
  dirty: boolean;
  canSave?: boolean;
  saveLabel?: string;
  onCancel?: () => void;
}

export function EditorToolbar({ onUndo, onRedo, canUndo, canRedo, onSave, saving, dirty, canSave = true, saveLabel = "Save", onCancel }: EditorToolbarProps) {
  const saveDisabled = saving || !canSave || !dirty;
  return (
    <View className="flex-row items-center gap-1.5">
      <Pressable
        onPress={() => { haptics.light(); onUndo(); }}
        disabled={!canUndo}
        accessibilityRole="button"
        accessibilityLabel="Undo"
        hitSlop={6}
        className={`rounded-lg border border-border p-1.5 ${canUndo ? "" : "opacity-30"}`}
      >
        <Icon as={Undo2} size={16} className="text-ink" />
      </Pressable>
      <Pressable
        onPress={() => { haptics.light(); onRedo(); }}
        disabled={!canRedo}
        accessibilityRole="button"
        accessibilityLabel="Redo"
        hitSlop={6}
        className={`rounded-lg border border-border p-1.5 ${canRedo ? "" : "opacity-30"}`}
      >
        <Icon as={Redo2} size={16} className="text-ink" />
      </Pressable>
      <Pressable
        onPress={onSave}
        disabled={saveDisabled}
        accessibilityRole="button"
        accessibilityLabel={saveLabel}
        accessibilityState={{ disabled: saveDisabled, busy: saving }}
        className={`ml-1 flex-row items-center gap-1 rounded-lg bg-accent px-3 py-1.5 ${saveDisabled ? "opacity-40" : ""}`}
      >
        {!dirty && !saving && <Icon as={Check} size={14} className="text-canvas" />}
        <Text className="text-sm font-medium text-canvas">{saving ? "Saving…" : dirty ? saveLabel : "Saved"}</Text>
      </Pressable>
      {onCancel && (
        <Pressable onPress={onCancel} accessibilityRole="button" hitSlop={8} className="px-2 py-1.5">
          <Text className="text-sm text-ink-muted">{dirty ? "Discard" : "Close"}</Text>
        </Pressable>
      )}
    </View>
  );
}
