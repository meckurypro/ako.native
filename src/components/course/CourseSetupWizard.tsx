// src/components/course/CourseSetupWizard.tsx
// Three short steps for a new course: basics, goals, sections. Opened automatically for an empty draft, and from
// "Course details" later (without the sections step). A full-screen overlay drawn by the Course screen itself.
import { ArrowLeft, Plus, X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { KeyboardAvoider } from "@/components/ui/KeyboardAvoider";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useBackDismiss } from "@/hooks/useBackDismiss";
import { useAddModules, useSaveCourseDetails, type CourseDetails } from "@/hooks/useCourseBuilder";
import { COURSE_LEVELS, MAX_OBJECTIVES, MIN_OBJECTIVES, videoLinkProblem } from "@/lib/courseTypes";
import { removeCourseVideos } from "@/lib/courseVideo";
import { friendlyError } from "@/lib/friendlyError";
import { useTheme } from "@/theme/ThemeProvider";

import { LessonVideoField, type VideoValue } from "./LessonVideoField";

const inputClass = "w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-ink";
const inputStyle = { fontFamily: "Inter_400Regular" } as const;

function ListField({
  label,
  hint,
  values,
  onChange,
  placeholders,
  min = 1,
  max = 8,
}: {
  label: string;
  hint?: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholders: string[];
  min?: number;
  max?: number;
}) {
  const { colors } = useTheme();
  const rows = values.length >= min ? values : [...values, ...Array<string>(min - values.length).fill("")];
  return (
    <View className="mb-5">
      {label ? <Text className="text-sm font-semibold text-ink">{label}</Text> : null}
      {hint ? <Text className="mb-2 text-xs text-ink-muted">{hint}</Text> : null}
      <View className={`gap-2 ${hint ? "" : label ? "mt-2" : ""}`}>
        {rows.map((v, i) => (
          <View key={i} className="flex-row items-center gap-2">
            <TextInput
              value={v}
              onChangeText={(text) => onChange(rows.map((x, xi) => (xi === i ? text : x)))}
              placeholder={placeholders[i % placeholders.length]}
              placeholderTextColor={colors.inkMuted}
              maxLength={160}
              className={`min-w-0 flex-1 ${inputClass}`}
              style={inputStyle}
              accessibilityLabel={`${label || "Item"} ${i + 1}`}
            />
            {rows.length > min && (
              <Pressable onPress={() => onChange(rows.filter((_, xi) => xi !== i))} accessibilityRole="button" accessibilityLabel="Remove" hitSlop={8}>
                <Icon as={X} size={16} className="text-ink-muted" />
              </Pressable>
            )}
          </View>
        ))}
      </View>
      {rows.length < max && (
        <Pressable onPress={() => onChange([...rows, ""])} accessibilityRole="button" className="mt-2 flex-row items-center gap-1 self-start">
          <Icon as={Plus} size={12} className="text-accent" />
          <Text className="text-xs font-medium text-accent">Add another</Text>
        </Pressable>
      )}
    </View>
  );
}

