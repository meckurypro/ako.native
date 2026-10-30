// src/components/ui/SendButton.tsx
import { ArrowUp } from "lucide-react-native";
import { Pressable } from "react-native";

import { Icon } from "./styled";

interface SendButtonProps {
  /** Nothing to send yet (empty draft) — the circle goes quiet and can't be tapped. */
  disabled?: boolean;
  onPress: () => void;
  label?: string;
}

/**
 * The send control: a soft grey disc when there is nothing to send, a softened brand-orange disc with a white arrow once there is.
 * Same 44px footprint as the mic button it swaps with, so the composer never
 * shifts when the draft goes from empty to typed.
 */
export function SendButton({ disabled = false, onPress, label = "Send" }: SendButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      className={`h-11 w-11 shrink-0 items-center justify-center rounded-full ${disabled ? "bg-ink-a10" : "bg-brand-orange opacity-70 active:opacity-60"}`}
    >
      <Icon as={ArrowUp} size={22} strokeWidth={2.4} className={disabled ? "text-ink-muted" : "text-white"} />
    </Pressable>
  );
}
