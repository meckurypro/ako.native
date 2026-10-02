// src/components/ui/ConfirmDialog.tsx
// The one place every "are you sure?" prompt goes through — deleting a chat or
// message, unfollowing, removing a follower. Reserve for actions that can't be
// undone or that affect the other participant; reversible ones (archive, mute,
// pin) should never use it.
import { AlertTriangle } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Modal } from "./Modal";
import { Icon } from "./styled";
import { Text } from "./Text";

interface ConfirmDialogProps {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Red confirm button + warning icon. Defaults true. */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal onClose={onCancel} role="alertdialog" ariaLabel={title}>
      <View className="flex-row items-start gap-4">
        {danger && (
          <View className="h-10 w-10 shrink-0 items-center justify-center rounded-full bg-overlay-danger-soft">
            <Icon as={AlertTriangle} size={19} className="text-overlay-danger" />
          </View>
        )}
        <View className="min-w-0 flex-1 pt-0.5">
          <Text className="text-[15px] font-medium leading-snug text-overlay-ink">{title}</Text>
          <Text className="mt-2 text-sm leading-relaxed text-overlay-ink-muted">{description}</Text>
        </View>
      </View>

      <View className="mt-7 flex-row items-center gap-3">
        <Pressable
          onPress={onCancel}
          accessibilityRole="button"
          className="flex-1 items-center rounded-full bg-overlay-surface-raised py-3 active:opacity-80"
        >
          <Text className="text-sm font-medium text-overlay-ink">{cancelLabel}</Text>
        </Pressable>
        <Pressable
          onPress={onConfirm}
          accessibilityRole="button"
          className={`flex-1 items-center rounded-full py-3 active:opacity-80 ${
            danger ? "bg-overlay-danger" : "bg-overlay-accent"
          }`}
        >
          <Text className="text-sm font-medium text-overlay-surface">{confirmLabel}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}
