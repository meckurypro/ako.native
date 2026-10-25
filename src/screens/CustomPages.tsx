// src/screens/CustomPages.tsx
// /me/custom-pages — the person's Custom Pages and the "create" form. Reached from the profile menu, and from the
// "Create your own custom page" link on any published page (which arrives with ?ref=<slug> so the new page can be
// attributed to the page that inspired it). Mirrors the web CustomPages page.
import { router, useLocalSearchParams, type Href } from "expo-router";
import { Eye, Globe, Inbox, LayoutTemplate, Lock, Plus } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";

import { useBottomNavInset } from "@/components/nav/BottomNav";
import { useChromeScroll } from "@/components/nav/ChromeProvider";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Icon, Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { checkCustomPageSlugAvailable, useCreateCustomPage, useMyCustomPages } from "@/hooks/useCustomPages";
import { customPageUrl, publicFileUrl, rememberReferrer, takeReferrer, type CustomPageSummary } from "@/lib/customPage";
import { friendlyError } from "@/lib/friendlyError";
import { isReservedProjectSlug, isValidProjectSlugFormat } from "@/lib/projectLinks";
import { useTheme } from "@/theme/ThemeProvider";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function statusOf(p: CustomPageSummary): { label: string; box: string; text: string } {
  if (!p.is_published) return { label: "Draft", box: "bg-ink-muted/15", text: "text-ink-muted" };
  if (p.visibility === "private") return { label: "Private", box: "bg-ink-muted/15", text: "text-ink-muted" };
  if (p.has_unpublished_changes) return { label: "Live · changes not published", box: "bg-pushback/20", text: "text-ink" };
  return { label: p.visibility === "unlisted" ? "Live · unlisted" : "Live", box: "bg-accent-soft", text: "text-accent" };
}

function PageRow({ page }: { page: CustomPageSummary }) {
  const s = statusOf(page);
  const icon = publicFileUrl(page.icon_path);
  return (
    <Pressable
      onPress={() => router.push(`/me/custom-pages/${page.id}` as Href)}
      accessibilityRole="button"
      accessibilityLabel={`${page.name}, ${s.label}`}
      className="flex-row items-center gap-3.5 rounded-2xl border border-border bg-surface p-3.5"
    >
      <View className="h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-accent-soft">
        {icon ? <Image source={{ uri: icon }} style={{ width: 48, height: 48 }} contentFit="cover" /> : <Icon as={LayoutTemplate} size={20} className="text-accent" />}
      </View>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="font-medium text-ink">
          {page.name}
        </Text>
        <Text numberOfLines={1} className="text-xs text-ink-muted">
          myako.site/{page.slug}
        </Text>
        <View className="mt-1.5 flex-row flex-wrap items-center gap-x-3 gap-y-1">
          <View className={`rounded-full px-2 py-0.5 ${s.box}`}>
            <Text className={`text-xs ${s.text}`}>{s.label}</Text>
          </View>
          {page.is_published ? (
            <View className="flex-row items-center gap-1">
              <Icon as={Eye} size={12} className="text-ink-muted" />
              <Text className="text-xs text-ink-muted">{page.views_30d}</Text>
            </View>
          ) : null}
          {page.new_inquiries > 0 ? (
            <View className="flex-row items-center gap-1">
              <Icon as={Inbox} size={12} className="text-accent" />
              <Text className="text-xs font-medium text-accent">{page.new_inquiries} new</Text>
            </View>
          ) : null}
          <Icon as={page.visibility === "private" ? Lock : Globe} size={12} className="text-ink-muted" />
        </View>
      </View>
    </Pressable>
  );
}

