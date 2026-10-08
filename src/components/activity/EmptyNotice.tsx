// src/components/activity/EmptyNotice.tsx
// Centered icon + message used by the Activity / Library / Gigs empty states.
import type { LucideIcon } from "lucide-react-native";
import { View } from "react-native";

import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";

interface EmptyNoticeProps {
  icon: LucideIcon;
  message: string;
  title?: string;
  /** Larger, roomier variant used by Drafts / Scheduled / Gigs. */
  large?: boolean;
}

export function EmptyNotice({ icon, message, title, large = false }: EmptyNoticeProps) {
  return (
    <View className={`items-center px-6 ${large ? "py-16" : "mt-16 gap-2"}`}>
      <Icon as={icon} size={large ? 32 : 24} className="text-ink-muted" />
      {title ? <Text className="mt-3 font-medium text-ink">{title}</Text> : null}
      <Text className={`text-center text-ink-muted ${large ? "mt-1 text-sm" : "max-w-xs text-sm"}`}>{message}</Text>
    </View>
  );
}
