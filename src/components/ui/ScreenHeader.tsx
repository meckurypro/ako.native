// src/components/ui/ScreenHeader.tsx
// Back arrow + title row used at the top of secondary screens (follow lists,
// requests, settings pages…). `sticky` adds the bordered bar variant that stays
// above a scrolling body.
import { ArrowLeft, type LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSmartBack } from "@/hooks/useSmartBack";
import { Icon } from "./styled";
import { Text } from "./Text";

interface ScreenHeaderProps {
  title: string;
  right?: ReactNode;
  /** Bordered, canvas-backed bar (for use above a ScrollView). Default: plain row. */
  bar?: boolean;
  onBack?: () => void;
  /** Tab-root screens (Library, Connect, Chats) hide the back arrow… */
  back?: boolean;
  /** …and show their section icon in its place. */
  icon?: LucideIcon;
}

export function ScreenHeader({ title, right, bar = false, onBack, back = true, icon }: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  const smartBack = useSmartBack();

  return (
    <View
      className={`flex-row items-center gap-3 px-4 pb-3 ${bar ? "border-b border-border bg-canvas" : ""}`}
      style={{ paddingTop: insets.top + (bar ? 16 : 16) }}
    >
      {back ? (
        <Pressable onPress={onBack ?? smartBack} accessibilityRole="button" accessibilityLabel="Back" hitSlop={12}>
          <Icon as={ArrowLeft} size={22} className="text-ink-muted" />
        </Pressable>
      ) : null}
      {icon ? <Icon as={icon} size={22} className="text-ink-muted" /> : null}
      <Text numberOfLines={1} className="min-w-0 flex-1 font-display text-xl text-ink">
        {title}
      </Text>
      {right}
    </View>
  );
}
