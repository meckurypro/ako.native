// src/components/profile/ReportModal.tsx
// "Report a post/project" for a profile: pick the kind → pick the item → pick a
// reason (+ optional details) → submit.
import { ChevronLeft, Flag } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from "react-native";

import { Modal } from "@/components/ui/Modal";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useUserPostsWithArchived } from "@/hooks/usePosts";
import { useUserProjects } from "@/hooks/useProjects";
import { useReportReasons, useSubmitReport } from "@/hooks/useReports";

type TargetKind = "post" | "project";
interface ReportTarget {
  kind: TargetKind;
  id: string;
  label: string;
}

function TargetList({ isLoading, emptyLabel, items, onPick }: { isLoading: boolean; emptyLabel: string; items: ReportTarget[]; onPick: (t: ReportTarget) => void }) {
  if (isLoading) return <Text className="py-6 text-center text-sm text-overlay-ink-muted">Loading…</Text>;
  if (items.length === 0) return <Text className="py-6 text-center text-sm text-overlay-ink-muted">{emptyLabel}</Text>;
  return (
    <ScrollView style={{ maxHeight: 288 }} nestedScrollEnabled>
      <View className="gap-1.5">
        {items.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => onPick(item)}
            accessibilityRole="button"
            className="rounded-xl border border-overlay-border bg-overlay-surface-raised px-3.5 py-2.5 active:opacity-80"
          >
            <Text numberOfLines={2} className="text-sm text-overlay-ink">
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

export function ReportModal({ profileId, onClose }: { profileId: string; onClose: () => void }) {
  const [step, setStep] = useState<"kind" | "target" | "reason">("kind");
  const [kind, setKind] = useState<TargetKind | null>(null);
  const [target, setTarget] = useState<ReportTarget | null>(null);
  const [reasonId, setReasonId] = useState<string | null>(null);
  const [details, setDetails] = useState("");

  const toast = useToast();
  const { data: posts, isLoading: postsLoading } = useUserPostsWithArchived(profileId, false);
  const { data: projects, isLoading: projectsLoading } = useUserProjects(profileId, false);
  const { data: reasons, isLoading: reasonsLoading } = useReportReasons();
  const submitReport = useSubmitReport();

  async function handleSubmit() {
    if (!target || !reasonId) return;
    try {
      await submitReport.mutateAsync({ targetType: target.kind, targetId: target.id, reasonId, details });
      toast("Report submitted. Thanks for flagging this.", { variant: "success" });
      onClose();
    } catch {
      toast("Couldn't submit your report. Try again.", { variant: "error" });
    }
  }

  return (
    <Modal onClose={onClose} ariaLabel="Report content" maxWidth={448}>
      <View className="mb-4 flex-row items-center gap-2">
        {step !== "kind" ? (
          <Pressable onPress={() => setStep(step === "reason" ? "target" : "kind")} accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} className="-ml-1 p-1">
            <Icon as={ChevronLeft} size={20} className="text-overlay-ink-muted" />
          </Pressable>
        ) : null}
        <Icon as={Flag} size={18} className="text-overlay-danger" />
        <Text className="font-display text-lg text-overlay-ink">Report</Text>
      </View>

      {step === "kind" ? (
        <View className="gap-2">
          <Text className="mb-1 text-sm text-overlay-ink-muted">What are you reporting?</Text>
          {(["post", "project"] as TargetKind[]).map((k) => (
            <Pressable
              key={k}
              onPress={() => {
                setKind(k);
                setStep("target");
              }}
              accessibilityRole="button"
              className="rounded-xl border border-overlay-border bg-overlay-surface-raised px-4 py-3 active:opacity-80"
            >
              <Text className="text-overlay-ink">{k === "post" ? "A post" : "A project"}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {step === "target" && kind === "post" ? (
        <TargetList
          isLoading={postsLoading}
          emptyLabel="No posts to report."
          items={(posts ?? []).map((p) => ({ kind: "post" as const, id: p.id, label: p.heading?.trim() || p.content.slice(0, 80) || "Untitled post" }))}
          onPick={(t) => {
            setTarget(t);
            setStep("reason");
          }}
        />
      ) : null}

      {step === "target" && kind === "project" ? (
        <TargetList
          isLoading={projectsLoading}
          emptyLabel="No projects to report."
          items={(projects ?? []).map((p) => ({ kind: "project" as const, id: p.id, label: p.title }))}
          onPick={(t) => {
            setTarget(t);
            setStep("reason");
          }}
        />
      ) : null}

      {step === "reason" && target ? (
        <View>
          <Text numberOfLines={1} className="mb-3 text-sm text-overlay-ink-muted">
            Reporting: {target.label}
          </Text>
          {reasonsLoading ? <Text className="py-4 text-center text-sm text-overlay-ink-muted">Loading reasons…</Text> : null}

          <View className="mb-3 gap-1.5">
            {reasons?.map((r) => (
              <Pressable
                key={r.id}
                onPress={() => setReasonId(r.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: reasonId === r.id }}
                className={`rounded-xl border px-3.5 py-2.5 ${reasonId === r.id ? "border-overlay-accent bg-overlay-accent-soft" : "border-overlay-border bg-overlay-surface-raised"}`}
              >
                <Text className="text-sm font-medium text-overlay-ink">{r.label}</Text>
                {r.description ? <Text className="mt-0.5 text-xs text-overlay-ink-muted">{r.description}</Text> : null}
              </Pressable>
            ))}
          </View>

          <TextInput
            value={details}
            onChangeText={setDetails}
            placeholder="Add details (optional, required for 'Other')"
            placeholderTextColor="#98989D"
            multiline
            textAlignVertical="top"
            className="mb-3 rounded-xl border border-overlay-border bg-overlay-surface-raised px-3.5 py-2.5 text-sm text-overlay-ink"
            style={{ fontFamily: "Inter_400Regular", minHeight: 76 }}
          />

          <Pressable
            onPress={() => void handleSubmit()}
            disabled={!reasonId || submitReport.isPending}
            accessibilityRole="button"
            className={`flex-row items-center justify-center gap-2 rounded-xl bg-overlay-danger py-2.5 ${!reasonId || submitReport.isPending ? "opacity-50" : ""}`}
          >
            {submitReport.isPending ? <ActivityIndicator size="small" color="#1C1C1E" /> : null}
            <Text className="text-sm font-medium text-overlay-surface">Submit report</Text>
          </Pressable>
        </View>
      ) : null}
    </Modal>
  );
}
