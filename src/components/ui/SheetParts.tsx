// src/components/ui/SheetParts.tsx
// The pieces every action sheet is built from, matching the web markup:
// a muted/regular title line, full-width rows (icon + label, optional
// description), and a bordered Cancel row.
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { runAfterDismiss } from "@/hooks/useBackDismiss";
import { useSheet } from "./Sheet";
import { Text } from "./Text";

/** Small muted caption (web: px-4 pt-4 pb-2 text-xs text-ink-muted). */
export function SheetCaption({ children }: { children: ReactNode }) {
  return (
    <Text numberOfLines={1} className="px-4 pb-2 pt-4 text-xs text-ink-muted">
      {children}
    </Text>
  );
}

/** Question-style title (web: px-4 pt-4 pb-1 text-sm font-medium text-ink). */
export function SheetTitle({ children }: { children: ReactNode }) {
  return <Text className="px-4 pb-1 pt-4 text-sm font-medium text-ink">{children}</Text>;
}

interface SheetRowProps {
  label: string;
  /** Muted second line under the label (DeleteMessageSheet's explanations). */
  description?: string;
  icon?: ReactNode;
  danger?: boolean;
  /** Draw a top divider (rows after the first in a group that needs one). */
  divider?: boolean;
  /**
   * Fires once the sheet has slid away (default). Pass `closeFirst={false}` to
   * run it immediately and leave the sheet open (e.g. a toggle row).
   */
  onPress: () => void;
  closeFirst?: boolean;
  disabled?: boolean;
}

export function SheetRow({
  label,
  description,
  icon,
  danger = false,
  divider = false,
  onPress,
  closeFirst = true,
  disabled,
}: SheetRowProps) {
  const { close } = useSheet();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={() => (closeFirst ? runAfterDismiss(close, onPress) : onPress())}
      className={`flex-row gap-3 px-4 py-3.5 active:bg-border/40 ${description ? "items-start" : "items-center"} ${
        divider ? "border-t border-border" : ""
      } ${disabled ? "opacity-40" : ""}`}
    >
      {icon ? <View className={description ? "mt-0.5 shrink-0" : "shrink-0"}>{icon}</View> : null}
      <View className="flex-1">
        <Text className={`text-sm ${danger ? "text-danger" : "text-ink"}`}>{label}</Text>
        {description ? <Text className="mt-0.5 text-xs text-ink-muted">{description}</Text> : null}
      </View>
    </Pressable>
  );
}

export function SheetCancel({ label = "Cancel" }: { label?: string }) {
  const { close } = useSheet();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={close}
      className="mt-1 w-full items-center border-t border-border py-3.5 active:bg-border/40"
    >
      <Text className="text-sm text-ink-muted">{label}</Text>
    </Pressable>
  );
}
