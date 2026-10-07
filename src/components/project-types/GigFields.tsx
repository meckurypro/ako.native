// src/components/project-types/GigFields.tsx
import { Check, Image as ImageIcon, Plus, X } from "lucide-react-native";
import { Pressable, TextInput, View } from "react-native";

import { FormField } from "@/components/ui/FormField";
import { SelectField } from "@/components/ui/SelectField";
import { Icon, Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useGigRolesByCategory, useEligibleGigSampleProjects } from "@/hooks/usePortfolio";
import type { GigFaqItem } from "@/hooks/useProjectTypeDetails";
import { PROJECT_TYPE_LABELS } from "@/hooks/useProjects";
import { useTheme } from "@/theme/ThemeProvider";

export interface GigFieldsValue {
  role_id: string;
  tagline: string;
  delivery_estimate: string;
  sample_project_ids: string[];
  revisions_included: string; // "" = unspecified, kept as text for the input
  deliverables: string[];
  faq: GigFaqItem[];
}

export const EMPTY_GIG_FIELDS: GigFieldsValue = {
  role_id: "",
  tagline: "",
  delivery_estimate: "",
  sample_project_ids: [],
  revisions_included: "",
  deliverables: [],
  faq: [],
};

export const MAX_GIG_SAMPLES = 6;

