// src/components/nav/BottomNav.tsx
// The persistent bottom tab bar. Unrestricted: Feed · Discover · Library · Connect · Profile.
// Restricted (no Feed): Discover · Library · Connect · Profile. Messages has no tab — it is the
// floating chat button above the bar (ChatFab).
// Rendered once by the (app) layout and shown only where routes.ts says so.
// Profile is active on your own profile or your active Page. The chat button shows only on the five tab
// screens (Feed, Discover, Library, Connect, Profile) — nowhere you are in the middle of doing something.
import { BlurView } from "expo-blur";
import { LibraryBig, Search, User, Users } from "lucide-react-native";
import { router, useGlobalSearchParams, usePathname, type Href } from "expo-router";
import type { ComponentType } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, withTiming, Easing } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";

import { Text } from "@/components/ui/Text";
import { useIsRestricted } from "@/hooks/useAccountAccess";
import { useAuth } from "@/hooks/useAuth";
import { useUnreadConversationCount } from "@/hooks/useMessaging";
import { usePageInboxUnreadCount } from "@/hooks/usePageInbox";
import { useActiveIdentity } from "@/hooks/usePages";
import { haptics } from "@/lib/haptics";
import { NAV_BLUR_INTENSITY } from "@/theme/blur";
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

type NavItem = { key: NavKey; label: string; Icon: (p: IconProps) => React.JSX.Element };
const FEED: NavItem = { key: "feed", label: "Feed", Icon: FeedIcon };
const DISCOVER: NavItem = { key: "topics", label: "Discover", Icon: wrap(Search) };
const LIBRARY: NavItem = { key: "library", label: "Library", Icon: wrap(LibraryBig) };
const CONNECT: NavItem = { key: "connect", label: "Connect", Icon: wrap(Users) };
const PROFILE: NavItem = { key: "profile", label: "Profile", Icon: wrap(User) };

const FULL_ITEMS: NavItem[] = [FEED, DISCOVER, LIBRARY, CONNECT, PROFILE];
const RESTRICTED_ITEMS: NavItem[] = [DISCOVER, LIBRARY, CONNECT, PROFILE];

/** Unread badge: one crisp notification red in both themes (the semantic `danger` tone is muted and read as muddy on the button). */
const BADGE_BG = "#D8453A";
const BADGE_TEXT = "#FFFFFF";

export const FAB_SIZE = 56;
export const FAB_GAP = 16;

