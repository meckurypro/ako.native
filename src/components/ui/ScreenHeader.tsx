// src/components/ui/ScreenHeader.tsx
// Back arrow + title row used at the top of secondary screens (follow lists,
// requests, settings pages…). `sticky` adds the bordered bar variant that stays
// above a scrolling body.
import { ArrowLeft } from "lucide-react-native";
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
}

export function ScreenHeader({ title, right, bar = false, onBack }: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  const smartBack = useSmartBack();

  return (
    <View
      className={`flex-row items-center gap-3 px-4 pb-3 ${bar ? "border-b border-border bg-canvas" : ""}`}
      style={{ paddingTop: insets.top + (bar ? 16 : 16) }}
    >
      <Pressable onPress={onBack ?? smartBack} accessibilityRole="button" accessibilityLabel="Back" hitSlop={12}>
        <Icon as={ArrowLeft} size={22} className="text-ink-muted" />
      </Pressable>
      <Text numberOfLines={1} className="min-w-0 flex-1 font-display text-xl text-ink">
        {title}
      </Text>
      {right}
    </View>
  );
}