export function CustomPages() {
  const toast = useToast();
  const bottomInset = useBottomNavInset();
  const onScroll = useChromeScroll();
  const { ref } = useLocalSearchParams<{ ref?: string }>();
  const { data: pages, isLoading, isError, refetch } = useMyCustomPages();
  const [creating, setCreating] = useState(false);

  // Arrived from someone's "Create your own" link: remember who, then open the form straight away.
  useEffect(() => {
    if (ref) {
      rememberReferrer(ref);
      setCreating(true);
    }
  }, [ref]);

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader
        title="Custom pages"
        right={
          <Pressable onPress={() => setCreating(true)} accessibilityRole="button" accessibilityLabel="New custom page" className="flex-row items-center gap-1.5 rounded-full bg-accent px-4 py-2">
            <Icon as={Plus} size={16} className="text-canvas" />
            <Text className="text-sm font-medium text-canvas">New</Text>
          </Pressable>
        }
      />
      <ScrollView
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        ref={onScroll.listRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomInset }}
      >
        <Text className="mb-5 text-sm leading-5 text-ink-muted">
          A custom page is a small website that lives at its own link on Akọ, like <Text className="text-ink">myako.site/your-name</Text>. Use it for a product, a business, a
          brand, a shop, a brochure or a portfolio.
        </Text>

        {isLoading ? <Text className="text-sm text-ink-muted">Loading…</Text> : null}
        {isError ? (
          <View className="items-center py-10">
            <Text className="text-sm text-ink-muted">Couldn't load your pages.</Text>
            <Pressable onPress={() => void refetch()} accessibilityRole="button" hitSlop={8} className="mt-3 px-4 py-2">
              <Text className="text-sm font-medium text-accent">Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {pages && pages.length === 0 ? (
          <View className="items-center py-14">
            <Icon as={LayoutTemplate} size={36} className="mb-3 text-ink-muted" />
            <Text className="font-medium text-ink">No custom pages yet</Text>
            <Text className="mt-1 text-center text-sm text-ink-muted">Create one in a few minutes. No domain or code needed.</Text>
            <View className="mt-5 w-full max-w-xs">
              <Button onPress={() => setCreating(true)}>Create a custom page</Button>
            </View>
          </View>
        ) : null}

        <View className="gap-3">{pages?.map((p) => <PageRow key={p.id} page={p} />)}</View>
      </ScrollView>

      {creating ? (
        <CreateDialog
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            toast("Page created. Add your content next.", { variant: "success" });
            router.push(`/me/custom-pages/${id}/edit` as Href);
          }}
        />
      ) : null}
    </View>
  );
}

function CreateDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { colors } = useTheme();
  const create = useCreateCustomPage();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const effectiveSlug = slugTouched ? slug : slugify(name);

  const formatProblem = useMemo(() => {
    if (!effectiveSlug) return null;
    if (!isValidProjectSlugFormat(effectiveSlug)) return "Use 3–60 lowercase letters, numbers and single hyphens.";
    if (isReservedProjectSlug(effectiveSlug)) return "That link is reserved. Try another.";
    return null;
  }, [effectiveSlug]);

  // Debounced availability check once the format is valid.
  useEffect(() => {
    setAvailable(null);
    if (!effectiveSlug || formatProblem) return;
    let live = true;
    const t = setTimeout(() => {
      checkCustomPageSlugAvailable(effectiveSlug)
        .then((ok) => live && setAvailable(ok))
        .catch(() => live && setAvailable(null));
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [effectiveSlug, formatProblem]);

  const ok = name.trim().length > 0 && !formatProblem && effectiveSlug.length >= 3 && available !== false;

  async function submit() {
    if (!ok || create.isPending) return;
    setError(null);
    try {
      const row = await create.mutateAsync({ name: name.trim(), slug: effectiveSlug, refSlug: takeReferrer() });
      onCreated(row.id);
    } catch (err) {
      setError(friendlyError(err, "Couldn't create the page. Please try again."));
    }
  }

  return (
    <Modal onClose={onClose} title="New custom page" maxWidth={448}>
      <View className="gap-1.5">
        <Text className="text-xs text-overlay-ink-muted">Page name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          maxLength={80}
          placeholder="PromptIQ"
          placeholderTextColor={colors.inkMuted}
          autoFocus
          accessibilityLabel="Page name"
          className="w-full rounded-xl bg-overlay-surface-raised px-4 py-3 text-sm text-overlay-ink"
          style={{ fontFamily: "Inter_400Regular" }}
        />
        <Text className="mt-2 text-xs text-overlay-ink-muted">Page link</Text>
        <View className="flex-row items-center rounded-xl bg-overlay-surface-raised pl-4">
          <Text className="shrink-0 text-sm text-overlay-ink-muted">myako.site/</Text>
          <TextInput
            value={effectiveSlug}
            onChangeText={(v) => {
              setSlugTouched(true);
              setSlug(v.toLowerCase().replace(/\s+/g, "-"));
            }}
            maxLength={60}
            placeholder="promptiq"
            placeholderTextColor={colors.inkMuted}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Page link"
            className="min-w-0 flex-1 px-1 py-3 text-sm text-overlay-ink"
            style={{ fontFamily: "Inter_400Regular" }}
          />
        </View>
        <View className="min-h-[18px]">
          {formatProblem ? (
            <Text className="text-xs text-overlay-danger">{formatProblem}</Text>
          ) : available === false ? (
            <Text className="text-xs text-overlay-danger">That link is already taken.</Text>
          ) : available === true ? (
            <Text className="text-xs text-overlay-accent">{customPageUrl(effectiveSlug).replace("https://", "")} is available.</Text>
          ) : null}
        </View>
      </View>
      {error ? (
        <Text accessibilityRole="alert" className="mb-3 text-sm text-overlay-danger">
          {error}
        </Text>
      ) : null}
      <Button onPress={() => void submit()} loading={create.isPending} disabled={!ok}>
        Create page
      </Button>
    </Modal>
  );
}
