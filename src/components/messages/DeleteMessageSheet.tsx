// src/components/messages/DeleteMessageSheet.tsx
import { Trash2 } from "lucide-react-native";

import { Sheet } from "@/components/ui/Sheet";
import { SheetCancel, SheetRow, SheetTitle } from "@/components/ui/SheetParts";
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

  return (
    <Sheet onClose={onClose} zIndex={55} accessibilityLabel="Delete message">
      <SheetTitle>Delete {plural}?</SheetTitle>
      <SheetRow
        label="Delete for me"
        description={`Removes ${pronoun} from your view only. Can't be undone.`}
        icon={<Icon as={Trash2} size={18} className="text-danger" />}
        onPress={() => onDelete("me")}
      />
      {allowEveryone ? (
        <SheetRow
          label="Delete for everyone"
          description={`Replaces ${pronoun} with "message deleted" for both of you. Can't be undone.`}
          icon={<Icon as={Trash2} size={18} className="text-danger" />}
          danger
          divider
          onPress={() => onDelete("everyone")}
        />
      ) : null}
      <SheetCancel />
    </Sheet>
  );
}
