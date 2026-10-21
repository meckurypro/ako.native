// File: src/lib/installSource.ts
//
// Where this Android build came from and when it was installed — used to decide whether to offer the
// "new version available" card (only for builds NOT installed from Google Play, since Play updates those).
//
// Needs the react-native-device-info native module. A binary built before it was added doesn't have it,
// so every call is guarded: when the answer can't be determined we return null and the caller shows
// nothing (never risk nagging a Play Store user).
import { Platform } from "react-native";

const PLAY_INSTALLERS = new Set(["com.android.vending", "com.google.android.feedback"]);

export interface InstallInfo {
  /** True when installed through Google Play. */
  fromPlayStore: boolean;
  /** When this build was installed or last updated, ms since epoch. */
  installedAt: number;
}

export async function getInstallInfo(): Promise<InstallInfo | null> {
  if (Platform.OS !== "android") return null;
  try {
    // Lazy require: keeps iOS / old binaries from touching a module that may not be linked.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-native-device-info");
    const DeviceInfo = mod.default ?? mod;
    const [installer, installedAt] = await Promise.all([DeviceInfo.getInstallerPackageName(), DeviceInfo.getLastUpdateTime()]);
    if (typeof installedAt !== "number" || !Number.isFinite(installedAt) || installedAt <= 0) return null;
    return { fromPlayStore: PLAY_INSTALLERS.has(String(installer)), installedAt };
  } catch {
    return null;
  }
}
