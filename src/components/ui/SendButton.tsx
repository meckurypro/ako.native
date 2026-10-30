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
 * The send control: a white up arrow in a brand-orange circle. Dimmed (and untappable) when there is nothing to send.
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
      className={`h-11 w-11 shrink-0 items-center justify-center rounded-full ${disabled ? "bg-brand-orange opacity-50" : "bg-brand-orange active:opacity-80"}`}
    >
      <Icon as={ArrowUp} size={22} strokeWidth={2.4} className="text-white" />
    </Pressable>
  );
}
