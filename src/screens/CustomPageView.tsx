// src/screens/CustomPageView.tsx
// The public face of a Custom Page — what myako.site/<slug> shows. Mounted by SlugRoute when the slug belongs to a
// Custom Page. It is its own website: no top bar, no bottom nav (routes.ts leaves the nav off known Custom Page slugs).
// Mirrors the web CustomPageView.
import { router, useLocalSearchParams, type Href } from "expo-router";
import { Pencil } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CustomPageRenderer } from "@/components/customPage/CustomPageRenderer";
import { InquiryDialog } from "@/components/customPage/InquiryDialog";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/hooks/useAuth";
import { recordCustomPageEvent } from "@/hooks/useCustomPages";
import { useStartConversation } from "@/hooks/useMessaging";
import { rememberReturnTo } from "@/lib/authRedirect";
import { customPagePath, rememberReferrer, visitorId, type PublicCustomPage } from "@/lib/customPage";
import { friendlyError } from "@/lib/friendlyError";

export function CustomPageView({ page }: { page: PublicCustomPage }) {
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const startConversation = useStartConversation();
  const { slug: requestedSlug } = useLocalSearchParams<{ slug?: string }>();
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const config = page.config;
  const name = config.identity?.name || page.name;
  const ownerBanner = page.is_owner && page.state !== "live";

  // A retired slug still resolves (see get_public_custom_page) — move to the current link.
  useEffect(() => {
    const requested = (requestedSlug ?? "").toLowerCase();
    if (requested && requested !== page.slug) router.replace(customPagePath(page.slug) as Href);
  }, [requestedSlug, page.slug]);

  // One view per visit. The server de-dupes by visitor within 30 minutes and ignores the owner.
  useEffect(() => {
    if (page.state === "live") recordCustomPageEvent(page.id, "view", visitorId());
  }, [page.id, page.state]);

  async function messageOwner() {
    if (!user) {
      rememberReturnTo(customPagePath(page.slug));
      router.push("/login" as Href);
      return;
    }
    if (user.id === page.owner.id) {
      toast("This is your own page.");
      return;
    }
    try {
      const conversationId = await startConversation.mutateAsync(page.owner.id);
      router.push(`/messages/${conversationId}` as Href);
    } catch (err) {
      toast(friendlyError(err, "Couldn't open the chat. Please try again."), { variant: "error" });
    }
  }

  return (
    <View className="flex-1 bg-canvas">
      {ownerBanner ? (
        <View className="flex-row items-center justify-between gap-3 bg-ink px-4 pb-2.5" style={{ paddingTop: insets.top + 10 }}>
          <Text className="flex-1 text-sm text-canvas">{page.state === "private" ? "Only you can see this page." : "This page isn't published yet — only you can see this preview."}</Text>
          <Pressable
            onPress={() => router.push(`/me/custom-pages/${page.id}/edit` as Href)}
            accessibilityRole="button"
            accessibilityLabel="Edit page"
            hitSlop={8}
            className="shrink-0 flex-row items-center gap-1.5"
          >
            <Icon as={Pencil} size={14} className="text-canvas" />
            <Text className="text-sm font-medium text-canvas" style={{ textDecorationLine: "underline" }}>
              Edit
            </Text>
          </Pressable>
        </View>
      ) : null}

      <CustomPageRenderer
        config={config}
        slug={page.slug}
        safeTop={ownerBanner ? 0 : insets.top}
        safeBottom={insets.bottom}
        actions={{
          onCta: (cta) => recordCustomPageEvent(page.id, cta.action === "download" ? "download" : "cta_click", visitorId(), cta.id),
          onDocumentRead: () => recordCustomPageEvent(page.id, "cta_click", visitorId(), "document"),
          onDocumentDownload: () => recordCustomPageEvent(page.id, "download", visitorId(), "document"),
          onShare: () => recordCustomPageEvent(page.id, "cta_click", visitorId(), "share"),
          onOpenInquiry: () => setInquiryOpen(true),
          onMessageOwner: () => void messageOwner(),
          onCreateYours: () => {
            rememberReferrer(page.slug);
            recordCustomPageEvent(page.id, "create_click", visitorId());
          },
        }}
      />

      {page.is_owner && page.state === "live" ? (
        <Pressable
          onPress={() => router.push(`/me/custom-pages/${page.id}` as Href)}
          accessibilityRole="button"
          accessibilityLabel="Manage page"
          className="absolute right-4 flex-row items-center gap-1.5 rounded-full bg-ink px-4 py-2.5"
          style={{ bottom: insets.bottom + 16, elevation: 6 }}
        >
          <Icon as={Pencil} size={14} className="text-canvas" />
          <Text className="text-sm font-medium text-canvas">Manage page</Text>
        </Pressable>
      ) : null}

      {inquiryOpen ? <InquiryDialog pageId={page.id} pageName={name} onClose={() => setInquiryOpen(false)} /> : null}
    </View>
  );
}
