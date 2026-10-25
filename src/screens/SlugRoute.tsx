// src/screens/SlugRoute.tsx
// The flat /:slug route used to belong to Projects alone. Custom Pages share that namespace (the database refuses a
// slug that collides with a Project, in either direction), so this decides which one a slug is:
//   1. a published Custom Page (or the owner's own unpublished one)  → CustomPageView
//   2. anything else                                                  → ProjectBySlug, exactly as before
// Custom Pages are looked up first because it is one cheap RPC that answers null for everything that isn't one.
import { useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@/components/ui/Text";
import { useIsOnline } from "@/hooks/useIsOnline";
import { usePublicCustomPage } from "@/hooks/useCustomPages";
import { forgetCustomPageSlug, rememberCustomPageSlug } from "@/lib/customPageSlugs";
import { CustomPageView } from "./CustomPageView";
import { ProjectBySlug } from "./ProjectBySlug";

export function SlugRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const insets = useSafeAreaInsets();
  const online = useIsOnline();
  const { data, isPending, isError } = usePublicCustomPage(slug);

  // Teach the nav which slugs are Custom Pages (it decides from the path alone), and let go of one that isn't any more.
  const resolved = !isPending && !isError;
  const isCustomPage = !!data;
  useEffect(() => {
    if (!slug || !resolved) return;
    if (isCustomPage) rememberCustomPageSlug(slug);
    else forgetCustomPageSlug(slug);
  }, [slug, resolved, isCustomPage]);

  // Offline the lookup pauses instead of failing; don't hold a Project (which can open from the device) behind it.
  if (isPending && online) {
    return (
      <View className="flex-1 bg-canvas px-4" style={{ paddingTop: insets.top + 16 }}>
        <Text className="text-ink-muted">Loading…</Text>
      </View>
    );
  }
  // A failed lookup must not hide a Project that does live here — fall through rather than show an error.
  if (!data || isError) return <ProjectBySlug />;
  return <CustomPageView page={data} />;
}
