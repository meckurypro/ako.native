// src/components/project/ProjectFormParts.tsx
// The building blocks the New project and Edit project screens share, so both read like the Settings screens:
// a rounded card per topic with an icon header (FormSection), a chip row for the project type, one thumbnail picker,
// one pricing block, and tappable link rows with a chevron. Nothing here owns form state — the screens do.
import {
  BookOpen,
  Briefcase,
  CalendarDays,
  ChevronRight,
  DoorOpen,
  FileText,
  GraduationCap,
  Image as ImageIcon,
  Lightbulb,
  Link2,
  Music,
  Video,
  type LucideIcon,
} from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { BOOK_COVER_HINT } from "@/lib/bookCover";
import { SupportingImagesField } from "@/components/project/SupportingImagesField";
import { Checkbox } from "@/components/ui/Checkbox";
import { FormField } from "@/components/ui/FormField";
import { Icon, Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { PROJECT_TYPE_LABELS, type ProjectType } from "@/hooks/useProjects";

export const PROJECT_TYPE_ICONS: Record<ProjectType, LucideIcon> = {
  file: FileText,
  url: Link2,
  media: Music,
  event: CalendarDays,
  meeting: Video,
  room: DoorOpen,
  course: GraduationCap,
  gig: Briefcase,
  pitch: Lightbulb,
  book: BookOpen,
};

/** One topic of the form in its own rounded card — the same look as a Settings section, but always open. */
export function FormSection({
  icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <View className="overflow-hidden rounded-3xl border border-border bg-surface">
      <View className="flex-row items-center gap-3.5 p-3.5">
        <View className="h-10 w-10 shrink-0 items-center justify-center rounded-full bg-border-a40">
          <Icon as={icon} size={18} className="text-ink-muted" />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-[15px] font-semibold text-ink">{title}</Text>
          {description ? (
            <Text numberOfLines={2} className="mt-0.5 text-xs text-ink-muted">
              {description}
            </Text>
          ) : null}
        </View>
      </View>
      <View className="border-t border-border px-4 pb-1 pt-4">{children}</View>
    </View>
  );
}

/** Pick the project type as chips (it decides which fields appear below). */
export function ProjectTypeChips({
  options,
  value,
  onChange,
}: {
  options: ProjectType[];
  value: ProjectType;
  onChange: (type: ProjectType) => void;
}) {
  return (
    <View className="mb-3 flex-row flex-wrap gap-2">
      {options.map((type) => {
        const selected = type === value;
        return (
          <Pressable
            key={type}
            onPress={() => onChange(type)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            className={`flex-row items-center gap-1.5 rounded-full border px-3.5 py-2 ${selected ? "border-accent-a40 bg-accent-soft" : "border-border bg-canvas"}`}
          >
            <Icon as={PROJECT_TYPE_ICONS[type]} size={15} className={selected ? "text-accent" : "text-ink-muted"} />
            <Text className={`text-sm ${selected ? "font-semibold text-accent" : "text-ink-muted"}`}>{PROJECT_TYPE_LABELS[type]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The cover frame (takes the uploaded image's own aspect ratio) plus the supporting-images strip. */
export function ThumbnailPicker({
  url,
  aspect,
  isBook,
  uploading,
  onPress,
  supportingImageUrls,
  onSupportingChange,
}: {
  url: string | null;
  aspect: number;
  isBook: boolean;
  uploading: boolean;
  onPress: () => void;
  supportingImageUrls: string[];
  onSupportingChange: (urls: string[]) => void;
}) {
  return (
    <>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={url ? "Change thumbnail" : "Choose thumbnail"}
        className={`items-center justify-center overflow-hidden rounded-2xl border border-border bg-canvas ${isBook ? "mb-2 w-48 self-center" : "mb-3 w-full"}`}
        style={{ aspectRatio: aspect }}
      >
        {url ? (
          <Image source={{ uri: url }} contentFit="cover" style={{ width: "100%", height: "100%" }} />
        ) : (
          <View className="items-center gap-1.5">
            <View className="h-11 w-11 items-center justify-center rounded-full bg-border-a40">
              <Icon as={ImageIcon} size={20} className="text-ink-muted" />
            </View>
            <Text className="text-sm text-ink-muted">{uploading ? "Uploading…" : isBook ? "Add cover (2:3)" : "Add thumbnail"}</Text>
          </View>
        )}
      </Pressable>
      {isBook ? <Text className="mb-3 text-center text-xs text-ink-muted">{BOOK_COVER_HINT}</Text> : null}
      <SupportingImagesField urls={supportingImageUrls} onChange={onSupportingChange} hasThumbnail={!!url} />
    </>
  );
}

/** Price + optional promo price. A pitch never has one (supporters choose their own amount) — callers skip it. */
export function PricingFields({
  type,
  priceUsd,
  onPriceChange,
  showPromo,
  onShowPromoChange,
  promoPriceUsd,
  onPromoPriceChange,
  bookNotOwn,
}: {
  type: ProjectType;
  priceUsd: string;
  onPriceChange: (value: string) => void;
  showPromo: boolean;
  onShowPromoChange: (value: boolean) => void;
  promoPriceUsd: string;
  onPromoPriceChange: (value: string) => void;
  bookNotOwn: boolean;
}) {
  return (
    <>
      <FormField
        label={type === "gig" ? "Booking fee (USD, optional)" : "Price (USD)"}
        value={priceUsd}
        onChangeText={onPriceChange}
        keyboardType="decimal-pad"
        editable={!bookNotOwn}
      />
      <Text className="-mt-4 mb-4 text-xs text-ink-muted">
        {type === "gig"
          ? "Set to 0 to keep this message-only — people reach out, no payment upfront. Add an amount to also let people pay a booking fee to secure a slot."
          : bookNotOwn
            ? "Crediting someone else's work — this has to stay free."
            : "Set to 0 for a free project."}
      </Text>

      {!bookNotOwn ? (
        <View className="mb-4">
          <Checkbox
            checked={showPromo}
            onChange={(v) => {
              onShowPromoChange(v);
              if (!v) onPromoPriceChange("");
            }}
            label="Add a promo price"
          />
          {showPromo ? (
            <View className="mt-4">
              <FormField label="Promo price" value={promoPriceUsd} onChangeText={onPromoPriceChange} keyboardType="decimal-pad" placeholder="Promo price" />
              <Text className="-mt-4 mb-2 text-xs text-ink-muted">
                Shown next to the actual price, which will appear crossed out. Must be lower than the actual price.
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </>
  );
}

/** A tappable row with an icon, a title, a one-line hint and a chevron — for the links out of the edit form. */
export function LinkRow({
  icon,
  title,
  description,
  onPress,
  disabled = false,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      className={`mb-3 flex-row items-center gap-3 rounded-xl bg-canvas p-4 active:bg-border-a40 ${disabled ? "opacity-60" : ""}`}
    >
      <Icon as={icon} size={18} className="text-ink-muted" />
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-medium text-ink">{title}</Text>
        {description ? <Text className="text-xs text-ink-muted">{description}</Text> : null}
      </View>
      {disabled ? null : <Icon as={ChevronRight} size={18} className="text-ink-muted" />}
    </Pressable>
  );
}

/** The pinned bar at the bottom of the form: any error, then the primary action. */
export function FormFooter({ error, children, bottomInset }: { error?: string | null; children: ReactNode; bottomInset: number }) {
  return (
    <View className="border-t border-border bg-canvas px-4 pt-3" style={{ paddingBottom: bottomInset + 12 }}>
      <View className="w-full max-w-md self-center">
        {error ? (
          <Text accessibilityRole="alert" className="mb-3 text-sm text-danger">
            {error}
          </Text>
        ) : null}
        {children}
      </View>
    </View>
  );
}
