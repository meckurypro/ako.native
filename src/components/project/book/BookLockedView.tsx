// src/components/project/book/BookLockedView.tsx
// Shown to a signed-in non-owner who hasn't bought (or been granted) the book.
import { Image as ImageIcon, Lock } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";

import { Image, Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useSmartBack } from "@/hooks/useSmartBack";

interface BookLockedViewProps {
  title: string;
  thumbnailUrl: string | null;
  price: number;
  onBuy: () => Promise<void>;
  buying: boolean;
}

export function BookLockedView({ title, thumbnailUrl, price, onBuy, buying }: BookLockedViewProps) {
  const insets = useSafeAreaInsets();
  const smartBack = useSmartBack();
  const [error, setError] = useState<string | null>(null);

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-canvas px-6">
      <Pressable onPress={smartBack} accessibilityRole="button" accessibilityLabel="Back" hitSlop={12} className="absolute left-4" style={{ top: insets.top + 16 }}>
        <Icon as={ArrowLeft} size={22} className="text-ink" />
      </Pressable>
      {thumbnailUrl ? (
        <Image source={thumbnailUrl} contentFit="cover" className="w-36 rounded-lg" style={{ aspectRatio: 2 / 3 }} />
      ) : (
        <View className="w-36 items-center justify-center rounded-lg bg-surface" style={{ aspectRatio: 2 / 3 }}>
          <Icon as={ImageIcon} size={28} className="text-ink-muted" />
        </View>
      )}
      <Text className="text-center text-lg font-medium text-ink">{title}</Text>
      <View className="flex-row items-center gap-1.5">
        <Icon as={Lock} size={14} className="text-ink-muted" />
        <Text className="text-sm text-ink-muted">Buy to read this book</Text>
      </View>
      <Pressable
        onPress={async () => {
          setError(null);
          try {
            await onBuy();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't complete purchase.");
          }
        }}
        disabled={buying}
        accessibilityRole="button"
        className={`rounded-full bg-accent px-6 py-2.5 ${buying ? "opacity-50" : ""}`}
      >
        <Text className="text-sm font-medium text-canvas">{buying ? "Processing…" : `Buy for $${price.toFixed(2)}`}</Text>
      </Pressable>
      {error && <Text className="text-center text-sm text-danger">{error}</Text>}
    </View>
  );
}
