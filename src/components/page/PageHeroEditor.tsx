// src/components/page/PageHeroEditor.tsx
// Where a page admin (or a member allowed to edit the page) builds the hero slideshow: add images, give each
// a title and caption, reorder, remove, and choose how it plays. Every change saves on its own — there's no
// separate "save hero" step to forget. The first image sets the shape (9:16, 1:1, 16:9, …); every later one is cropped to match.
import { ArrowDown, ArrowUp, ImagePlus, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { Icon, Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { Toggle } from "@/components/ui/Toggle";
import { useToast } from "@/components/ui/Toast";
import { useUploadAvatar } from "@/hooks/useUploadAvatar";
import {
  HERO_INTERVAL_OPTIONS,
  MAX_HERO_SLIDES,
  clampHeroAspect,
  loadHeroAspect,
  useAddHeroSlide,
  useDeleteHeroSlide,
  usePageHeroSlides,
  useReorderHeroSlides,
  useUpdateHeroSettings,
  useHeroAspect,
  useUpdateHeroSlide,
} from "@/hooks/usePageLanding";
import { cropToAspect } from "@/lib/cropImage";
import { getImageSize } from "@/lib/localFile";
import { pickImages } from "@/lib/pickImage";
import { useTheme } from "@/theme/ThemeProvider";
import type { HeroDirection, Page, PageHeroSlide } from "@/types/database";
import { friendlyError } from "@/lib/friendlyError";

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`flex-1 items-center rounded-xl py-2 ${selected ? "bg-cta" : "bg-surface"}`}
    >
      <Text className={`text-sm font-medium ${selected ? "text-white" : "text-ink"}`}>{label}</Text>
    </Pressable>
  );
}