export function CourseSetupWizard({
  projectId,
  details,
  nextSectionOrder,
  includeSections,
  onClose,
}: {
  projectId: string;
  details: CourseDetails | null | undefined;
  /** Position for the first new section: one past the highest existing position (not the section count). */
  nextSectionOrder: number;
  includeSections: boolean;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [promo, setPromo] = useState<VideoValue>({
    videoPath: details?.promo_video_path ?? null,
    videoWidth: details?.promo_width ?? null,
    videoHeight: details?.promo_height ?? null,
    videoDuration: details?.promo_duration ?? null,
    mediaUrl: details?.promo_url ?? "",
  });
  const [promoBusy, setPromoBusy] = useState(false);
  const savedPromoPath = details?.promo_video_path ?? null;
  // Closing without saving throws away a promo uploaded in this session.
  const close = (saved = false) => {
    if (!saved && promo.videoPath && promo.videoPath !== savedPromoPath) void removeCourseVideos([promo.videoPath]);
    onClose();
  };
  useBackDismiss(() => close());
  const toast = useToast();
  const saveDetails = useSaveCourseDetails(projectId);
  const addModules = useAddModules(projectId);

  const [step, setStep] = useState(0);
  const [subtitle, setSubtitle] = useState(details?.subtitle ?? "");
  const [level, setLevel] = useState<CourseDetails["level"]>(details?.level ?? "all");
  const [language, setLanguage] = useState(details?.language ?? "English");
  const [objectives, setObjectives] = useState<string[]>(details?.objectives ?? []);
  const [requirements, setRequirements] = useState<string[]>(details?.requirements ?? []);
  const [audience, setAudience] = useState<string[]>(details?.audience ?? []);
  const [sections, setSections] = useState<string[]>(["", ""]);
  const [saving, setSaving] = useState(false);

  const steps = includeSections ? ["Basics", "Goals", "Sections"] : ["Basics", "Goals"];
  const last = step === steps.length - 1;
  const objectiveCount = objectives.filter((o) => o.trim()).length;
  const promoLinkBad = !promo.videoPath && !!videoLinkProblem(promo.mediaUrl);
  const canNext = step === 1 ? objectiveCount >= MIN_OBJECTIVES : step === 0 ? !promoLinkBad : true;

  async function finish() {
    setSaving(true);
    try {
      await saveDetails.mutateAsync({
        subtitle,
        level,
        language,
        objectives,
        requirements,
        audience,
        promo_video_path: promo.videoPath,
        promo_url: promo.mediaUrl,
        promo_width: promo.videoWidth,
        promo_height: promo.videoHeight,
        promo_duration: promo.videoDuration,
        previousPromoPath: savedPromoPath,
      });
      if (includeSections) {
        const titles = sections.map((s) => s.trim()).filter(Boolean);
        // One insert for all of them: if it fails nothing was added, so a retry can't duplicate sections.
        await addModules.mutateAsync({ titles, startOrder: nextSectionOrder });
      }
      close(true);
    } catch (err) {
      toast(friendlyError(err, "Couldn't save."), { variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={StyleSheet.absoluteFill} className="z-[60] bg-canvas">
      <KeyboardAvoider className="flex-1" reservedBottom={insets.bottom}>
        <View className="flex-row items-center gap-3 px-4 pb-2" style={{ paddingTop: insets.top + 12 }}>
          <Pressable onPress={() => (step === 0 ? close() : setStep(step - 1))} accessibilityRole="button" accessibilityLabel={step === 0 ? "Close" : "Back"} hitSlop={10}>
            <Icon as={step === 0 ? X : ArrowLeft} size={22} className="text-ink-muted" />
          </Pressable>
          <View className="flex-1 flex-row gap-1.5">
            {steps.map((s, i) => (
              <View key={s} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-accent" : "bg-border"}`} />
            ))}
          </View>
          <Text className="text-xs font-medium text-ink-muted">
            {step + 1}/{steps.length}
          </Text>
        </View>

        <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text className="mb-4 font-display text-2xl text-ink">{steps[step]}</Text>

          {step === 0 && (
            <>
              <Text className="mb-1 text-sm font-semibold text-ink">Subtitle</Text>
              <TextInput
                value={subtitle}
                onChangeText={setSubtitle}
                maxLength={120}
                placeholder="One line on what this course gets people to"
                placeholderTextColor={colors.inkMuted}
                className={`mb-5 ${inputClass}`}
                style={inputStyle}
                accessibilityLabel="Subtitle"
              />
              <Text className="mb-1 text-sm font-semibold text-ink">Level</Text>
              <View className="mb-5 flex-row flex-wrap gap-2">
                {COURSE_LEVELS.map((l) => (
                  <Pressable
                    key={l.value}
                    onPress={() => setLevel(l.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: level === l.value }}
                    className={`rounded-full border px-3.5 py-1.5 ${level === l.value ? "border-cta bg-cta" : "border-border bg-surface"}`}
                  >
                    <Text className={`text-sm font-medium ${level === l.value ? "text-white" : "text-ink-muted"}`}>{l.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Text className="mb-1 text-sm font-semibold text-ink">Language</Text>
              <TextInput value={language} onChangeText={setLanguage} maxLength={40} className={`mb-5 ${inputClass}`} style={inputStyle} accessibilityLabel="Language" />
              <Text className="mb-0.5 text-sm font-semibold text-ink">Promo video</Text>
              <Text className="mb-2 text-xs text-ink-muted">Optional. Under 2 minutes: what they'll get, and why you.</Text>
              <LessonVideoField projectId={projectId} value={promo} savedPath={savedPromoPath} onChange={setPromo} onBusyChange={setPromoBusy} />
              {promo.videoDuration && promo.videoDuration > 180 ? <Text className="mt-1.5 text-xs text-ink-muted">Promos over 2–3 minutes lose viewers. Consider trimming it.</Text> : null}
            </>
          )}

          {step === 1 && (
            <>
              <ListField
                label="What will learners be able to do?"
                hint={`At least ${MIN_OBJECTIVES}, up to ${MAX_OBJECTIVES}. Start each with a verb.`}
                values={objectives}
                onChange={setObjectives}
                placeholders={["Build a landing page from scratch", "Price your work with confidence", "Present to a client without notes"]}
                min={MIN_OBJECTIVES}
                max={MAX_OBJECTIVES}
              />
              <ListField label="Anything they need first?" values={requirements} onChange={setRequirements} placeholders={["A laptop", "Basic Excel"]} min={1} max={6} />
              <ListField label="Who is it for?" values={audience} onChange={setAudience} placeholders={["Freelancers starting out", "Students"]} min={1} max={6} />
            </>
          )}

          {step === 2 && (
            <>
              <Text className="mb-3 text-sm text-ink-muted">Name your sections. You'll add lessons, videos and quizzes to each next.</Text>
              <ListField label="" values={sections} onChange={setSections} placeholders={["Getting started", "The core skills", "Putting it together"]} min={1} max={12} />
            </>
          )}
        </ScrollView>

        <View className="px-4 pt-2" style={{ paddingBottom: Math.max(20, insets.bottom + 8) }}>
          {step === 1 && !canNext ? <Text className="mb-2 text-center text-xs text-ink-muted">{MIN_OBJECTIVES - objectiveCount} more to go.</Text> : null}
          <Pressable
            onPress={() => (last ? void finish() : setStep(step + 1))}
            disabled={!canNext || saving || promoBusy}
            accessibilityRole="button"
            className={`h-12 w-full items-center justify-center rounded-2xl bg-cta ${!canNext || saving || promoBusy ? "opacity-40" : ""}`}
          >
            <Text className="text-[15px] font-semibold text-white">{saving ? "Saving…" : last ? (includeSections ? "Start building" : "Save") : "Next"}</Text>
          </Pressable>
          {step === 0 && (
            <Pressable onPress={() => setStep(1)} accessibilityRole="button" className="mt-2 items-center py-1">
              <Text className="text-sm text-ink-muted">Skip</Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoider>
    </View>
  );
}
