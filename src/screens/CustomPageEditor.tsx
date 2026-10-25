// src/screens/CustomPageEditor.tsx
// /me/custom-pages/:id/edit — the staged editor (native twin of the web editor). Work saves to the page's *draft*
// automatically (and when the app goes to the background); nothing reaches visitors until "Publish". Drafts are
// validated leniently, publishing strictly — see draftProblem / publishProblem in lib/customPage.
import { router, useLocalSearchParams, type Href } from "expo-router";
import { Eye, Plus, Trash2, X } from "lucide-react-native";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandColorFields } from "@/components/customPage/ColorPicker";
import { CustomPageRenderer } from "@/components/customPage/CustomPageRenderer";
import { Choice, Field, FilePicker, ImageList, Input, Section, SingleImage } from "@/components/customPage/EditorParts";
import { BackgroundEditor, ForegroundEditor, MenuEditor } from "@/components/customPage/MediaEditors";
import { DesignPresets } from "@/components/customPage/DesignPresets";
import { Button } from "@/components/ui/Button";
import { KeyboardAvoider } from "@/components/ui/KeyboardAvoider";
import { Portal } from "@/components/ui/Portal";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SelectField } from "@/components/ui/SelectField";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { Toggle } from "@/components/ui/Toggle";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/hooks/useAuth";
import { useBackDismiss } from "@/hooks/useBackDismiss";
import { useCustomPage, usePublishCustomPage, useSaveCustomPageDraft } from "@/hooks/useCustomPages";
import {
  ANIMATIONS,
  CTA_ACTIONS,
  DEFAULT_COLORS,
  LIMITS,
  SHARE_LOOKS,
  SHARE_POSITIONS,
  STYLES,
  TEMPLATES,
  ctaProblem,
  draftProblem,
  isHex,
  newCtaId,
  publishProblem,
  resolveDesign,
  resolveShare,
  type CtaAction,
  type CustomPageConfig,
  type CustomPageCta,
  type ShareLook,
  type SharePosition,
} from "@/lib/customPage";
import { friendlyError } from "@/lib/friendlyError";

const STAGES = [
  { id: "identity", label: "Identity" },
  { id: "brand", label: "Brand" },
  { id: "media", label: "Pictures" },
  { id: "content", label: "Content" },
  { id: "buttons", label: "Buttons" },
  { id: "menu", label: "Menu" },
  { id: "contact", label: "Contact" },
  { id: "design", label: "Design" },
] as const;
type StageId = (typeof STAGES)[number]["id"];

type SaveState = "saved" | "saving" | "dirty" | "error";

// The lib lists only the ids; the words the creator reads live here (same copy as the web editor).
const SHARE_LOOK_COPY: Record<ShareLook, { label: string; blurb: string }> = {
  auto: { label: "Match my style", blurb: "Takes the shape, borders and shadows of your page style." },
  minimal: { label: "Icon only", blurb: "Just the share icon. No background." },
  round: { label: "Round button", blurb: "The icon in a soft circle." },
  pill: { label: "With a label", blurb: "Icon and the word Share." },
};
const SHARE_POSITION_COPY: Record<SharePosition, { label: string; blurb: string }> = {
  "top-right": { label: "Top right", blurb: "Where most people look first for a share icon." },
  "top-left": { label: "Top left", blurb: "Top corner on the left." },
  "bottom-right": { label: "Bottom right", blurb: "Floats near the thumb and follows visitors as they scroll." },
  "bottom-left": { label: "Bottom left", blurb: "Floats bottom left and follows visitors as they scroll." },
  center: { label: "Centre", blurb: "Centred horizontally, in the clearest spot your template has." },
};

