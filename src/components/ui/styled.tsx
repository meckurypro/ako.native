// src/components/ui/styled.tsx
// className-enabled wrappers for third-party components. Core React Native
// components (View, Text, Pressable, TextInput, ScrollView…) get className
// automatically through NativeWind's Metro resolver; anything else needs the
// small bridge below.
import { Image as ExpoImage, type ImageProps as ExpoImageProps, type ImageSource } from "expo-image";
import type { LucideIcon, LucideProps } from "lucide-react-native";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { View } from "react-native";
import { useCssElement } from "react-native-css";

import { isRemoteUrl, stableImageKey, storeFileName } from "../../lib/imageKey";
import { MediaPlaceholder, type MediaKind } from "./MediaPlaceholder";
import { discardStoredImage, lookupStoredImage, storeImage, subscribeStoredImage } from "../../lib/imageStore";

type ImageProp = ExpoImageProps & {
  className?: string;
  /**
   * Keep a durable on-device copy so the picture still shows with no network (default). Pass `false` for private
   * media that must not be stored automatically (chat photos use their own tap-to-download store).
   */
  durable?: boolean;
  /** What to show when the picture is missing or fails to load (default: gradient + image icon). "none" = render nothing special; the caller handles `onError` itself. */
  fallback?: MediaKind | "none";
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
 *   2. (durable, default) once the picture has loaded, a copy is kept in our own store and used from then on, so it
 *      survives iOS cache expiry and works offline.
 *
 * The remote URL is ALWAYS what renders until a stored copy exists. The store is a background optimisation and must
 * never be able to blank a picture: it used to hold the image back until its own download finished, so a stalled or
 * failed download left every avatar, thumbnail and photo empty. A stored copy that fails to display is discarded and
 * the remote URL takes over again.
 */
export function Image({ durable = true, fallback = "image", source, cachePolicy, onLoad, onError, ...rest }: ImageProp) {
  const [failed, setFailed] = useState(false);
  const remote = remoteUriOf(source);
  const name = remote && durable ? storeFileName(remote) : null;
  const subscribe = useCallback((l: () => void) => (name ? subscribeStoredImage(name, l) : NEVER()), [name]);
  const stored = useSyncExternalStore(subscribe, () => (name ? lookupStoredImage(name) : null));

  let resolved: ExpoImageProps["source"] = source;
  if (remote) {
    const base: ImageSource = typeof source === "string" ? { uri: source } : (source as ImageSource);
    resolved = stored ? { uri: stored } : { ...base, cacheKey: base.cacheKey ?? stableImageKey(remote) };
  }

  const handleLoad = useCallback<NonNullable<ExpoImageProps["onLoad"]>>(
    (e) => {
      // Only a picture that actually displayed is worth keeping (no downloads for dead links), and only after it is
      // on screen so the store never competes with the first paint.
      if (remote && name && !stored) void storeImage(remote);
      onLoad?.(e);
    },
    [remote, name, stored, onLoad]
  );

  const handleError = useCallback<NonNullable<ExpoImageProps["onError"]>>(
    (e) => {
      if (stored && name) {
        discardStoredImage(name); // bad stored copy: drop it, the remote URL renders next
        return;
      }
      setFailed(true);
      onError?.(e);
    },
    [stored, name, onError]
  );

  // A new picture (or a retry after the network returns) gets a fresh attempt.
  const sourceKey = remote ?? (typeof source === "number" ? String(source) : "");
  useEffect(() => setFailed(false), [sourceKey]);

  const cssElement = useCssElement(ExpoImage, { ...rest, source: resolved, cachePolicy: cachePolicy ?? "memory-disk", onLoad: handleLoad, onError: handleError }, { className: "style" });

  if (failed && fallback !== "none") {
    return (
      <View className={rest.className} style={rest.style as never}>
        <MediaPlaceholder kind={fallback} seed={remote ?? ""} style={{ width: "100%", height: "100%" }} />
      </View>
    );
  }
  return cssElement;
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
