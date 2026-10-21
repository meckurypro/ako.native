// src/components/messages/DeleteMessageSheet.tsx
import { Trash2 } from "lucide-react-native";

import { OptionsModal, type OptionItem } from "@/components/ui/OptionsModal";
import { Icon } from "@/components/ui/styled";
import type { DeleteScope } from "@/hooks/useMessaging";

interface DeleteMessageSheetProps {
  count: number;
  allowEveryone: boolean;
  onDelete: (scope: DeleteScope) => void;
  onClose: () => void;
}

export function DeleteMessageSheet({ count, allowEveryone, onDelete, onClose }: DeleteMessageSheetProps) {
  const plural = count > 1 ? `${count} messages` : "this message";
  const pronoun = count > 1 ? "them" : "it";
  const items: OptionItem[] = [
    {
      key: "me",
      label: "Delete for me",
      description: `Removes ${pronoun} from your view only. Can't be undone.`,
      icon: <Icon as={Trash2} size={22} className="text-overlay-danger" />,
      onSelect: () => onDelete("me"),
    },
    ...(allowEveryone
      ? [
          {
            key: "everyone",
            label: "Delete for everyone",
            description: `Replaces ${pronoun} with "message deleted" for both of you. Can't be undone.`,
            icon: <Icon as={Trash2} size={22} className="text-overlay-danger" />,
            onSelect: () => onDelete("everyone"),
            variant: "danger" as const,
          },
        ]
      : []),
  ];
  // Raised above the message action overlay (Portal 60) it opens from.
  return <OptionsModal title={`Delete ${plural}?`} items={items} onClose={onClose} zIndex={65} />;
}
