// src/components/messages/ConversationActionSheet.tsx
// Long-press actions on a chat row: pin, archive, select, delete.
import { Archive, CheckSquare, Pin, PinOff, Trash2 } from "lucide-react-native";

import { Sheet } from "@/components/ui/Sheet";
import { SheetCancel, SheetCaption, SheetRow } from "@/components/ui/SheetParts";
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
  return (
    <Sheet onClose={onClose} accessibilityLabel="Chat actions">
      <SheetCaption>{displayName}</SheetCaption>
      <SheetRow
        label={isPinned ? "Unpin from top" : "Pin to top"}
        icon={<Icon as={isPinned ? PinOff : Pin} size={18} className="text-ink" />}
        onPress={onTogglePin}
      />
      <SheetRow label="Archive" icon={<Icon as={Archive} size={18} className="text-ink" />} onPress={onArchive} />
      <SheetRow label="Select chats" icon={<Icon as={CheckSquare} size={18} className="text-ink" />} onPress={onSelect} />
      <SheetRow label="Delete chat" danger icon={<Icon as={Trash2} size={18} className="text-danger" />} onPress={onDelete} />
      <SheetCancel />
    </Sheet>
  );
}
