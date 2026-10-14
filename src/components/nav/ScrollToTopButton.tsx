// src/components/nav/ScrollToTopButton.tsx
// App-wide "scroll to top" arrow, rendered once by the (app) layout. Any screen that attaches
// `useChromeScroll()` to its list gets it automatically (see ChromeProvider).
//
// It sits exactly where the floating chat button (ChatFab in BottomNav) sits, one layer below it
// (zIndex 30 vs 40), so while the chat button is on screen it fully covers the arrow, and the arrow
// is only visible once the chat button is gone — the nav auto-hiding on scroll-down, or a screen
// where the chat button isn't shown. The arrow stays put when the nav slides away.
import { usePathname } from "expo-router";
import { ArrowUp } from "lucide-react-native";
import { Pressable } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/components/ui/styled";
import { haptics } from "@/lib/haptics";
import { FAB_GAP, FAB_SIZE } from "./BottomNav";
import { useChrome } from "./ChromeProvider";
import { showsBottomNav } from "./routes";

const ARROW_SIZE = 44;
const FAB_RIGHT = 16;
// Centre the 44px arrow behind the 56px chat button.
const CENTER_OFFSET = (FAB_SIZE - ARROW_SIZE) / 2;

export function ScrollToTopButton() {
  const { showScrollTop, scrollToTopRef, navHeight } = useChrome();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  if (!showScrollTop) return null;

  const withNav = showsBottomNav(pathname) && navHeight > 0;
  const right = withNav ? FAB_RIGHT + CENTER_OFFSET : 16;
  const bottom = withNav ? navHeight + FAB_GAP + CENTER_OFFSET : insets.bottom + 16;

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(120)}
      pointerEvents="box-none"
      style={{ position: "absolute", right, bottom, zIndex: 30 }}
    >
      <Pressable
        onPress={() => {
          haptics.selection();
          scrollToTopRef.current?.();
        }}
        accessibilityRole="button"
        accessibilityLabel="Scroll to top"
        className="items-center justify-center rounded-full border border-border bg-canvas"
        style={{ width: ARROW_SIZE, height: ARROW_SIZE, elevation: 4 }}
      >
        <Icon as={ArrowUp} size={18} className="text-ink" />
      </Pressable>
    </Animated.View>
  );
}
