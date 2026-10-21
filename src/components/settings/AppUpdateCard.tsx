// File: src/components/settings/AppUpdateCard.tsx
//
// The native counterpart of the web "Get the Akọ app" card — repurposed: instead of "download the app"
// it says "a newer version is available". It appears only when ALL of these hold:
//   1. the app is running on Android,
//   2. it was NOT installed from Google Play (Play handles its own updates), and
//   3. the admin has uploaded an APK more recently than this build was installed.
// Tapping it opens the APK link; the browser downloads it and Android offers to install over the top,
// which also resets "installed at" — so the card disappears by itself once the update is applied.
import { Download, Smartphone } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { Text } from "@/components/ui/Text";
import { useVerifiedColors } from "@/components/ui/VerifiedBadge";
import { Icon } from "@/components/ui/styled";
import { formatApkSize, getApkDownloadUrl, useAppDownloadSettings } from "@/hooks/useAppDownload";
import { getInstallInfo, type InstallInfo } from "@/lib/installSource";
import { openExternal } from "@/lib/openExternal";

export function AppUpdateCard() {
  const colors = useVerifiedColors();
  const isAndroid = Platform.OS === "android";
  const { data: settings } = useAppDownloadSettings(isAndroid);
  const [install, setInstall] = useState<InstallInfo | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!isAndroid) return;
    let alive = true;
    void getInstallInfo().then((info) => alive && setInstall(info));
    return () => {
      alive = false;
    };
  }, [isAndroid]);

  const url = getApkDownloadUrl(settings);
  const uploadedAt = settings?.apk_uploaded_at ? new Date(settings.apk_uploaded_at).getTime() : 0;
  const show = isAndroid && !!install && !install.fromPlayStore && !!url && uploadedAt > install.installedAt;
  if (!show || !url) return null;

  const sizeLabel = formatApkSize(settings?.apk_size_bytes);

  return (
    <Pressable
      onPress={() => void openExternal(url)}
      accessibilityRole="button"
      accessibilityLabel="Download the latest version of Akọ"
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      className="overflow-hidden rounded-3xl active:opacity-90"
      style={{ shadowColor: colors.glow, shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6 }}
    >
      {size.w > 0 ? (
        <Svg width={size.w} height={size.h} style={{ position: "absolute" }}>
          <Defs>
            <LinearGradient id="updateCardFill" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={colors.from} />
              <Stop offset="1" stopColor={colors.to} />
            </LinearGradient>
          </Defs>
          <Rect width={size.w} height={size.h} fill="url(#updateCardFill)" />
        </Svg>
      ) : (
        <View style={{ position: "absolute", inset: 0, backgroundColor: colors.to }} />
      )}
      <View className="flex-row items-center gap-3.5 p-4">
        <View className="h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: "rgba(255,255,255,0.16)", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" }}>
          <Icon as={Smartphone} size={22} color="#FFFFFF" />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-[15px] font-semibold leading-tight" style={{ color: "#FFFFFF" }}>
            New version available
          </Text>
          <Text className="mt-0.5 text-xs" style={{ color: "rgba(255,255,255,0.8)" }}>
            {sizeLabel ? `Update Akọ on this phone · ${sizeLabel}` : "Update Akọ on this phone"}
          </Text>
        </View>
        <View className="flex-row items-center gap-1.5 rounded-full bg-white px-3.5 py-2">
          <Icon as={Download} size={14} color={colors.to} />
          <Text className="text-xs font-semibold" style={{ color: colors.to }}>
            Update
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