// Two overlapping speech bubbles — a solid one in front carrying the "typing" dots, a softer one behind — so it reads
// as a conversation, not a single comment (the post's comment action is a bubble with a "+", which this used to copy).
// `knockout` is the button's own colour: it draws the dots and a thin ring that separates the two bubbles.
function ChatIcon({ size, bubble, knockout }: { size: number; bubble: string; knockout: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M11 2.5H18A3.5 3.5 0 0 1 21.5 6V16.5L17.8 12.5H11A3.5 3.5 0 0 1 7.5 9V6A3.5 3.5 0 0 1 11 2.5Z" fill={bubble} opacity={0.5} />
      <Path d="M6 7.5H13A3.5 3.5 0 0 1 16.5 11V14A3.5 3.5 0 0 1 13 17.5H8.5L3.2 21.5L2.5 17.5V11A3.5 3.5 0 0 1 6 7.5Z" stroke={knockout} strokeWidth={3.2} strokeLinejoin="round" />
      <Path d="M6 7.5H13A3.5 3.5 0 0 1 16.5 11V14A3.5 3.5 0 0 1 13 17.5H8.5L3.2 21.5L2.5 17.5V11A3.5 3.5 0 0 1 6 7.5Z" fill={bubble} />
      <Circle cx={6.4} cy={12.5} r={1.2} fill={knockout} />
      <Circle cx={9.5} cy={12.5} r={1.2} fill={knockout} />
      <Circle cx={12.6} cy={12.5} r={1.2} fill={knockout} />
    </Svg>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ username?: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { hidden, navHeight, setNavHeight, blurTarget } = useChrome();
  const { resolvedTheme } = useTheme();

  const { user, profile } = useAuth();
  const restricted = useIsRestricted();
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

  // Slides/fades with the bar, but travels far enough to clear the screen edge from its raised position.
  const fabStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: withTiming(hidden.value * (FAB_SIZE + FAB_GAP + 220), { duration: 300, easing: Easing.out(Easing.cubic) }) }],
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
      case "connect":
        return pathname === "/connect";
      case "messages":
        return pathname.startsWith("/messages") || pathname.startsWith("/page-inbox") || pathname === "/inbox";
      case "profile":
        // /me is the redirect screen the Profile tab opens first — already selected while it resolves.
        return pathname === "/me" || onOwnProfile || onActivePage;
    }
  };

  const navList = restricted ? RESTRICTED_ITEMS : FULL_ITEMS;
  // The chat button is a shortcut for browsing, not a fixture: it shows only on the five tab screens (Feed, Discover,
  // Library, Connect, your own Profile). Anywhere you are doing something — a project, a request, a wallet screen, a
  // thread — it stays out of the way.
  const showChatFab = (["feed", "topics", "library", "connect", "profile"] as const).some(isActive);

  return (
    <>
    {/* Floating chat button. A sibling of the bar (not a child) so it stays tappable on Android, which
        ignores touches on children that sit outside their parent's bounds. */}
    {showChatFab ? (
      <Animated.View
        pointerEvents="box-none"
        style={[{ position: "absolute", right: 16, bottom: navHeight + FAB_GAP, zIndex: 40 }, fabStyle]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={unreadCount > 0 ? `Chats, ${unreadCount} unread` : "Chats"}
          onPress={() => {
            haptics.selection();
            router.replace(NAV_PATH.messages as Href);
          }}
          style={({ pressed }) => ({
            width: FAB_SIZE,
            height: FAB_SIZE,
            borderRadius: 18,
            backgroundColor: resolvedTheme === "dark" ? colors.ink : colors.accent,
            alignItems: "center",
            justifyContent: "center",
            transform: [{ scale: pressed ? 0.95 : 1 }],
            shadowColor: `rgb(${colors.shadowInkRgb})`,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.25,
            shadowRadius: 14,
            elevation: 6,
          })}
        >
          <ChatIcon size={30} bubble={resolvedTheme === "dark" ? colors.accent : colors.canvas} knockout={resolvedTheme === "dark" ? colors.ink : colors.accent} />
          {unreadCount > 0 ? (
            // Straddles the tile's top-right corner. The ring is the page colour, so it reads as cut out of the
            // button instead of a flat red dot stuck on it.
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: -9,
                right: -9,
                minWidth: 24,
                height: 24,
                paddingHorizontal: 5,
                borderRadius: 12,
                borderWidth: 2.5,
                borderColor: colors.canvas,
                backgroundColor: BADGE_BG,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: BADGE_TEXT, fontSize: 11, lineHeight: 13, fontFamily: "Inter_600SemiBold", fontVariant: ["tabular-nums"], includeFontPadding: false }}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </Animated.View>
    ) : null}

    <Animated.View
      pointerEvents="box-none"
      onLayout={(e) => setNavHeight(e.nativeEvent.layout.height)}
      // Inline style on purpose: className backgrounds (bg-surface/95) rendered as
      // nothing on device. Web: fixed bottom-0, rounded-t-[28px], border-t,
      // shadow 0 -1 3 @ 6%, bg-surface/80 + backdrop-blur-md.
      style={[
        {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 40,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          shadowColor: `rgb(${colors.shadowInkRgb})`,
          shadowOffset: { width: 0, height: -1 },
          shadowOpacity: 0.06,
          shadowRadius: 3,
        },
        barStyle,
      ]}
    >
      {/* Clip layer: rounds the glass and carries the border-t. */}
      <View
        style={{
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          borderTopWidth: 1,
          borderColor: colors.border,
          overflow: "hidden",
        }}
      >
        {/* backdrop-blur-md (12px): intensity 50 ≈ 12px on Android (÷4 reduction).
            Web's blur has no tint of its own, so use the most transparent system
            material on iOS instead of "light"/"dark", which whiten/darken the glass
            on top of the bg-surface-a80 fill below. */}
        <BlurView
          intensity={NAV_BLUR_INTENSITY}
          tint={
            Platform.OS === "ios"
              ? resolvedTheme === "dark" ? "systemUltraThinMaterialDark" : "systemUltraThinMaterialLight"
              : resolvedTheme === "dark" ? "dark" : "light"
          }
          blurTarget={blurTarget}
          blurMethod="dimezisBlurView"
          style={StyleSheet.absoluteFill}
        />
        {/* bg-surface/80 over the blur */}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: `${colors.surface}CC` }]} />

        <View style={{ paddingHorizontal: 8, paddingTop: 12, paddingBottom: insets.bottom + 12 }}>
          <View className="flex-row items-center justify-around">
            {navList.map(({ key, label, Icon }) => {
              const active = isActive(key);
              const color = active ? colors.accent : colors.inkMuted;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={label}
                  onPress={() => {
                    if (active) return;
                    haptics.selection();
                    router.replace(NAV_PATH[key] as Href);
                  }}
                  // flex-1 (not w-14): each tab gets an equal share of the bar, matching web's justify-around.
                  style={{ flex: 1, minWidth: 56, alignItems: "center", gap: 4 }}
                >
                  <View>
                    <Icon size={24} strokeWidth={active ? 2 : 1.75} color={color} fill={active ? color : "none"} />
                  </View>
                  <Text numberOfLines={1} maxFontSizeMultiplier={1} className="text-[11px] font-medium" style={{ color }}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Animated.View>
    </>
  );
}

/** Bottom padding lists/scroll views need so their last item clears the nav. */
export function useBottomNavInset(): number {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { navHeight } = useChrome();
  return showsBottomNav(pathname) ? Math.max(navHeight, 72 + insets.bottom) + 8 : insets.bottom + 16;
}
