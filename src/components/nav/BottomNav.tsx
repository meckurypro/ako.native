// src/components/nav/BottomNav.tsx
// The persistent bottom tab bar: Feed · Discover · Library · Messages · Profile.
// Rendered once by the (app) layout and shown only where routes.ts says so.
// Active state mirrors web: Messages stays active across /messages/* and
// /page-inbox/*; Profile is active on your own profile or your active Page.
import { LibraryBig, MessageCircle, Search, User } from "lucide-react-native";
import { router, useGlobalSearchParams, usePathname, type Href } from "expo-router";
import type { ComponentType } from "react";
import { Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, withTiming, Easing } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { Text } from "@/components/ui/Text";
import { useAuth } from "@/hooks/useAuth";
import { useUnreadConversationCount } from "@/hooks/useMessaging";
import { usePageInboxUnreadCount } from "@/hooks/usePageInbox";
import { useActiveIdentity } from "@/hooks/usePages";
import { haptics } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { useChrome } from "./ChromeProvider";
import { NAV_PATH, showsBottomNav, type NavKey } from "./routes";

interface IconProps {
  size?: number;
  strokeWidth?: number;
  color: string;
  fill: string;
}

function FeedIcon({ size = 24, strokeWidth = 1.75, color, fill }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 11.5 12 4l9 7.5" />
      <Path d="M5.5 10v9a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-9" />
    </Svg>
  );
}

// lucide icons take color/fill props directly, so they share one signature with FeedIcon.
const wrap =
  (Lucide: ComponentType<{ size?: number; strokeWidth?: number; color?: string; fill?: string }>) =>
  (p: IconProps) => <Lucide {...p} />;

const ITEMS: { key: NavKey; label: string; Icon: (p: IconProps) => React.JSX.Element }[] = [
  { key: "feed", label: "Feed", Icon: FeedIcon },
  { key: "topics", label: "Discover", Icon: wrap(Search) },
  { key: "library", label: "Library", Icon: wrap(LibraryBig) },
  { key: "messages", label: "Messages", Icon: wrap(MessageCircle) },
  { key: "profile", label: "Profile", Icon: wrap(User) },
];

export function BottomNav() {
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ username?: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { hidden, setNavHeight } = useChrome();

  const { user, profile } = useAuth();
  const { data: identity } = useActiveIdentity();
  const activePageId = identity?.mode === "page" ? identity.page.id : undefined;
  const personalUnread = useUnreadConversationCount();
  const pageUnread = usePageInboxUnreadCount(activePageId);
  const unreadCount = activePageId ? pageUnread : personalUnread;

  const visible = showsBottomNav(pathname);

  const barStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: withTiming(hidden.value * 140, { duration: 300, easing: Easing.out(Easing.cubic) }) }],
    opacity: withTiming(1 - hidden.value, { duration: 300 }),
  }));

  if (!user || !visible) return null;

  const username = typeof params.username === "string" ? params.username : undefined;
  const onOwnProfile = pathname.startsWith("/profile/") && !!profile?.username && username === profile.username;
  const onActivePage = pathname.startsWith("/page/") && identity?.mode === "page" && username === identity.page.username;

  const isActive = (key: NavKey): boolean => {
    switch (key) {
      case "feed":
        return pathname === "/feed";
      case "topics":
        return pathname === "/topics";
      case "library":
        return pathname === "/library";
      case "messages":
        return pathname.startsWith("/messages") || pathname.startsWith("/page-inbox") || pathname === "/inbox";
      case "profile":
        return onOwnProfile || onActivePage;
    }
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      onLayout={(e) => setNavHeight(e.nativeEvent.layout.height)}
      className="absolute inset-x-0 bottom-0 z-40 rounded-t-[28px] border-t border-border bg-surface/95 px-2 pt-3"
      style={[
        {
          paddingBottom: insets.bottom + 12,
          shadowColor: `rgb(${colors.shadowInkRgb})`,
          shadowOffset: { width: 0, height: -1 },
          shadowOpacity: 0.06,
          shadowRadius: 3,
          elevation: 8,
        },
        barStyle,
      ]}
    >
      <View className="flex-row items-center justify-around">
        {ITEMS.map(({ key, label, Icon }) => {
          const active = isActive(key);
          const color = active ? colors.accent : colors.inkMuted;
          return (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={label}
              onPress={() => {
                if (active && key !== "messages") return;
                haptics.selection();
                router.replace(NAV_PATH[key] as Href);
              }}
              className="w-14 items-center gap-1"
            >
              <View>
                <Icon size={24} strokeWidth={active ? 2 : 1.75} color={color} fill={active ? color : "none"} />
                {key === "messages" && unreadCount > 0 ? (
                  <View className="absolute -right-1 -top-1 h-4 w-4 items-center justify-center rounded-full bg-danger">
                    <Text className="text-[10px] font-medium text-canvas">{unreadCount > 9 ? "9+" : unreadCount}</Text>
                  </View>
                ) : null}
              </View>
              <Text className="text-[11px] font-medium" style={{ color }}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Animated.View>
  );
}

/** Bottom padding lists/scroll views need so their last item clears the nav. */
export function useBottomNavInset(): number {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { navHeight } = useChrome();
  return showsBottomNav(pathname) ? Math.max(navHeight, 72 + insets.bottom) + 8 : insets.bottom + 16;
}