export function GigFields({ value, onChange, excludeProjectId }: { value: GigFieldsValue; onChange: (value: GigFieldsValue) => void; excludeProjectId?: string }) {
  const { colors } = useTheme();
  const { grouped: roleGroups } = useGigRolesByCategory();
  const { data: candidates } = useEligibleGigSampleProjects(excludeProjectId);

  // The role picker shows every role flat; the category is folded into the label so it stays readable.
  const roleOptions = [
    { value: "", label: "Select a role…" },
    ...[...roleGroups.entries()].flatMap(([category, roles]) => roles.map((role) => ({ value: role.id, label: `${category} · ${role.label}` }))),
  ];

  function toggleSample(id: string) {
    if (value.sample_project_ids.includes(id)) {
      onChange({ ...value, sample_project_ids: value.sample_project_ids.filter((s) => s !== id) });
    } else {
      if (value.sample_project_ids.length >= MAX_GIG_SAMPLES) return;
      onChange({ ...value, sample_project_ids: [...value.sample_project_ids, id] });
    }
  }

  const updateDeliverable = (index: number, text: string) => {
    const next = [...value.deliverables];
    next[index] = text;
    onChange({ ...value, deliverables: next });
  };
  const updateFaq = (index: number, field: keyof GigFaqItem, text: string) =>
    onChange({ ...value, faq: value.faq.map((item, i) => (i === index ? { ...item, [field]: text } : item)) });

  const box = "rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-ink";
  const common = { placeholderTextColor: colors.inkMuted, selectionColor: colors.accent, cursorColor: colors.accent };

  return (
    <View className="mb-4">
      <View className="mb-4">
        <SelectField label="Professional role" value={value.role_id} options={roleOptions} onChange={(role_id) => onChange({ ...value, role_id })} />
        <Text className="mt-1.5 text-xs text-ink-muted">
          What this gig represents professionally — it's how your work shows up as a tab on your profile (e.g. a Cinematographer gig surfaces under "Film").
        </Text>
      </View>

      <FormField label="Tagline" value={value.tagline} onChangeText={(tagline) => onChange({ ...value, tagline })} placeholder="e.g. Voice-over & audio production" maxLength={100} />

      <FormField
        label="Delivery estimate (optional)"
        value={value.delivery_estimate}
        onChangeText={(delivery_estimate) => onChange({ ...value, delivery_estimate })}
        placeholder="e.g. 3–5 business days"
        maxLength={60}
      />
      <FormField label="Revisions" value={value.revisions_included} onChangeText={(revisions_included) => onChange({ ...value, revisions_included })} placeholder="e.g. 2" keyboardType="number-pad" />

      <View className="mb-4">
        <Text className="mb-1.5 text-sm font-medium text-ink-muted">
          What's included <Text className="font-normal">(optional)</Text>
        </Text>
        <View className="gap-2">
          {value.deliverables.map((item, i) => (
            <View key={i} className="flex-row items-center gap-2">
              <TextInput
                value={item}
                onChangeText={(t) => updateDeliverable(i, t)}
                placeholder="e.g. 2 revisions, source files included"
                maxLength={120}
                className={`flex-1 ${box}`}
                style={{ fontFamily: "Inter_400Regular" }}
                {...common}
              />
              <Pressable onPress={() => onChange({ ...value, deliverables: value.deliverables.filter((_, idx) => idx !== i) })} accessibilityRole="button" accessibilityLabel="Remove item" hitSlop={8}>
                <Icon as={X} size={15} className="text-ink-muted" />
              </Pressable>
            </View>
          ))}
        </View>
        <Pressable onPress={() => onChange({ ...value, deliverables: [...value.deliverables, ""] })} accessibilityRole="button" className="mt-2 flex-row items-center gap-1 self-start">
          <Icon as={Plus} size={12} className="text-accent" />
          <Text className="text-xs font-medium text-accent">Add item</Text>
        </Pressable>
      </View>

      <View className="mb-4">
        <Text className="mb-1.5 text-sm font-medium text-ink-muted">
          FAQ <Text className="font-normal">(optional — head off the questions before they're asked)</Text>
        </Text>
        <View className="gap-2">
          {value.faq.map((item, i) => (
            <View key={i} className="gap-1.5 rounded-lg border border-border bg-canvas p-2.5">
              <View className="flex-row items-center gap-2">
                <TextInput
                  value={item.question}
                  onChangeText={(t) => updateFaq(i, "question", t)}
                  placeholder="Question"
                  maxLength={120}
                  className="flex-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-ink"
                  style={{ fontFamily: "Inter_400Regular" }}
                  {...common}
                />
                <Pressable onPress={() => onChange({ ...value, faq: value.faq.filter((_, idx) => idx !== i) })} accessibilityRole="button" accessibilityLabel="Remove question" hitSlop={8}>
                  <Icon as={X} size={15} className="text-ink-muted" />
                </Pressable>
              </View>
              <TextInput
                value={item.answer}
                onChangeText={(t) => updateFaq(i, "answer", t)}
                placeholder="Answer"
                multiline
                maxLength={400}
                textAlignVertical="top"
                className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-ink"
                style={{ fontFamily: "Inter_400Regular", minHeight: 56 }}
                {...common}
              />
            </View>
          ))}
        </View>
        <Pressable onPress={() => onChange({ ...value, faq: [...value.faq, { question: "", answer: "" }] })} accessibilityRole="button" className="mt-2 flex-row items-center gap-1 self-start">
          <Icon as={Plus} size={12} className="text-accent" />
          <Text className="text-xs font-medium text-accent">Add question</Text>
        </Pressable>
      </View>

      <View>
        <Text className="mb-1.5 text-sm font-medium text-ink-muted">
          Work samples <Text className="font-normal">(optional, up to {MAX_GIG_SAMPLES})</Text>
        </Text>
        {!candidates || candidates.length === 0 ? (
          <Text className="rounded-xl border border-border bg-surface px-4 py-3 text-xs text-ink-muted">
            You don't have any other projects yet to show as samples — your own work, or anything you've been credited on and accepted. You can add these later from Edit.
          </Text>
        ) : (
          <View className="gap-2">
            {candidates.map((p) => {
              const selected = value.sample_project_ids.includes(p.id);
              const atCap = !selected && value.sample_project_ids.length >= MAX_GIG_SAMPLES;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => toggleSample(p.id)}
                  disabled={atCap}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected, disabled: atCap }}
                  className={`w-full flex-row items-center gap-3 rounded-xl border px-3 py-2 ${selected ? "border-accent bg-accent-soft" : "border-border bg-canvas"} ${atCap ? "opacity-40" : ""}`}
                >
                  <View className="h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface">
                    {p.thumbnail_url ? (
                      <Image source={{ uri: p.thumbnail_url }} contentFit="cover" style={{ width: "100%", height: "100%" }} />
                    ) : (
                      <Icon as={ImageIcon} size={16} className="text-ink-muted" />
                    )}
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text numberOfLines={1} className="text-sm text-ink">
                      {p.title}
                    </Text>
                    <Text className="text-xs text-ink-muted">{PROJECT_TYPE_LABELS[p.project_type]}</Text>
                  </View>
                  {selected ? <Icon as={Check} size={16} className="shrink-0 text-accent" /> : null}
                </Pressable>
              );
            })}
          </View>
        )}
        <Text className="mt-1.5 text-xs text-ink-muted">Pick from your own projects to show as proof of work on this gig.</Text>
      </View>
    </View>
  );
}