function SlideRow({
  slide,
  pageId,
  index,
  total,
  busy,
  aspect,
  onMove,
  onDelete,
}: {
  aspect: number;
  slide: PageHeroSlide;
  pageId: string;
  index: number;
  total: number;
  busy: boolean;
  onMove: (delta: -1 | 1) => void;
  onDelete: () => void;
}) {
  const toast = useToast();
  const { colors } = useTheme();
  const update = useUpdateHeroSlide(pageId);
  const [title, setTitle] = useState(slide.title ?? "");
  const [caption, setCaption] = useState(slide.caption ?? "");

  function saveIfChanged() {
    if (title.trim() === (slide.title ?? "") && caption.trim() === (slide.caption ?? "")) return;
    update.mutate({ id: slide.id, title, caption }, { onError: () => toast("Couldn't save that text.", { variant: "error" }) });
  }

  return (
    <View className="rounded-2xl bg-canvas p-3">
      <View className="self-center overflow-hidden rounded-xl bg-surface" style={{ aspectRatio: aspect, width: aspect < 1 ? `${Math.round(aspect * 100 * 1.4)}%` : "100%", maxWidth: "100%" }}>
        <Image source={{ uri: slide.image_url }} contentFit="cover" style={{ width: "100%", height: "100%" }} />
        <View className="absolute left-2 top-2 rounded-full px-2 py-0.5" style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
          <Text className="text-[11px] font-medium text-white">{index + 1}</Text>
        </View>
      </View>
      <View className="mt-3 gap-2">
        <TextInput
          value={title}
          onChangeText={setTitle}
          onBlur={saveIfChanged}
          maxLength={80}
          placeholder="Title (optional)"
          placeholderTextColor={colors.inkMuted}
          accessibilityLabel={`Slide ${index + 1} title`}
          className="rounded-xl bg-surface px-3.5 py-2.5 text-sm text-ink"
        />
        <TextInput
          value={caption}
          onChangeText={setCaption}
          onBlur={saveIfChanged}
          maxLength={160}
          placeholder="Caption (optional)"
          placeholderTextColor={colors.inkMuted}
          accessibilityLabel={`Slide ${index + 1} caption`}
          className="rounded-xl bg-surface px-3.5 py-2.5 text-sm text-ink"
        />
      </View>
      <View className="mt-2 flex-row items-center justify-between">
        <View className="flex-row items-center gap-1">
          <Pressable
            onPress={() => onMove(-1)}
            disabled={index === 0 || busy}
            accessibilityRole="button"
            accessibilityLabel="Move slide earlier"
            hitSlop={6}
            className={`h-9 w-9 items-center justify-center rounded-full ${index === 0 || busy ? "opacity-30" : ""}`}
          >
            <Icon as={ArrowUp} size={18} className="text-ink-muted" />
          </Pressable>
          <Pressable
            onPress={() => onMove(1)}
            disabled={index === total - 1 || busy}
            accessibilityRole="button"
            accessibilityLabel="Move slide later"
            hitSlop={6}
            className={`h-9 w-9 items-center justify-center rounded-full ${index === total - 1 || busy ? "opacity-30" : ""}`}
          >
            <Icon as={ArrowDown} size={18} className="text-ink-muted" />
          </Pressable>
        </View>
        <Pressable onPress={onDelete} disabled={busy} accessibilityRole="button" accessibilityLabel="Remove slide" className={`flex-row items-center gap-1.5 rounded-full px-3 py-2 ${busy ? "opacity-40" : ""}`}>
          <Icon as={Trash2} size={15} className="text-danger" />
          <Text className="text-xs font-medium text-danger">Remove</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function PageHeroEditor({ page }: { page: Page }) {
  const toast = useToast();
  const { data: slides = [] } = usePageHeroSlides(page.id);
  const addSlide = useAddHeroSlide(page.id);
  const deleteSlide = useDeleteHeroSlide(page.id);
  const reorder = useReorderHeroSlides(page.id);
  const updateSettings = useUpdateHeroSettings(page.id);
  const upload = useUploadAvatar();
  const [uploading, setUploading] = useState(false);
  const aspect = useHeroAspect(slides);

  const autoplay = page.hero_autoplay ?? true;
  const interval = page.hero_interval_seconds ?? 5;
  const direction: HeroDirection = page.hero_direction ?? "forward";
  const full = slides.length >= MAX_HERO_SLIDES;
  const busy = deleteSlide.isPending || reorder.isPending;

  async function addImages() {
    const picked = await pickImages({ limit: MAX_HERO_SLIDES - slides.length });
    if (picked.length === 0) return;
    setUploading(true);
    let position = slides.length ? Math.max(...slides.map((s) => s.position)) + 1 : 0;
    try {
      // The first image on the page sets the aspect ratio; once there are slides, everything matches them.
      const firstSlide = [...slides].sort((a, b) => a.position - b.position)[0];
      let target: number;
      if (firstSlide) {
        target = await loadHeroAspect(firstSlide.image_url);
      } else {
        const size = await getImageSize(picked[0]).catch(() => {
          throw new Error("That image couldn't be read. Try a JPEG, PNG or WebP.");
        });
        target = clampHeroAspect(size.width / size.height);
      }
      for (const file of picked) {
        const cropped = await cropToAspect(file, target, { maxWidth: target < 1 ? 1200 : 1600 });
        const image_url = await upload.mutateAsync(cropped);
        await addSlide.mutateAsync({ image_url, position: position++ });
      }
    } catch (err) {
      toast(friendlyError(err, "Couldn't add that image."), { variant: "error" });
    } finally {
      setUploading(false);
    }
  }

  function move(index: number, delta: -1 | 1) {
    const ids = slides.map((s) => s.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + delta, 0, moved);
    reorder.mutate(ids, { onError: () => toast("Couldn't reorder.", { variant: "error" }) });
  }

  function saveSetting(patch: Parameters<typeof updateSettings.mutate>[0]) {
    updateSettings.mutate(patch, { onError: () => toast("Couldn't save that setting.", { variant: "error" }) });
  }

  return (
    <View className="gap-4">
      <View>
        <Text accessibilityRole="header" className="text-sm font-semibold text-ink">
          Hero slides
        </Text>
        <Text className="mt-0.5 text-xs text-ink-muted">
          A slideshow visitors see first. The first image you add sets the shape (tall, square, wide…); the rest are cropped to match. Up to {MAX_HERO_SLIDES}.
        </Text>
      </View>

      {slides.length > 0 ? (
        <View className="gap-3">
          {slides.map((slide, i) => (
            <SlideRow
              key={slide.id}
              slide={slide}
              pageId={page.id}
              index={i}
              total={slides.length}
              busy={busy}
              aspect={aspect}
              onMove={(d) => move(i, d)}
              onDelete={() => deleteSlide.mutate(slide.id, { onError: () => toast("Couldn't remove that slide.", { variant: "error" }) })}
            />
          ))}
        </View>
      ) : null}

      <Pressable
        onPress={() => void addImages()}
        disabled={uploading || full}
        accessibilityRole="button"
        className={`flex-row items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-canvas py-5 ${uploading || full ? "opacity-50" : ""}`}
      >
        <Icon as={ImagePlus} size={18} className="text-accent" />
        <Text className="text-sm font-medium text-accent">{uploading ? "Adding…" : full ? "Slide limit reached" : slides.length ? "Add more images" : "Add images"}</Text>
      </Pressable>

      {slides.length > 1 ? (
        <View className="gap-3 rounded-2xl bg-canvas p-4">
          <View className="flex-row items-center justify-between gap-4">
            <View className="flex-1">
              <Text className="text-sm text-ink">Play automatically</Text>
              <Text className="text-xs text-ink-muted">Visitors can always swipe or tap through.</Text>
            </View>
            <Toggle checked={autoplay} onChange={(v) => saveSetting({ hero_autoplay: v })} accessibilityLabel="Play slides automatically" />
          </View>

          {autoplay ? (
            <>
              <View>
                <Text className="mb-1.5 text-xs font-medium text-ink-muted">Time on each slide</Text>
                <View className="flex-row gap-2">
                  {HERO_INTERVAL_OPTIONS.map((s) => (
                    <Choice key={s} label={`${s}s`} selected={interval === s} onPress={() => saveSetting({ hero_interval_seconds: s })} />
                  ))}
                </View>
              </View>
              <View>
                <Text className="mb-1.5 text-xs font-medium text-ink-muted">Direction</Text>
                <View className="flex-row gap-2">
                  <Choice label="Forward" selected={direction === "forward"} onPress={() => saveSetting({ hero_direction: "forward" })} />
                  <Choice label="Backward" selected={direction === "backward"} onPress={() => saveSetting({ hero_direction: "backward" })} />
                </View>
                <Text className="mt-1.5 text-xs text-ink-muted">
                  {direction === "forward" ? "Moves on to the next slide each time." : "Steps back to the previous slide each time."}
                </Text>
              </View>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
