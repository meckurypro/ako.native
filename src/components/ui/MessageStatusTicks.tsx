// src/components/ui/MessageStatusTicks.tsx
// Sent / delivered / read indicator — render only where the CURRENT USER is
// the sender.
//   read_at set      → double check, WhatsApp blue (tick-blue)
//   delivered_at set → double check, "unread" colour for the variant
//   neither          → single check, "unread" colour for the variant
// Bubble variant uses a fixed white tone: canvas flips near-black in dark mode
// and would vanish on the green sent bubble.
import { Check, CheckCheck } from "lucide-react-native";

import { Icon } from "./styled";

interface MessageStatusTicksProps {
  deliveredAt: string | null;
  readAt: string | null;
  /** "bubble" — on the accent sent bubble; "list" — on the plain canvas in the conversation list. */
  variant?: "bubble" | "list";
  size?: number;
}

export function MessageStatusTicks({ deliveredAt, readAt, variant = "bubble", size = 18 }: MessageStatusTicksProps) {
  const unread = variant === "bubble" ? "text-white/80" : "text-ink-muted";

  if (readAt) {
    return <Icon as={CheckCheck} size={size} strokeWidth={1.75} className="text-tick-blue" accessibilityLabel="Read" />;
  }
  if (deliveredAt) {
    return <Icon as={CheckCheck} size={size} strokeWidth={1.75} className={unread} accessibilityLabel="Delivered" />;
  }
  return <Icon as={Check} size={size} strokeWidth={1.75} className={unread} accessibilityLabel="Sent" />;
}
