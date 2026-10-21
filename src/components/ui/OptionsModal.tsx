// src/components/ui/OptionsModal.tsx
// The one options list in the app: every dropdown, kebab menu, action sheet and chooser renders through this.
// A centred card (see Modal / useAnchoredPanel for placement) with a bold title, then rows with the icon on the left
// and the title on the right — the same layout as the Pages list on a profile. The list scrolls inside the card when it
// is longer than the room above the bottom nav.
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { runAfterDismiss } from "@/hooks/useBackDismiss";
import { Modal } from "./Modal";
import { Text } from "./Text";

export interface OptionItem {
  key: string;
  label: string;
  /** Rendered on the left in a fixed-size slot so labels line up whether or not a row has an icon. */
  icon?: ReactNode;
  /** Optional muted second line under the label. */
  description?: string;
  onSelect: () => void;
  variant?: "default" | "danger";
  disabled?: boolean;
  /** e.g. an unread-count pill or a check mark, rendered flush right */
  badge?: ReactNode;
}

interface OptionsModalProps {
  /** Every options list has a title. */
  title: string;
  items: (OptionItem | "divider")[];
  onClose: () => void;
  /** Max card width in px. */
  maxWidth?: number;
  /** Overlay layer (Modal default 60). Raise it when opening from inside another overlay. */
  zIndex?: number;
  /** Extra content under the list (a note, a footer button). */
  footer?: ReactNode;
  /**
   * Run the chosen action synchronously, then close — instead of waiting for the dismiss to settle. Needed when the
   * action must happen inside the tap's own user gesture. Leave off for anything that navigates or opens another overlay.
   */
  immediate?: boolean;
}

export function OptionsModal({ title, items, onClose, maxWidth, zIndex, footer, immediate = false }: OptionsModalProps) {
  return (
    <Modal onClose={onClose} title={title} maxWidth={maxWidth} zIndex={zIndex}>
      <View className="-mx-2" accessibilityRole="menu">
        {items.map((item, i) =>
          item === "divider" ? (
            <View key={`divider-${i}`} className="my-2 h-px bg-overlay-border" />
          ) : (
            <Pressable
              key={item.key}
              accessibilityRole="menuitem"
              accessibilityState={{ disabled: !!item.disabled }}
              accessibilityLabel={item.label}
              disabled={item.disabled}
              onPress={() => {
                if (immediate) {
                  item.onSelect();
                  onClose();
                  return;
                }
                // Waits for the dismiss to settle instead of racing it — see runAfterDismiss.
                runAfterDismiss(onClose, item.onSelect);
              }}
              className={`flex-row items-center gap-3 rounded-2xl px-2 py-3 active:bg-overlay-surface-raised ${item.disabled ? "opacity-40" : ""}`}
            >
              <View className="h-10 w-10 shrink-0 items-center justify-center">{item.icon}</View>
              <View className="min-w-0 flex-1">
                <Text
                  numberOfLines={1}
                  className={`font-semibold ${item.variant === "danger" ? "text-overlay-danger" : "text-overlay-ink"}`}
                >
                  {item.label}
                </Text>
                {item.description ? (
                  <Text numberOfLines={3} className="text-sm text-overlay-ink-muted">
                    {item.description}
                  </Text>
                ) : null}
              </View>
              {item.badge}
            </Pressable>
          )
        )}
      </View>
      {footer}
    </Modal>
  );
}
