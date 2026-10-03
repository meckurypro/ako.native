// src/components/ui/SheetFrame.tsx
// The big picker-style sheet used by Gift, People, Tag, Collaborators…:
// header (title + subtitle + close, or a back arrow), a scrolling body, and an
// optional docked footer. Built on Sheet with the grabber as the drag zone, so
// the body scrolls freely.
import { ArrowLeft, X } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { Sheet, useSheet } from "./Sheet";
import { Icon } from "./styled";
import { Text } from "./Text";

interface SheetFrameProps {
  title?: string;
  /** Muted count/qualifier set right after the title ("Comments  12"). */
  titleSuffix?: string;
  subtitle?: string;
  /** Replaces the title block with a back arrow (multi-step flows). */
  onBack?: () => void;
  /** Right side of the header, before the close button. */
  headerRight?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  zIndex?: number;
  /** Lift above the keyboard (sheets with a search box). */
  avoidKeyboard?: boolean;
  /** Fixed height (fraction of the screen) instead of fitting the content. */
  heightRatio?: number;
  /** Don't wrap the body in a ScrollView — it brings its own list. */
  bodyScroll?: boolean;
  accessibilityLabel?: string;
}

function Header({ title, titleSuffix, subtitle, onBack, headerRight }: Pick<SheetFrameProps, "title" | "titleSuffix" | "subtitle" | "onBack" | "headerRight">) {
  const { close } = useSheet();
  return (
    <View className="shrink-0 flex-row items-center justify-between border-b border-border px-4 pb-3 pt-1">
      {onBack ? (
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} className="-ml-1 p-1">
          <Icon as={ArrowLeft} size={20} className="text-ink-muted" />
        </Pressable>
      ) : (
        <View className="min-w-0 flex-1 pr-3">
          <Text className="font-display text-lg text-ink">
            {title}
            {titleSuffix ? <Text className="font-body text-sm font-normal text-ink-muted">{`  ${titleSuffix}`}</Text> : null}
          </Text>
          {subtitle ? <Text className="text-xs text-ink-muted">{subtitle}</Text> : null}
        </View>
      )}
      <View className="flex-row items-center gap-3">
        {headerRight}
        <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} className="p-1">
          <Icon as={X} size={20} className="text-ink-muted" />
        </Pressable>
      </View>
    </View>
  );
}

export function SheetFrame({
  title,
  titleSuffix,
  subtitle,
  onBack,
  headerRight,
  children,
  footer,
  onClose,
  zIndex = 60,
  avoidKeyboard = false,
  heightRatio,
  bodyScroll = true,
  accessibilityLabel,
}: SheetFrameProps) {
  return (
    <Sheet
      onClose={onClose}
      dragZone="handle"
      radius="3xl"
      zIndex={zIndex}
      avoidKeyboard={avoidKeyboard}
      heightRatio={heightRatio}
      maxHeightRatio={0.85}
      accessibilityLabel={accessibilityLabel ?? title}
    >
      <Header title={title} titleSuffix={titleSuffix} subtitle={subtitle} onBack={onBack} headerRight={headerRight} />
      {bodyScroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={heightRatio ? { flex: 1 } : { flexGrow: 0, flexShrink: 1 }}
          contentContainerClassName="px-4 py-3"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={heightRatio ? { flex: 1 } : { flexShrink: 1 }}>{children}</View>
      )}
      {footer ? <View className="shrink-0 border-t border-border px-4 py-4">{footer}</View> : null}
    </Sheet>
  );
}
