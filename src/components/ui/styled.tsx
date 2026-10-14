// src/components/ui/styled.tsx
// className-enabled wrappers for third-party components. Core React Native
// components (View, Text, Pressable, TextInput, ScrollView…) get className
// automatically through NativeWind's Metro resolver; anything else needs the
// small bridge below.
import { Image as ExpoImage, type ImageProps as ExpoImageProps, type ImageSource } from "expo-image";
import type { LucideIcon, LucideProps } from "lucide-react-native";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useCssElement } from "react-native-css";

import { useIsOnline } from "../../hooks/useIsOnline";
import { isRemoteUrl, stableImageKey, storeFileName } from "../../lib/imageKey";
import { lookupStoredImage, storeImage, subscribeStoredImage } from "../../lib/imageStore";

type ImageProp = ExpoImageProps & {
  className?: string;
  /**
   * Keep a durable on-device copy so the picture still shows with no network (default). Pass `false` for private
   * media that must not be stored automatically (chat photos use their own tap-to-download store).
   */
  durable?: boolean;
};

/** The remote uri of a plain `{uri}` / string source; null for assets, arrays, local files and null. */
function remoteUriOf(source: ExpoImageProps["source"]): string | null {
  if (typeof source === "string") return isRemoteUrl(source) ? source : null;
  if (source && typeof source === "object" && !Array.isArray(source) && "uri" in source && isRemoteUrl(source.uri)) return source.uri;
  return null;
}

const NEVER = () => () => {};

/**
 * expo-image with className (rounded-full, w-10, h-10, …) and offline-safe remote images:
 *   1. a stable `cacheKey` (signed-URL tokens no longer defeat expo-image's disk cache) and `memory-disk` caching;
 *   2. (durable, default) the picture is also kept in our own store — rendered from there once present, so it
 *      survives iOS cache expiry and works offline. While it downloads we render nothing (no double download); if
 *      we're offline or the download fails we fall back to the remote URL, which expo-image may still have cached.
 */
export function Image({ durable = true, source, cachePolicy, ...rest }: ImageProp) {
  const remote = remoteUriOf(source);
  const name = remote && durable ? storeFileName(remote) : null;
  const subscribe = useCallback((l: () => void) => (name ? subscribeStoredImage(name, l) : NEVER()), [name]);
  const stored = useSyncExternalStore(subscribe, () => (name ? lookupStoredImage(name) : null));
  const online = useIsOnline();
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    if (!remote || !name || stored) return;
    if (!online) {
      setGaveUp(true);
      return;
    }
    let alive = true;
    setGaveUp(false);
    void storeImage(remote).then((uri) => {
      if (alive && !uri) setGaveUp(true);
    });
    return () => {
      alive = false;
    };
  }, [remote, name, stored, online]);

  let resolved: ExpoImageProps["source"] = source;
  if (remote) {
    const base: ImageSource = typeof source === "string" ? { uri: source } : (source as ImageSource);
    if (stored) resolved = { uri: stored };
    else if (name && !gaveUp) resolved = null; // store download in flight
    else resolved = { ...base, cacheKey: base.cacheKey ?? stableImageKey(remote) };
  }

  return useCssElement(ExpoImage, { ...rest, source: resolved, cachePolicy: cachePolicy ?? "memory-disk" }, { className: "style" });
}

type IconProps = Omit<LucideProps, "ref"> & {
  /** Any lucide icon, e.g. `as={Check}`. */
  as: LucideIcon;
  /** Tailwind classes — `text-accent` etc. set the icon colour, like on web. */
  className?: string;
};

/**
 * Lucide icon with className. On web the icons inherit `currentColor`, so the
 * codebase colours them with `text-*` classes; this maps that colour onto the
 * icon's `color` prop so those class names keep working unchanged.
 *   <Icon as={Check} size={18} className="text-tick-blue" />
 */
export function Icon({ as: Component, ...props }: IconProps) {
  return useCssElement(Component, props, {
    className: { target: "style", nativeStyleMapping: { color: true } },
  });
}
