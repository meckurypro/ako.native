// Shared pull-to-refresh: drag the page down, every passed refetch runs, spinner clears when all settle.
// Feed / HashtagFeed / Notifications keep their own refresh; everything else uses this.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshControl } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";

type Refetch = () => Promise<unknown> | unknown;

export function usePullToRefresh(refetch: Refetch | Refetch[], offset = 0) {
  const { colors } = useTheme();
  const [refreshing, setRefreshing] = useState(false);

  // Read through a ref so the control's identity doesn't change when callers pass a fresh array each render.
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const onRefresh = useCallback(async () => {
    const list = Array.isArray(refetchRef.current) ? refetchRef.current : [refetchRef.current];
    setRefreshing(true);
    try {
      // allSettled: one failing query must never leave the spinner stuck.
      await Promise.allSettled(list.map((fn) => Promise.resolve().then(fn)));
    } finally {
      if (mounted.current) setRefreshing(false);
    }
  }, []);

  const refreshControl = useMemo(
    () => <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} progressViewOffset={offset} />,
    [refreshing, onRefresh, colors.accent, offset]
  );

  return { refreshing, onRefresh, refreshControl };
}
