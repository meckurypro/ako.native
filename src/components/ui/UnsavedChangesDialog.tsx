// src/components/ui/UnsavedChangesDialog.tsx
// Shown when a creator tries to leave an editor with staged, unsaved changes.
import { Pressable, View } from "react-native";

import { Modal } from "./Modal";
import { Text } from "./Text";

interface UnsavedChangesDialogProps {
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onStay: () => void;
}

export function UnsavedChangesDialog({ saving, onSave, onDiscard, onStay }: UnsavedChangesDialogProps) {
  return (
    <Modal onClose={onStay} role="alertdialog" title="You have unsaved changes">
      <Text className="text-sm leading-relaxed text-overlay-ink-muted">
        Moves, deletions and edits only take effect once you save. Leave now and they're lost.
      </Text>
      <View className="mt-6 gap-2">
        <Pressable onPress={onSave} disabled={saving} accessibilityRole="button" className={`items-center rounded-full bg-overlay-accent py-3 active:opacity-80 ${saving ? "opacity-50" : ""}`}>
          <Text className="text-sm font-medium text-overlay-surface">{saving ? "Saving…" : "Save and leave"}</Text>
        </Pressable>
        <Pressable onPress={onDiscard} disabled={saving} accessibilityRole="button" className={`items-center rounded-full bg-overlay-danger py-3 active:opacity-80 ${saving ? "opacity-50" : ""}`}>
          <Text className="text-sm font-medium text-overlay-surface">Discard changes</Text>
        </Pressable>
        <Pressable onPress={onStay} accessibilityRole="button" className="items-center rounded-full bg-overlay-surface-raised py-3 active:opacity-80">
          <Text className="text-sm font-medium text-overlay-ink">Keep editing</Text>
        </Pressable>
      </View>
    </Modal>
  );
}
