// src/components/project/book/Stars.tsx
// Star display and star picker shared by the reader's review sheet (reader-theme colours)
// and the project page's Reviews section (app-theme colours).
import { Star } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { haptics } from "@/lib/haptics";

export function StarRow({ rating, size = 14, on, off }: { rating: number; size?: number; on: string; off: string }) {
  const filled = Math.round(rating);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }} accessible accessibilityRole="image" accessibilityLabel={`${rating.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} color={n <= filled ? on : off} fill={n <= filled ? on : "none"} />
      ))}
    </View>
  );
}

export function StarPicker({ value, onChange, size = 34, on, off }: { value: number; onChange: (n: number) => void; size?: number; on: string; off: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }} accessibilityRole="radiogroup" accessibilityLabel="Your rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          onPress={() => {
            haptics.selection();
            onChange(n);
          }}
          accessibilityRole="radio"
          accessibilityState={{ checked: n === value }}
          accessibilityLabel={`${n} star${n === 1 ? "" : "s"}`}
          hitSlop={4}
          style={{ padding: 2 }}
        >
          <Star size={size} color={n <= value ? on : off} fill={n <= value ? on : "none"} />
        </Pressable>
      ))}
    </View>
  );
}
