// src/components/ui/SaveProgressDialog.tsx
// Shown when someone tries to leave Compose / New project with progress that isn't saved anywhere yet (see
// useLeaveGuard). Two real choices — keep what they have as a draft, or throw it away — plus a quiet way back to the
// form. (Not to be confused with UnsavedChangesDialog, which is the Book builder's "staged edits" prompt.)
import { Save } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Modal } from "./Modal";
import { Icon } from "./styled";
import { Text } from "./Text";

interface SaveProgressDialogProps {
  title?: string;
  description: string;
  saveLabel?: string;
  discardLabel?: string;
  /** Save can't run yet (e.g. a post draft needs a heading or some details). `saveHint` says why. */
  saveDisabled?: boolean;
  saveHint?: string;
  /** A save is in flight — buttons lock so it can't be fired twice or dismissed mid-write. */
  saving?: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onKeepEditing: () => void;
}

export function SaveProgressDialog({
  title = "Save your progress?",
  description,
  saveLabel = "Save draft",
  discardLabel = "Discard",
  saveDisabled = false,
  saveHint,
  saving = false,
  onSave,
  onDiscard,
  onKeepEditing,
}: SaveProgressDialogProps) {
  const saveOff = saving || saveDisabled;
  return (
    <Modal onClose={saving ? () => {} : onKeepEditing} role="alertdialog" title={title}>
      <View className="flex-row items-start gap-4">
        <View className="h-10 w-10 shrink-0 items-center justify-center rounded-full bg-overlay-surface-raised">
          <Icon as={Save} size={19} className="text-overlay-ink" />
        </View>
        <View className="min-w-0 flex-1 pt-0.5">
          <Text className="text-sm leading-relaxed text-overlay-ink-muted">{description}</Text>
          {saveDisabled && saveHint ? <Text className="mt-2 text-xs leading-relaxed text-overlay-ink-muted">{saveHint}</Text> : null}
        </View>
      </View>

      <View className="mt-7 gap-2.5">
        <Pressable
          onPress={onSave}
          disabled={saveOff}
          accessibilityRole="button"
          accessibilityState={{ disabled: saveOff }}
          className={`items-center rounded-full bg-overlay-accent py-3 active:opacity-80 ${saveOff ? "opacity-50" : ""}`}
        >
          <Text className="text-sm font-medium text-overlay-surface">{saving ? "Saving…" : saveLabel}</Text>
        </Pressable>
        <Pressable
          onPress={onDiscard}
          disabled={saving}
          accessibilityRole="button"
          className={`items-center rounded-full bg-overlay-surface-raised py-3 active:opacity-80 ${saving ? "opacity-50" : ""}`}
        >
          <Text className="text-sm font-medium text-overlay-danger">{discardLabel}</Text>
        </Pressable>
        <Pressable onPress={onKeepEditing} disabled={saving} accessibilityRole="button" className={`items-center py-2.5 ${saving ? "opacity-50" : ""}`}>
          <Text className="text-sm text-overlay-ink-muted">Keep editing</Text>
        </Pressable>
      </View>
    </Modal>
  );
}