export function CustomPageEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { data: row, isLoading, isError } = useCustomPage(id);
  const save = useSaveCustomPageDraft();
  const publish = usePublishCustomPage();

  const [config, setConfig] = useState<CustomPageConfig | null>(null);
  const [stage, setStage] = useState<StageId>("identity");
  // While a picture is being dragged into place the form must not scroll under the finger.
  const [dragging, setDragging] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const latest = useRef<CustomPageConfig | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bodyScroll = useRef<ScrollView>(null);

  // Seed local state once from the server row; after that the editor is the source of truth.
  useEffect(() => {
    if (row && !config) {
      setConfig(row.draft ?? {});
      latest.current = row.draft ?? {};
    }
  }, [row, config]);

  // The preview re-renders a big tree; keep typing responsive by letting it trail the form.
  const deferredConfig = useDeferredValue(config);
  const problem = useMemo(() => (config ? draftProblem(config) : null), [config]);

  const flush = useCallback(async (): Promise<boolean> => {
    if (!id || !latest.current) return true;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const cfg = latest.current;
    const p = draftProblem(cfg);
    if (p) {
      setSaveState("error");
      setSaveError(p);
      return false;
    }
    setSaveState("saving");
    setSaveError(null);
    try {
      await save.mutateAsync({ id, config: cfg });
      // Edits made while that request was in flight are still pending — don't claim they're saved.
      setSaveState(latest.current === cfg ? "saved" : "dirty");
      return true;
    } catch (err) {
      setSaveState("error");
      setSaveError(friendlyError(err, "Couldn't save your changes."));
      return false;
    }
  }, [id, save]);

  const update = useCallback(
    (fn: (c: CustomPageConfig) => CustomPageConfig) => {
      setConfig((prev) => {
        const next = fn(prev ?? {});
        latest.current = next;
        return next;
      });
      setSaveState("dirty");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 1200);
    },
    [flush],
  );

  // Don't lose the last keystrokes when leaving or when the OS backgrounds the app.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        void flush();
      }
    },
    [flush],
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active" && timer.current) void flush();
    });
    return () => sub.remove();
  }, [flush]);

  function goStage(next: StageId) {
    setStage(next);
    bodyScroll.current?.scrollTo({ y: 0, animated: false });
  }

  async function leave() {
    await flush();
    router.replace(`/me/custom-pages/${id}` as Href);
  }

  async function doPublish() {
    if (!id) return;
    const blocker = config ? publishProblem(config) : null;
    if (blocker) {
      toast(blocker.message, { variant: "error", duration: 3500 });
      goStage(blocker.stage);
      return;
    }
    if (!(await flush())) return;
    try {
      await publish.mutateAsync(id);
      toast("Published. Your page is live.", { variant: "success" });
      router.replace(`/me/custom-pages/${id}` as Href);
    } catch (err) {
      toast(friendlyError(err, "Couldn't publish. Please try again."), { variant: "error", duration: 3500 });
    }
  }

  if (isLoading || (row && !config)) {
    return (
      <View className="flex-1 bg-canvas">
        <ScreenHeader title="Custom page" />
        <Text className="px-4 text-ink-muted">Loading…</Text>
      </View>
    );
  }
  if (isError || !row || !config || !user) {
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

  const ownerId = user.id;
  const pageId = row.id;
  const set = <K extends keyof CustomPageConfig>(key: K, patch: Partial<NonNullable<CustomPageConfig[K]>>) =>
    update((c) => ({ ...c, [key]: { ...(c[key] as object | undefined), ...patch } }));

  const design = resolveDesign(config);
  const share = resolveShare(config);
  const ctas = config.ctas ?? [];
  const setCtas = (next: CustomPageCta[]) => update((c) => ({ ...c, ctas: next }));
  const patchCta = (i: number, patch: Partial<CustomPageCta>) => setCtas(ctas.map((c, k) => (k === i ? { ...c, ...patch } : c)));

  const statusText = saveState === "saving" ? "Saving…" : saveState === "dirty" ? "Unsaved changes" : saveState === "error" ? "Not saved" : "Draft saved";

  return (
    <KeyboardAvoider className="flex-1 bg-canvas">
      <ScreenHeader
        title={config.identity?.name || row.name}
        bar
        onBack={() => void leave()}
        right={
          <View className="flex-row items-center gap-2">
            <Pressable onPress={() => setPreviewOpen(true)} accessibilityRole="button" accessibilityLabel="Preview page" className="flex-row items-center gap-1.5 rounded-full bg-accent-soft px-3.5 py-2">
              <Icon as={Eye} size={15} className="text-accent" />
              <Text className="text-sm font-medium text-accent">Preview</Text>
            </Pressable>
            <Pressable
              onPress={() => void doPublish()}
              disabled={publish.isPending || !!problem}
              accessibilityRole="button"
              accessibilityState={{ disabled: publish.isPending || !!problem, busy: publish.isPending }}
              className={`rounded-full bg-accent px-4 py-2 ${publish.isPending || problem ? "opacity-50" : ""}`}
            >
              <Text className="text-sm font-medium text-canvas">{publish.isPending ? "Publishing…" : row.is_published ? "Publish changes" : "Publish"}</Text>
            </Pressable>
          </View>
        }
      />
      <View className="border-b border-border bg-canvas px-4 pb-2">
        <Text accessibilityLiveRegion="polite" className={`mb-2 text-xs ${saveState === "error" ? "text-danger" : "text-ink-muted"}`}>
          {saveState === "error" && saveError ? saveError : statusText}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} keyboardShouldPersistTaps="handled">
          {STAGES.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => goStage(s.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: stage === s.id }}
              className={`rounded-full px-3.5 py-1.5 ${stage === s.id ? "bg-ink" : "border border-border bg-surface"}`}
            >
              <Text className={`text-sm font-medium ${stage === s.id ? "text-canvas" : "text-ink-muted"}`}>{s.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView ref={bodyScroll} scrollEnabled={!dragging} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 24, paddingBottom: insets.bottom + 48 }}>
        {stage === "identity" ? (
          <Section title="Page identity" intro="The name, tagline and message at the top of your page.">
            <Field label="Page name" count={(config.identity?.name ?? "").length} max={LIMITS.name}>
              <Input value={config.identity?.name ?? ""} maxLength={LIMITS.name + 20} onChangeText={(v) => set("identity", { name: v })} accessibilityLabel="Page name" />
            </Field>
            <Field label="Tagline" hint="Optional. One short line." count={(config.identity?.tagline ?? "").length} max={LIMITS.tagline}>
              <Input value={config.identity?.tagline ?? ""} onChangeText={(v) => set("identity", { tagline: v })} accessibilityLabel="Tagline" />
            </Field>
            <SingleImage label="Icon or logo" hint="Square works best." square path={config.identity?.icon_path} ownerId={ownerId} pageId={pageId} onChange={(p) => set("identity", { icon_path: p })} />
            <Field label="Page message" hint="A welcome note or short description." count={(config.identity?.intro ?? "").length} max={LIMITS.intro}>
              <Input rows={6} value={config.identity?.intro ?? ""} onChangeText={(v) => set("identity", { intro: v })} accessibilityLabel="Page message" />
            </Field>
            <Field label="Copyright line" hint="Optional. Shown in the footer." count={(config.identity?.copyright ?? "").length} max={LIMITS.copyright}>
              <Input value={config.identity?.copyright ?? ""} onChangeText={(v) => set("identity", { copyright: v })} accessibilityLabel="Copyright line" />
            </Field>
          </Section>
        ) : null}

        {stage === "brand" ? (
          <Section title="Brand" intro="Your colours and the images across the top of the page.">
            <BrandColorFields
              colors={{
                primary: isHex(config.brand?.primary) ? config.brand!.primary! : DEFAULT_COLORS.primary,
                secondary: isHex(config.brand?.secondary) ? config.brand!.secondary! : DEFAULT_COLORS.secondary,
                accent: isHex(config.brand?.accent) ? config.brand!.accent! : DEFAULT_COLORS.accent,
              }}
              onChange={(k, hex) => set("brand", { [k]: hex })}
            />
            <ImageList
              label="Hero images"
              hint="These slide across the top. The first one is what people see first."
              items={config.brand?.hero ?? []}
              max={LIMITS.hero}
              ownerId={ownerId}
              pageId={pageId}
              onChange={(hero) => set("brand", { hero })}
            />
          </Section>
        ) : null}

        {stage === "media" ? (
          <Section title="Pictures" intro="A background behind your page, and a picture laid over the top of it.">
            <BackgroundEditor
              config={config}
              ownerId={ownerId}
              pageId={pageId}
              onChange={(background) =>
                update((c) => {
                  const { background: _gone, ...brand } = c.brand ?? {};
                  void _gone;
                  return { ...c, brand: background ? { ...brand, background } : brand };
                })
              }
            />
            <View className="my-6 border-t border-border" />
            <ForegroundEditor
              config={config}
              ownerId={ownerId}
              pageId={pageId}
              onDragging={setDragging}
              onChange={(foreground) =>
                update((c) => {
                  const { foreground: _gone, ...rest } = c;
                  void _gone;
                  return foreground ? { ...rest, foreground } : rest;
                })
              }
            />
          </Section>
        ) : null}

        {stage === "menu" ? (
          <Section title="Menu" intro="Links that glide visitors to a part of your page.">
            <MenuEditor config={config} onChange={(nav) => update((c) => ({ ...c, nav }))} />
          </Section>
        ) : null}

        {stage === "content" ? (
          <Section title="Content" intro="A document and a gallery. Both are optional.">
            <FilePicker
              label="Document"
              hint="A brochure, programme or menu. Visitors can read it in their browser or download it."
              pdfOnly
              path={config.document?.path}
              fileName={config.document?.file_name}
              ownerId={ownerId}
              pageId={pageId}
              onChange={(f) =>
                update((c) => {
                  if (!f) {
                    const { document: _removed, ...rest } = c;
                    void _removed;
                    return rest;
                  }
                  return { ...c, document: { ...c.document, path: f.path, file_name: f.name, title: c.document?.title || f.name.replace(/\.[^.]+$/, "") } };
                })
              }
            />
            {config.document?.path ? (
              <Field label="Document title" count={(config.document?.title ?? "").length} max={LIMITS.docTitle}>
                <Input value={config.document?.title ?? ""} onChangeText={(v) => set("document", { title: v })} accessibilityLabel="Document title" />
              </Field>
            ) : null}
            <ImageList label="Gallery" captions items={config.gallery ?? []} max={LIMITS.gallery} ownerId={ownerId} pageId={pageId} onChange={(gallery) => update((c) => ({ ...c, gallery }))} />
          </Section>
        ) : null}

        {stage === "buttons" ? (
          <Section title="Buttons" intro={`Up to ${LIMITS.ctas} buttons. The first one is the main one.`}>
            <View className="gap-4">
              {ctas.map((cta, i) => {
                const p = ctaProblem(cta, config);
                return (
                  <View key={cta.id} className="rounded-2xl border border-border bg-surface p-4">
                    <View className="mb-3 flex-row items-center justify-between">
                      <Text className="text-sm font-medium text-ink">Button {i + 1}</Text>
                      <Pressable onPress={() => setCtas(ctas.filter((_, k) => k !== i))} accessibilityRole="button" accessibilityLabel={`Remove button ${i + 1}`} hitSlop={8} className="p-1.5">
                        <Icon as={Trash2} size={16} className="text-danger" />
                      </Pressable>
                    </View>
                    <Field label="Label" count={cta.label.length} max={LIMITS.ctaLabel}>
                      <Input value={cta.label} maxLength={LIMITS.ctaLabel + 10} onChangeText={(v) => patchCta(i, { label: v })} accessibilityLabel={`Button ${i + 1} label`} />
                    </Field>
                    <View className="mb-5">
                      <SelectField
                        label="What it does"
                        value={cta.action}
                        options={CTA_ACTIONS.map((a) => ({ value: a.value, label: a.label }))}
                        onChange={(v) => patchCta(i, { action: v as CtaAction, url: undefined, file_path: undefined, file_name: undefined })}
                      />
                      <Text className="mt-1.5 text-xs text-ink-muted">{CTA_ACTIONS.find((a) => a.value === cta.action)?.hint}</Text>
                    </View>
                    {cta.action === "url" || cta.action === "ako" ? (
                      <Field label={cta.action === "url" ? "Web address" : "Akọ link"}>
                        <Input
                          keyboardType="url"
                          autoCapitalize="none"
                          autoCorrect={false}
                          placeholder={cta.action === "url" ? "https://example.com" : "/your-project"}
                          value={cta.url ?? ""}
                          onChangeText={(v) => patchCta(i, { url: v.trim() })}
                          accessibilityLabel={cta.action === "url" ? "Web address" : "Akọ link"}
                        />
                      </Field>
                    ) : null}
                    {cta.action === "download" ? (
                      <FilePicker label="File to download" path={cta.file_path} fileName={cta.file_name} ownerId={ownerId} pageId={pageId} onChange={(f) => patchCta(i, { file_path: f?.path, file_name: f?.name })} />
                    ) : null}
                    {p ? <Text className="-mt-2 text-xs text-danger">{p}</Text> : null}
                  </View>
                );
              })}
            </View>
            {ctas.length < LIMITS.ctas ? (
              <Pressable
                onPress={() => setCtas([...ctas, { id: newCtaId(ctas), label: "", action: "url" }])}
                accessibilityRole="button"
                className="mt-4 flex-row items-center gap-2 self-start rounded-full bg-accent-soft px-4 py-2.5"
              >
                <Icon as={Plus} size={16} className="text-accent" />
                <Text className="text-sm font-medium text-accent">Add a button</Text>
              </Pressable>
            ) : null}
          </Section>
        ) : null}

        {stage === "contact" ? (
          <Section title="Contact and messages" intro="Everything here is optional.">
            <Field label="Email">
              <Input keyboardType="email-address" autoCapitalize="none" autoCorrect={false} value={config.contact?.email ?? ""} onChangeText={(v) => set("contact", { email: v.trim() })} accessibilityLabel="Email" />
            </Field>
            <Field label="Phone">
              <Input keyboardType="phone-pad" value={config.contact?.phone ?? ""} onChangeText={(v) => set("contact", { phone: v })} accessibilityLabel="Phone" />
            </Field>
            <Field label="Address" count={(config.contact?.address ?? "").length} max={LIMITS.address}>
              <Input rows={3} value={config.contact?.address ?? ""} onChangeText={(v) => set("contact", { address: v })} accessibilityLabel="Address" />
            </Field>
            <View className="flex-row items-start gap-3 rounded-2xl border border-border bg-surface p-4">
              <View className="min-w-0 flex-1">
                <Text className="text-sm font-medium text-ink">Let visitors send a message</Text>
                <Text className="mt-0.5 text-xs leading-4 text-ink-muted">Adds a form. Messages arrive in your page's inbox and you get a notification.</Text>
              </View>
              <Toggle checked={config.engagement?.inquiry !== false} onChange={(v) => set("engagement", { inquiry: v })} accessibilityLabel="Let visitors send a message" />
            </View>
          </Section>
        ) : null}

        {stage === "design" ? (
          <Section title="Design" intro="Pick a style, a layout and how sections appear.">
            <DesignPresets config={config} onChange={update} />
            <Field label="Style">
              <View className="gap-2.5">
                {STYLES.map((s) => (
                  <Choice key={s.id} active={design.style === s.id} title={s.label} blurb={s.blurb} onPress={() => set("design", { style: s.id })} />
                ))}
              </View>
            </Field>
            <Field label="Template">
              <View className="gap-2.5">
                {TEMPLATES.map((t) => (
                  <Choice key={t.id} active={design.template === t.id} title={t.label} blurb={t.blurb} onPress={() => set("design", { template: t.id })} />
                ))}
              </View>
            </Field>
            <Field label="Animation" hint="Applied to sections as they scroll into view. Turned off automatically for people who prefer reduced motion.">
              <View className="flex-row flex-wrap gap-2">
                {ANIMATIONS.map((a) => (
                  <Pressable
                    key={a.id}
                    onPress={() => set("design", { animation: a.id })}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: design.animation === a.id }}
                    className={`rounded-full px-4 py-2 ${design.animation === a.id ? "bg-ink" : "border border-border bg-surface"}`}
                  >
                    <Text className={`text-sm font-medium ${design.animation === a.id ? "text-canvas" : "text-ink-muted"}`}>{a.label}</Text>
                  </Pressable>
                ))}
              </View>
            </Field>
            <Field label="Share button" hint="A small button on your page that lets visitors send it on.">
              <View className="flex-row items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
                <Text className="text-sm font-medium text-ink">Show a share button</Text>
                <Toggle checked={share.enabled} onChange={(v) => set("share", { enabled: v })} accessibilityLabel="Show a share button" />
              </View>
              {share.enabled ? (
                <View className="mt-2.5 gap-2.5">
                  {SHARE_LOOKS.map((id) => (
                    <Choice key={id} active={share.look === id} title={SHARE_LOOK_COPY[id].label} blurb={SHARE_LOOK_COPY[id].blurb} onPress={() => set("share", { look: id })} />
                  ))}
                </View>
              ) : null}
              {share.enabled ? (
                <View className="mt-4">
                  <Text className="text-sm font-medium text-ink">Position</Text>
                  <Text className="mt-0.5 text-xs text-ink-muted">Your template places it neatly near that spot, clear of your title and logo.</Text>
                  <View className="mt-2.5 gap-2.5">
                    {SHARE_POSITIONS.map((id) => (
                      <Choice key={id} active={share.position === id} title={SHARE_POSITION_COPY[id].label} blurb={SHARE_POSITION_COPY[id].blurb} onPress={() => set("share", { position: id })} />
                    ))}
                  </View>
                </View>
              ) : null}
            </Field>
            <SingleImage
              label="Link preview image"
              hint="Shown when the link is shared on WhatsApp and other apps. Leave empty to use your first top image."
              path={config.seo?.share_image_path}
              ownerId={ownerId}
              pageId={pageId}
              onChange={(p) => set("seo", { share_image_path: p })}
            />
          </Section>
        ) : null}
        <View className="mt-2">
          <Button variant="secondary" onPress={() => void doPublish()} loading={publish.isPending}>
            {row.is_published ? "Publish changes" : "Publish"}
          </Button>
        </View>
      </ScrollView>

      {previewOpen ? <PreviewOverlay config={deferredConfig ?? config} slug={row.slug} onClose={() => setPreviewOpen(false)} /> : null}
    </KeyboardAvoider>
  );
}

/** Full-screen preview above the app chrome. Links are inert inside it (CustomPageRenderer preview mode). */
function PreviewOverlay({ config, slug, onClose }: { config: CustomPageConfig; slug: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  useBackDismiss(onClose);
  return (
    <Portal zIndex={56}>
      <View className="flex-1 bg-canvas">
        <View className="flex-row items-center justify-between bg-ink px-4 pb-3" style={{ paddingTop: insets.top + 10 }}>
          <Text className="flex-1 text-sm text-canvas">Preview — links are switched off here</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close preview" hitSlop={10} className="p-1">
            <Icon as={X} size={20} className="text-canvas" />
          </Pressable>
        </View>
        <View className="flex-1">
          <CustomPageRenderer config={config} preview slug={slug} safeTop={0} safeBottom={insets.bottom} />
        </View>
      </View>
    </Portal>
  );
}
