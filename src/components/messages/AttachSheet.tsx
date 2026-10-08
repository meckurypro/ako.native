// src/components/messages/AttachSheet.tsx
// WhatsApp's attach sheet: a grid of round, colour-coded icons with a label under each.
// Document · Camera · Gallery. Tapping one closes the sheet, then runs its action.
import { Camera, FileText, Image as ImageIcon } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Sheet } from "@/components/ui/Sheet";
import { useSheet } from "@/components/ui/Sheet";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { runAfterDismiss } from "@/hooks/useBackDismiss";

interface AttachSheetProps {
  onGallery: () => void;
  onCamera: () => void;
  onDocument: () => void;
  onClose: () => void;
}

function Tile({ icon, label, color, onPress }: { icon: LucideIcon; label: string; color: string; onPress: () => void }) {
  const { close } = useSheet();
  return (
    <Pressable
      onPress={() => runAfterDismiss(close, onPress)}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="w-1/3 items-center gap-2 py-3 active:opacity-70"
    >
      <View className="h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: color }}>
        <Icon as={icon} size={24} color="#FFFFFF" />
      </View>
      <Text className="text-[13px] text-ink-muted">{label}</Text>
    </Pressable>
  );
}

export function AttachSheet({ onGallery, onCamera, onDocument, onClose }: AttachSheetProps) {
  return (
    <Sheet onClose={onClose} zIndex={55} accessibilityLabel="Attach">
      <View className="flex-row flex-wrap px-4 pb-4 pt-5">
        <Tile icon={FileText} label="Document" color="#5B6BD6" onPress={onDocument} />
        <Tile icon={Camera} label="Camera" color="#D6536F" onPress={onCamera} />
        <Tile icon={ImageIcon} label="Gallery" color="#8E5BD6" onPress={onGallery} />
      </View>
    </Sheet>
  );
}
