// File: src/components/ui/SystemNavigationBar.tsx
// Themes the Android system navigation bar (back / home / recents buttons or the gesture handle) to the app.
//
// How it works (edge-to-edge, which Android 15+ / SDK 53+ enforce): the app already paints behind the system bars,
// so the bar only needs to be (1) transparent — the `expo-navigation-bar` config plugin in app.json sets
// `enforceContrast: false`, removing the OS's translucent white/grey scrim — and (2) given readable button colours,
// which this component does from the app's *resolved* theme (the user can pick light/dark independently of the OS).
//
// OTA safety: this module is a native addition. An APK built before it was added has no `ExpoNavigationBar`
// native module, and importing it eagerly from an OTA bundle would crash on launch. So it is only required when
// the native side is present; older installs simply keep the old bar until they install the new build.
import { requireOptionalNativeModule } from "expo";
import type { ComponentType } from "react";
import { Platform } from "react-native";

type BarStyle = "light" | "dark";

const hasNativeModule = Platform.OS === "android" && requireOptionalNativeModule("ExpoNavigationBar") != null;
const NativeNavigationBar: ComponentType<{ style?: BarStyle }> | null = hasNativeModule
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("expo-navigation-bar").NavigationBar
  : null;

/** `style` follows expo-status-bar: "light" = light buttons (for a dark app), "dark" = dark buttons (for a light app). */
export function SystemNavigationBar({ style }: { style: BarStyle }) {
  return NativeNavigationBar ? <NativeNavigationBar style={style} /> : null;
}
