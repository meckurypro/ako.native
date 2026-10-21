// src/components/messages/ConversationActionSheet.tsx
// Long-press options on a chat row: pin, archive, select, delete — as the shared centred options list.
import { Archive, CheckSquare, Pin, PinOff, Trash2 } from "lucide-react-native";

import { OptionsModal, type OptionItem } from "@/components/ui/OptionsModal";
import { Icon } from "@/components/ui/styled";

interface ConversationActionSheetProps {
  displayName: string;
  isPinned: boolean;
  onTogglePin: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onSelect: () => void;
  onClose: () => void;
}

export function ConversationActionSheet({ displayName, isPinned, onTogglePin, onArchive, onDelete, onSelect, onClose }: ConversationActionSheetProps) {
  const items: OptionItem[] = [
    {
      key: "pin",
      label: isPinned ? "Unpin from top" : "Pin to top",
      icon: <Icon as={isPinned ? PinOff : Pin} size={22} className="text-overlay-ink" />,
      onSelect: onTogglePin,
    },
    { key: "archive", label: "Archive", icon: <Icon as={Archive} size={22} className="text-overlay-ink" />, onSelect: onArchive },
    { key: "select", label: "Select chats", icon: <Icon as={CheckSquare} size={22} className="text-overlay-ink" />, onSelect },
    { key: "delete", label: "Delete chat", icon: <Icon as={Trash2} size={22} className="text-overlay-danger" />, onSelect: onDelete, variant: "danger" },
  ];
  return <OptionsModal title={displayName || "Chat options"} items={items} onClose={onClose} />;
}
