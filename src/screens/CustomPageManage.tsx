// src/screens/CustomPageManage.tsx
// /me/custom-pages/:id — one page's control room: link + QR, publish state, visibility, analytics and messages
// (native twin of the web manage screen). QR is shown on screen and full-screen for printing or scanning; exporting it
// as an image would need a view-capture module the app doesn't ship yet, so the link itself is shared/copied instead.
import * as Clipboard from "expo-clipboard";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { Copy, ExternalLink, Maximize2, Pencil, Share2, Trash2, X } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Share, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { Portal } from "@/components/ui/Portal";
import { QrCode } from "@/components/ui/QrCode";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useBackDismiss } from "@/hooks/useBackDismiss";
import {
  checkCustomPageSlugAvailable,
  useCustomPage,
  useCustomPageInquiries,
  useCustomPageStats,
  useDeleteCustomPage,
  usePublishCustomPage,
  useSetCustomPageSlug,
  useSetCustomPageVisibility,
  useSetInquiryStatus,
  useUnpublishCustomPage,
} from "@/hooks/useCustomPages";
import { customPageUrl, type CustomPageInquiry } from "@/lib/customPage";
import { friendlyError } from "@/lib/friendlyError";
import { openExternal } from "@/lib/openExternal";
import { isReservedProjectSlug, isValidProjectSlugFormat } from "@/lib/projectLinks";
import { timeAgo } from "@/lib/timeAgo";
import { useTheme } from "@/theme/ThemeProvider";

const VISIBILITY = [
  { value: "public", label: "Public", hint: "Anyone with the link." },
  { value: "unlisted", label: "Unlisted", hint: "Anyone with the link. Not offered anywhere else." },
  { value: "private", label: "Private", hint: "Only you can open it." },
] as const;

const RANGES = [7, 30, 90] as const;

const CARD = "rounded-2xl border border-border bg-surface p-4";

