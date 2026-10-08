// src/components/activity/ThumbRow.tsx
// Thumbnail + title + subtitle row shared by History, Library, Events, Gigs and Affiliate links.
import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { Icon, Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";

interface ThumbRowProps {
  onPress: () => void;
  thumbnailUrl?: string | null;
  fallbackIcon: LucideIcon;
  title: string;
  subtitle?: string;
  subtitleIcon?: LucideIcon;
  trailing?: ReactNode;
  /** "card": bordered surface tile. "line": plain row with a bottom divider. */
  variant?: "card" | "line";
  /** Thumbnail edge in px (Tailwind w-11 = 44, w-12 = 48). */
  size?: 44 | 48;
  accessibilityLabel?: string;
}

export function ThumbRow({ onPress, thumbnailUrl, fallbackIcon, title, subtitle, subtitleIcon, trailing, variant = "card", size = 48, accessibilityLabel }: ThumbRowProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel ?? title}
      className={`flex-row items-center gap-3 ${variant === "card" ? "rounded-xl border border-border bg-surface p-3" : "border-b border-border py-3"}`}
    >
      <View className={`shrink-0 items-center justify-center overflow-hidden rounded-lg ${variant === "card" ? "bg-canvas" : "bg-surface"}`} style={{ width: size, height: size }}>
        {thumbnailUrl ? <Image source={thumbnailUrl} contentFit="cover" className="h-full w-full" /> : <Icon as={fallbackIcon} size={18} className="text-ink-muted" />}
      </View>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-sm text-ink">
          {title}
        </Text>
        {subtitle ? (
          <View className="flex-row items-center gap-1">
            {subtitleIcon ? <Icon as={subtitleIcon} size={12} className="text-ink-muted" /> : null}
            <Text numberOfLines={1} className="shrink text-xs text-ink-muted">
              {subtitle}
            </Text>
          </View>
        ) : null}
      </View>
      {trailing}
    </Pressable>
  );
}
