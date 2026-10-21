// src/components/ui/DropdownMenu.tsx
// Kebab / three-dot / dropdown menu. No longer a popover hanging off its trigger: it is a centred options card with a
// title (see OptionsModal), so every list of options in the app looks and behaves the same way.
//
// Render conditionally — `{open && <DropdownMenu … />}` — like every overlay.
import type { ReactNode, RefObject } from "react";
import type { View } from "react-native";

import { OptionsModal } from "./OptionsModal";

export interface DropdownMenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  variant?: "default" | "danger";
  disabled?: boolean;
  /** e.g. an unread-count pill, rendered flush right */
  badge?: ReactNode;
}

interface DropdownMenuProps {
  /** Every options list has a title. */
  title: string;
  items: (DropdownMenuItem | "divider")[];
  onClose: () => void;
  /** Kept so existing call sites compile; menus are no longer anchored to their trigger — they're centred. */
  anchorRef?: RefObject<View | null>;
  /** Kept so existing call sites compile; every options list uses the same card width. */
  width?: number;
  /** Kept so existing call sites compile; the card sizes itself against the bottom nav. */
  bottomInset?: number;
  /** Overlay layer (Modal default 60). Raise it when opening from inside another overlay. */
  zIndex?: number;
}

export function DropdownMenu({ title, items, onClose, zIndex }: DropdownMenuProps) {
  return <OptionsModal title={title} items={items} onClose={onClose} zIndex={zIndex} />;
}
