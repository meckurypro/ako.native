// src/components/messages/AttachMenu.tsx
// Port of the web AttachMenu: a small themed card that pops up just above the composer's top-left
// corner (web: absolute bottom-full left-3 mb-2, z-50) with a transparent click-catcher behind it
// (z-40). Replaces the bottom sheet native used before.
import { Camera, FileText, Image as ImageIcon, type LucideIcon } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { PopoverPanel } from "@/components/ui/OverlayPanel";
import { Portal } from "@/components/ui/Portal";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";

/** Top-left of the composer in window coordinates (from measureInWindow). */
export interface AttachAnchor {
  x: number;
  y: number;
}

interface AttachMenuProps {
  anchor: AttachAnchor;
  onGallery: () => void;
  onCamera: () => void;
  onDocument: () => void;
  onClose: () => void;
}

// Web: w-20 py-2, 56px round icon with shadow-sm, 13px muted label.
function Item({ icon, label, color, onPress }: { icon: LucideIcon; label: string; color: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="menuitem"
      accessibilityLabel={label}
      className="w-20 items-center gap-1.5 py-2 active:opacity-70"
    >
      <View
        className="h-14 w-14 items-center justify-center rounded-full"
        style={{
          backgroundColor: color,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.08,
          shadowRadius: 2,
          elevation: 2,
        }}
      >
        <Icon as={icon} size={24} color="#FFFFFF" />
      </View>
      <Text className="text-[13px] text-ink-muted">{label}</Text>
    </Pressable>
  );
}

export function AttachMenu({ anchor, onGallery, onCamera, onDocument, onClose }: AttachMenuProps) {
  // The card sits ABOVE the anchor, so its height is needed to place it; hidden until measured.
  const [height, setHeight] = useState<number | null>(null);

  // Web: close first, then run the action.
  const pick = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return (
    <Portal zIndex={55}>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
        style={StyleSheet.absoluteFill}
      />
      <PopoverPanel
        accessibilityRole="menu"
        accessibilityLabel="Attach"
        onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
        className="absolute flex-row rounded-3xl px-3 py-2"
        style={{ left: anchor.x + 12, top: anchor.y - 8 - (height ?? 0), opacity: height === null ? 0 : 1 }}
      >
        <Item icon={FileText} label="Document" color="#5B6BD6" onPress={pick(onDocument)} />
        <Item icon={Camera} label="Camera" color="#D6536F" onPress={pick(onCamera)} />
        <Item icon={ImageIcon} label="Gallery" color="#8E5BD6" onPress={pick(onGallery)} />
      </PopoverPanel>
    </Portal>
  );
}
