// src/components/ui/RefreshSkeleton.tsx
// Placeholder shown while a pull-to-refresh is running: the list clears, pulses, then the fresh rows replace it —
// so a pull is visibly a reload rather than just a spinner over unchanged content.
import { View } from "react-native";

import { Skeleton } from "./Skeleton";

export function RefreshSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <View className="px-1 pt-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="mb-4 h-24 rounded-2xl" />
      ))}
    </View>
  );
}