export function CustomPageManage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { data: page, isLoading, isError } = useCustomPage(id);
  const publish = usePublishCustomPage();
  const unpublish = useUnpublishCustomPage();
  const setVisibility = useSetCustomPageVisibility();
  const del = useDeleteCustomPage();
  const [days, setDays] = useState<number>(30);
  const stats = useCustomPageStats(page?.is_published ? id : undefined, days);
  const inquiries = useCustomPageInquiries(id);
  const [slugOpen, setSlugOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const url = page ? customPageUrl(page.slug) : "";

  if (isLoading) {
    return (
      <View className="flex-1 bg-canvas">
        <ScreenHeader title="Custom page" />
        <Text className="px-4 text-ink-muted">Loading…</Text>
      </View>
    );
  }
  if (isError || !page) {
    return (
      <View className="flex-1 bg-canvas">
        <ScreenHeader title="Custom page" />
        <View className="mt-16 items-center px-6">
          <Text className="font-medium text-ink">This page couldn't be found.</Text>
          <Pressable onPress={() => router.replace("/me/custom-pages" as Href)} accessibilityRole="button" hitSlop={8} className="mt-4 px-4 py-2">
            <Text className="text-sm font-medium text-accent">Back to your pages</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast(ok, { variant: "success" });
    } catch (err) {
      toast(friendlyError(err, "Something went wrong. Please try again."), { variant: "error", duration: 3500 });
    }
  };

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(url);
      toast("Link copied.", { variant: "success" });
    } catch {
      toast("Couldn't copy the link.", { variant: "error" });
    }
  };

  const shareLink = async () => {
    try {
      await Share.share({ message: url, url });
    } catch {
      /* the sheet being dismissed is not an error */
    }
  };

  const maxDaily = Math.max(1, ...(stats.data?.daily.map((d) => d.views) ?? [1]));
  const ctaLabel = (cta: string) => (cta === "document" ? "Document" : cta === "share" ? "Share button" : (page.draft.ctas ?? []).find((c) => c.id === cta)?.label ?? cta);

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader
        title={page.name}
        onBack={() => router.replace("/me/custom-pages" as Href)}
        right={
          <Pressable onPress={() => router.push(`/me/custom-pages/${page.id}/edit` as Href)} accessibilityRole="button" accessibilityLabel="Edit page" className="flex-row items-center gap-1.5 rounded-full bg-accent px-4 py-2">
            <Icon as={Pencil} size={14} className="text-canvas" />
            <Text className="text-sm font-medium text-canvas">Edit</Text>
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 48, gap: 20 }} showsVerticalScrollIndicator={false}>
        {/* Link + QR */}
        <View className={CARD}>
          <View className="flex-row items-center gap-2">
            <View className={`rounded-full px-2.5 py-0.5 ${page.is_published ? "bg-accent-soft" : "bg-ink-muted/15"}`}>
              <Text className={`text-xs ${page.is_published ? "text-accent" : "text-ink-muted"}`}>{page.is_published ? "Published" : "Draft"}</Text>
            </View>
            <Text numberOfLines={1} className="min-w-0 flex-1 text-sm text-ink">
              {url.replace("https://", "")}
            </Text>
          </View>
          <View className="mt-3 flex-row flex-wrap gap-2">
            <ActionPill icon={Copy} label="Copy link" onPress={() => void copy()} />
            <ActionPill icon={Share2} label="Share" onPress={() => void shareLink()} />
            <ActionPill icon={ExternalLink} label={page.is_published ? "Open page" : "Preview"} onPress={() => router.push(`/${page.slug}` as Href)} />
            <Pressable onPress={() => setSlugOpen(true)} accessibilityRole="button" className="rounded-full border border-border px-4 py-2">
              <Text className="text-sm font-medium text-ink-muted">Change link</Text>
            </Pressable>
          </View>
          <View className="mt-4 flex-row items-center gap-4">
            <Pressable onPress={() => setQrOpen(true)} accessibilityRole="button" accessibilityLabel="Show QR code full screen">
              <QrCode value={url} size={112} margin={2} />
            </Pressable>
            <View className="min-w-0 flex-1">
              <Text className="text-sm font-medium text-ink">QR code</Text>
              <Text className="mb-2 mt-0.5 text-xs leading-4 text-ink-muted">For flyers, banners and screens. It always points to your page's current link.</Text>
              <Pressable onPress={() => setQrOpen(true)} accessibilityRole="button" hitSlop={8} className="flex-row items-center gap-1.5 self-start">
                <Icon as={Maximize2} size={14} className="text-accent" />
                <Text className="text-sm font-medium text-accent">Show full screen</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Publish + visibility */}
        <View className={CARD}>
          <Text className="mb-3 text-sm font-semibold text-ink">Publishing</Text>
          {page.is_published ? (
            <Pressable
              onPress={() => void act(() => unpublish.mutateAsync(page.id), "Unpublished. Visitors can no longer see this page.")}
              disabled={unpublish.isPending}
              accessibilityRole="button"
              className={`self-start rounded-full border border-border px-4 py-2 ${unpublish.isPending ? "opacity-50" : ""}`}
            >
              <Text className="text-sm font-medium text-ink">Unpublish</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => void act(() => publish.mutateAsync(page.id), "Published. Your page is live.")}
              disabled={publish.isPending}
              accessibilityRole="button"
              className={`self-start rounded-full bg-accent px-5 py-2 ${publish.isPending ? "opacity-50" : ""}`}
            >
              <Text className="text-sm font-medium text-canvas">{publish.isPending ? "Publishing…" : "Publish page"}</Text>
            </Pressable>
          )}
          <View className="mt-4 gap-3">
            {VISIBILITY.map((v) => {
              const active = page.visibility === v.value;
              return (
                <Pressable
                  key={v.value}
                  onPress={() => !active && void act(() => setVisibility.mutateAsync({ id: page.id, visibility: v.value }), "Visibility updated.")}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  className="flex-row items-start gap-3"
                >
                  <View className={`mt-0.5 h-5 w-5 items-center justify-center rounded-full border-2 ${active ? "border-accent" : "border-border"}`}>{active ? <View className="h-2.5 w-2.5 rounded-full bg-accent" /> : null}</View>
                  <View className="min-w-0 flex-1">
                    <Text className="text-sm text-ink">{v.label}</Text>
                    <Text className="text-xs text-ink-muted">{v.hint}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Analytics */}
        <View className={CARD}>
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-sm font-semibold text-ink">Analytics</Text>
            <View className="flex-row gap-1.5">
              {RANGES.map((r) => (
                <Pressable key={r} onPress={() => setDays(r)} accessibilityRole="button" accessibilityState={{ selected: days === r }} className={`rounded-full px-3 py-1 ${days === r ? "bg-ink" : "border border-border"}`}>
                  <Text className={`text-xs font-medium ${days === r ? "text-canvas" : "text-ink-muted"}`}>{r}d</Text>
                </Pressable>
              ))}
            </View>
          </View>
          {!page.is_published ? (
            <Text className="text-sm text-ink-muted">Publish your page to start seeing views and clicks.</Text>
          ) : stats.isLoading ? (
            <Text className="text-sm text-ink-muted">Loading…</Text>
          ) : stats.data ? (
            <>
              <View className="flex-row flex-wrap gap-2.5">
                {(
                  [
                    ["Views", stats.data.views],
                    ["Visitors", stats.data.visitors],
                    ["Button clicks", stats.data.clicks],
                    ["Downloads", stats.data.downloads],
                    ["Messages", stats.data.inquiries],
                    ["Sign-up clicks", stats.data.create_clicks],
                  ] as const
                ).map(([label, n]) => (
                  <View key={label} className="items-center rounded-xl bg-canvas p-3" style={{ width: "31%", flexGrow: 1 }}>
                    <Text className="text-xl font-semibold text-ink">{n}</Text>
                    <Text className="mt-0.5 text-[11px] text-ink-muted">{label}</Text>
                  </View>
                ))}
              </View>
              <View accessibilityLabel="Views per day" className="mt-4 h-16 flex-row items-end gap-[2px]">
                {stats.data.daily.map((d) => (
                  <View key={d.day} className="flex-1 rounded-sm bg-accent/70" style={{ height: `${Math.max(3, (d.views / maxDaily) * 100)}%`, minHeight: 2 }} />
                ))}
              </View>
              {stats.data.per_cta.length > 0 ? (
                <View className="mt-4">
                  {stats.data.per_cta.map((r) => (
                    <View key={`${r.cta_id}-${r.event_type}`} className="flex-row justify-between border-t border-border py-2">
                      <Text numberOfLines={1} className="min-w-0 flex-1 pr-3 text-sm text-ink">
                        {ctaLabel(r.cta_id)} <Text className="text-xs text-ink-muted">· {r.event_type === "download" ? "downloads" : "clicks"}</Text>
                      </Text>
                      <Text className="text-sm font-medium text-ink">{r.count}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </>
          ) : null}
        </View>

        <InquiryList pageId={page.id} items={inquiries.data} loading={inquiries.isLoading} />

        <Pressable onPress={() => setConfirmDelete(true)} accessibilityRole="button" className="flex-row items-center justify-center gap-2 py-3">
          <Icon as={Trash2} size={15} className="text-danger" />
          <Text className="text-sm font-medium text-danger">Delete this page</Text>
        </Pressable>
      </ScrollView>

      {slugOpen ? <SlugDialog pageId={page.id} current={page.slug} onClose={() => setSlugOpen(false)} /> : null}
      {qrOpen ? <QrFullScreen url={url} name={page.name} onClose={() => setQrOpen(false)} /> : null}
      {confirmDelete ? (
        <ConfirmDialog
          title="Delete this page?"
          description="The link stops working and its messages and analytics are removed. This can't be undone."
          confirmLabel="Delete"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            void act(async () => {
              await del.mutateAsync(page.id);
              router.replace("/me/custom-pages" as Href);
            }, "Page deleted.");
          }}
        />
      ) : null}
    </View>
  );
}

function ActionPill({ icon, label, onPress }: { icon: Parameters<typeof Icon>[0]["as"]; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="flex-row items-center gap-1.5 rounded-full bg-accent-soft px-4 py-2">
      <Icon as={icon} size={14} className="text-accent" />
      <Text className="text-sm font-medium text-accent">{label}</Text>
    </Pressable>
  );
}

/** The link as a big QR on white — for pointing a camera at, or for a screen on the wall. */
function QrFullScreen({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  useBackDismiss(onClose);
  return (
    <Portal zIndex={56}>
      <View className="flex-1 items-center justify-center bg-white px-8" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} className="absolute right-4 p-2" style={{ top: insets.top + 8 }}>
          <Icon as={X} size={26} className="text-black" />
        </Pressable>
        <Text numberOfLines={2} className="mb-6 text-center font-display text-2xl font-semibold" style={{ color: "#111" }}>
          {name}
        </Text>
        <QrCode value={url} size={280} margin={2} />
        <Text className="mt-6 text-center text-lg font-medium" style={{ color: "#111" }}>
          {url.replace("https://", "")}
        </Text>
      </View>
    </Portal>
  );
}

function InquiryList({ pageId, items, loading }: { pageId: string; items?: CustomPageInquiry[]; loading: boolean }) {
  const setStatus = useSetInquiryStatus(pageId);
  const [showArchived, setShowArchived] = useState(false);
  const visible = (items ?? []).filter((i) => showArchived || i.status !== "archived");
  const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
  return (
    <View className={CARD}>
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-sm font-semibold text-ink">Messages</Text>
        <Pressable onPress={() => setShowArchived((v) => !v)} accessibilityRole="button" hitSlop={8}>
          <Text className="text-xs text-ink-muted">{showArchived ? "Hide archived" : "Show archived"}</Text>
        </Pressable>
      </View>
      {loading ? <Text className="text-sm text-ink-muted">Loading…</Text> : null}
      {!loading && visible.length === 0 ? <Text className="text-sm text-ink-muted">Messages sent from your page appear here.</Text> : null}
      <View className="gap-3">
        {visible.map((q) => (
          <View key={q.id} className={`rounded-xl p-3 ${q.status === "new" ? "bg-accent-soft" : "bg-canvas"}`}>
            <View className="flex-row items-start justify-between gap-3">
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="text-sm font-medium text-ink">
                  {q.name}
                  {q.status === "new" ? "  NEW" : ""}
                </Text>
                <Pressable onPress={() => void openExternal(isEmail(q.contact) ? `mailto:${q.contact}` : `tel:${q.contact.replace(/[^\d+]/g, "")}`)} accessibilityRole="link" hitSlop={6}>
                  <Text className="text-xs text-accent">{q.contact}</Text>
                </Pressable>
              </View>
              <Text className="shrink-0 text-[11px] text-ink-muted">{timeAgo(q.created_at)}</Text>
            </View>
            {q.subject ? <Text className="mt-2 text-sm font-medium text-ink">{q.subject}</Text> : null}
            <Text className="mt-1 text-sm text-ink">{q.message}</Text>
            <View className="mt-2.5 flex-row gap-4">
              {q.status === "new" ? (
                <Pressable onPress={() => setStatus.mutate({ id: q.id, status: "read" })} accessibilityRole="button" hitSlop={6}>
                  <Text className="text-xs font-medium text-accent">Mark as read</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={() => setStatus.mutate({ id: q.id, status: q.status === "archived" ? "read" : "archived" })} accessibilityRole="button" hitSlop={6}>
                <Text className="text-xs text-ink-muted">{q.status === "archived" ? "Unarchive" : "Archive"}</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function SlugDialog({ pageId, current, onClose }: { pageId: string; current: string; onClose: () => void }) {
  const { colors } = useTheme();
  const setSlug = useSetCustomPageSlug();
  const toast = useToast();
  const [slug, setSlugValue] = useState(current);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clean = slug.trim().toLowerCase();
  const formatProblem = useMemo(
    () => (!isValidProjectSlugFormat(clean) ? "Use 3–60 lowercase letters, numbers and single hyphens." : isReservedProjectSlug(clean) ? "That link is reserved." : null),
    [clean],
  );

  useEffect(() => {
    setAvailable(null);
    if (formatProblem || clean === current) return;
    let live = true;
    const t = setTimeout(() => {
      checkCustomPageSlugAvailable(clean, pageId)
        .then((ok) => live && setAvailable(ok))
        .catch(() => live && setAvailable(null));
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [clean, current, formatProblem, pageId]);

  async function submit() {
    setError(null);
    try {
      await setSlug.mutateAsync({ id: pageId, slug: clean });
      toast("Link updated. The old link keeps working.", { variant: "success" });
      onClose();
    } catch (err) {
      setError(friendlyError(err, "Couldn't change the link."));
    }
  }

  const disabled = !!formatProblem || available === false || clean === current || setSlug.isPending;
  return (
    <Modal onClose={onClose} title="Change page link" maxWidth={448}>
      <View className="gap-2">
        <View className="flex-row items-center rounded-xl bg-overlay-surface-raised pl-4">
          <Text className="shrink-0 text-sm text-overlay-ink-muted">myako.site/</Text>
          <TextInput
            value={slug}
            onChangeText={setSlugValue}
            maxLength={60}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            accessibilityLabel="Page link"
            placeholderTextColor={colors.inkMuted}
            className="min-w-0 flex-1 px-1 py-3 text-sm text-overlay-ink"
            style={{ fontFamily: "Inter_400Regular" }}
          />
        </View>
        <Text className="text-xs leading-4 text-overlay-ink-muted">People using your old link are redirected to the new one, so printed QR codes and shared links keep working.</Text>
        <View className="min-h-[18px]">
          {formatProblem ? <Text className="text-xs text-overlay-danger">{formatProblem}</Text> : available === false ? <Text className="text-xs text-overlay-danger">That link is already taken.</Text> : null}
        </View>
        {error ? (
          <Text accessibilityRole="alert" className="text-sm text-overlay-danger">
            {error}
          </Text>
        ) : null}
        <Pressable
          onPress={() => void submit()}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityState={{ disabled, busy: setSlug.isPending }}
          className={`mt-1 items-center rounded-full bg-overlay-accent py-3 ${disabled ? "opacity-50" : ""}`}
        >
          <Text className="text-sm font-medium text-overlay-surface">{setSlug.isPending ? "Saving…" : "Save link"}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}
