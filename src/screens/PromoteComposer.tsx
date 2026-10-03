// src/screens/PromoteComposer.tsx
// Promote one of your posts: daily budget × duration, optional audience topics,
// paid from the wallet up front and reviewed by an admin before it goes live.
// With an existing campaign it shows its status and — once approved — lets you
// pause/resume, extend, or end it early (refunded for undelivered days).
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Megaphone, Pause, Play, TimerReset, XCircle } from "lucide-react-native";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useMemo, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FormField } from "@/components/ui/FormField";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/hooks/useAuth";
import { useCategories } from "@/hooks/useCategories";
import { useFeatureFlag } from "@/hooks/useFeatureFlags";
import {
  PROMOTION_DAILY_BUDGET_MAX_USD,
  PROMOTION_DAILY_BUDGET_MIN_USD,
  PROMOTION_DURATION_MAX_DAYS,
  PROMOTION_DURATION_MIN_DAYS,
  useExtendPromotion,
  usePausePromotion,
  usePromotionForPost,
  useResumePromotion,
  useSubmitPromotion,
  useTerminatePromotion,
  type PromotionStatus,
} from "@/hooks/usePromotions";
import { useSmartBack } from "@/hooks/useSmartBack";
import { useWallet } from "@/hooks/useWallet";
import { formatUsd } from "@/lib/money";
import { supabase } from "@/lib/supabase";

interface PromotablePost {
  id: string;
  author_id: string;
  content: string;
  heading: string | null;
  status: string;
  is_deleted: boolean;
}

function usePromotablePost(postId: string | undefined) {
  return useQuery({
    queryKey: ["promotable-post", postId],
    queryFn: async (): Promise<PromotablePost> => {
      const { data, error } = await supabase
        .from("posts")
        .select("id, author_id, content, heading, status, is_deleted")
        .eq("id", postId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!postId,
  });
}

const STATUS_COPY: Record<PromotionStatus, { label: string; tone: string }> = {
  pending: { label: "Submitted — awaiting admin review", tone: "text-ink-muted" },
  approved: { label: "Approved — live now", tone: "text-accent" },
  paused: { label: "Paused — not currently serving", tone: "text-ink-muted" },
  declined: { label: "Declined — refunded to your wallet", tone: "text-danger" },
  completed: { label: "Completed", tone: "text-ink-muted" },
  cancelled: { label: "Terminated — refunded for remaining days", tone: "text-ink-muted" },
};

function Notice({ message }: { message: string }) {
  return (
    <View className="flex-1 items-center justify-center bg-canvas px-6">
      <Text className="text-center text-ink-muted">{message}</Text>
    </View>
  );
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <View className={`rounded-xl border border-border bg-surface p-4 ${className}`}>{children}</View>;
}

export function PromoteComposer() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const insets = useSafeAreaInsets();
  const smartBack = useSmartBack();
  const { user } = useAuth();

  const { data: post, isLoading: postLoading } = usePromotablePost(postId);
  const { data: wallet } = useWallet();
  const { data: categories } = useCategories();
  const { data: existingPromotion, isLoading: promotionLoading } = usePromotionForPost(postId);
  const submitPromotion = useSubmitPromotion();
  const pausePromotion = usePausePromotion();
  const resumePromotion = useResumePromotion();
  const terminatePromotion = useTerminatePromotion();
  const extendPromotion = useExtendPromotion();
  const promotionsEnabled = useFeatureFlag("promotions_enabled");

  const [dailyBudget, setDailyBudget] = useState(String(PROMOTION_DAILY_BUDGET_MIN_USD));
  const [durationDays, setDurationDays] = useState(String(PROMOTION_DURATION_MIN_DAYS));
  const [selectedInterests, setSelectedInterests] = useState<Set<string>>(new Set());
  const [error, setError] = useState<ReactNode | null>(null);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  const [showExtendForm, setShowExtendForm] = useState(false);
  const [extendDays, setExtendDays] = useState("1");
  const [confirmTerminate, setConfirmTerminate] = useState(false);

  const totalCost = useMemo(() => {
    const budget = Number(dailyBudget);
    const days = Number(durationDays);
    if (!Number.isFinite(budget) || !Number.isFinite(days)) return 0;
    return Math.round(budget * days * 100) / 100;
  }, [dailyBudget, durationDays]);

  const isOwner = !!user && !!post && post.author_id === user.id;
  const hasActiveCampaign = existingPromotion?.status === "pending" || existingPromotion?.status === "approved" || existingPromotion?.status === "paused";
  const canManage = existingPromotion?.status === "approved" || existingPromotion?.status === "paused";

  function toggleInterest(id: string) {
    setSelectedInterests((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handlePauseToggle() {
    if (!existingPromotion) return;
    setLifecycleError(null);
    try {
      if (existingPromotion.status === "paused") await resumePromotion.mutateAsync(existingPromotion.id);
      else await pausePromotion.mutateAsync(existingPromotion.id);
    } catch (err) {
      setLifecycleError(err instanceof Error ? err.message : "Couldn't update this campaign.");
    }
  }

  async function handleTerminate() {
    if (!existingPromotion) return;
    setConfirmTerminate(false);
    setLifecycleError(null);
    try {
      await terminatePromotion.mutateAsync(existingPromotion.id);
    } catch (err) {
      setLifecycleError(err instanceof Error ? err.message : "Couldn't terminate this campaign.");
    }
  }

  async function handleExtend() {
    if (!existingPromotion) return;
    const days = Number(extendDays);
    if (!Number.isInteger(days) || days <= 0) {
      setLifecycleError("Enter a whole number of days to add.");
      return;
    }
    setLifecycleError(null);
    try {
      await extendPromotion.mutateAsync({ promotionId: existingPromotion.id, additionalDays: days });
      setShowExtendForm(false);
      setExtendDays("1");
    } catch (err) {
      setLifecycleError(err instanceof Error ? err.message : "Couldn't extend this campaign.");
    }
  }

  async function handleSubmit() {
    setError(null);

    if (!promotionsEnabled) {
      setError("Post promotions are temporarily disabled.");
      return;
    }

    const budget = Number(dailyBudget);
    const days = Number(durationDays);

    if (!Number.isFinite(budget) || budget < PROMOTION_DAILY_BUDGET_MIN_USD || budget > PROMOTION_DAILY_BUDGET_MAX_USD) {
      setError(`Daily budget must be between ${formatUsd(PROMOTION_DAILY_BUDGET_MIN_USD)} and ${formatUsd(PROMOTION_DAILY_BUDGET_MAX_USD)}.`);
      return;
    }
    if (!Number.isInteger(days) || days < PROMOTION_DURATION_MIN_DAYS || days > PROMOTION_DURATION_MAX_DAYS) {
      setError(`Duration must be between ${PROMOTION_DURATION_MIN_DAYS} and ${PROMOTION_DURATION_MAX_DAYS} days.`);
      return;
    }
    if (wallet && totalCost > wallet.balance) {
      setError(
        <>
          {`This campaign costs ${formatUsd(totalCost)}, but your `}
          <Text className="text-danger underline" accessibilityRole="link" onPress={() => router.push("/wallet" as Href)}>
            wallet
          </Text>
          {` balance is ${formatUsd(wallet.balance)}.`}
        </>
      );
      return;
    }

    try {
      await submitPromotion.mutateAsync({
        post_id: postId,
        daily_budget_usd: budget,
        duration_days: days,
        interest_ids: Array.from(selectedInterests),
      });
      router.replace(`/post/${postId}` as Href);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit this campaign.");
    }
  }

  if (postLoading || promotionLoading) return <Notice message="Loading…" />;
  if (!post || post.is_deleted) return <Notice message="This post is no longer available." />;
  if (!isOwner) return <Notice message="You can only promote your own posts." />;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 bg-canvas">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: insets.bottom + 48 }}
      >
        <View className="w-full max-w-lg self-center">
          <View className="mb-6 flex-row items-center gap-3">
            <Pressable onPress={smartBack} accessibilityRole="button" accessibilityLabel="Back" hitSlop={12}>
              <Icon as={ArrowLeft} size={22} className="text-ink-muted" />
            </Pressable>
            <View className="flex-row items-center gap-2">
              <Icon as={Megaphone} size={20} className="text-accent" />
              <Text className="font-display text-xl text-ink">Promote this post</Text>
            </View>
          </View>

          <Panel className="mb-6">
            <Text className="mb-2 text-xs uppercase tracking-[1.7px] text-ink-muted">Post preview</Text>
            {post.heading ? <Text className="mb-1 font-medium text-ink">{post.heading}</Text> : null}
            <Text numberOfLines={4} className="text-sm text-ink">
              {post.content}
            </Text>
          </Panel>

          {existingPromotion ? (
            <Panel className="mb-6">
              <Text className={`text-sm font-medium ${STATUS_COPY[existingPromotion.status].tone}`}>{STATUS_COPY[existingPromotion.status].label}</Text>
              <Text className="mt-1 text-xs text-ink-muted">
                {`${formatUsd(existingPromotion.daily_budget_usd)}/day · ${existingPromotion.duration_days} day${existingPromotion.duration_days === 1 ? "" : "s"} · ${formatUsd(existingPromotion.total_charged_usd)} total`}
              </Text>
              {existingPromotion.status === "declined" && existingPromotion.admin_feedback ? (
                <Text className="mt-2 rounded-lg bg-canvas p-2 text-sm text-ink">{`"${existingPromotion.admin_feedback}"`}</Text>
              ) : null}
              {existingPromotion.status === "approved" && existingPromotion.give_back_usd != null ? (
                <Text className="mt-2 text-xs text-ink-muted">Give Back: {formatUsd(existingPromotion.give_back_usd)}</Text>
              ) : null}

              {canManage ? (
                <View className="mt-3 gap-3 border-t border-border pt-3">
                  <View className="flex-row flex-wrap gap-2">
                    <Pressable
                      disabled={pausePromotion.isPending || resumePromotion.isPending}
                      onPress={handlePauseToggle}
                      accessibilityRole="button"
                      className={`flex-row items-center gap-1.5 rounded-lg bg-accent-soft px-3 py-1.5 ${pausePromotion.isPending || resumePromotion.isPending ? "opacity-50" : ""}`}
                    >
                      <Icon as={existingPromotion.status === "paused" ? Play : Pause} size={14} className="text-accent" />
                      <Text className="text-sm font-medium text-accent">
                        {existingPromotion.status === "paused"
                          ? resumePromotion.isPending ? "Resuming…" : "Resume"
                          : pausePromotion.isPending ? "Pausing…" : "Pause"}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setShowExtendForm((s) => !s)}
                      accessibilityRole="button"
                      className="flex-row items-center gap-1.5 rounded-lg bg-accent-soft px-3 py-1.5"
                    >
                      <Icon as={TimerReset} size={14} className="text-accent" />
                      <Text className="text-sm font-medium text-accent">Extend</Text>
                    </Pressable>
                    <Pressable
                      disabled={terminatePromotion.isPending}
                      onPress={() => setConfirmTerminate(true)}
                      accessibilityRole="button"
                      className={`flex-row items-center gap-1.5 rounded-lg bg-danger/10 px-3 py-1.5 ${terminatePromotion.isPending ? "opacity-50" : ""}`}
                    >
                      <Icon as={XCircle} size={14} className="text-danger" />
                      <Text className="text-sm font-medium text-danger">{terminatePromotion.isPending ? "Ending…" : "End campaign"}</Text>
                    </Pressable>
                  </View>

                  {showExtendForm ? (
                    <View className="flex-row items-end gap-2">
                      <View className="flex-1">
                        <FormField label="Additional days" value={extendDays} onChangeText={setExtendDays} keyboardType="number-pad" />
                      </View>
                      <Text className="pb-9 text-xs text-ink-muted">+{formatUsd((Number(extendDays) || 0) * existingPromotion.daily_budget_usd)}</Text>
                      <Pressable
                        onPress={handleExtend}
                        disabled={extendPromotion.isPending}
                        accessibilityRole="button"
                        className={`mb-7 rounded-lg bg-accent px-3 py-2 ${extendPromotion.isPending ? "opacity-50" : ""}`}
                      >
                        <Text className="text-sm font-medium text-canvas">{extendPromotion.isPending ? "Adding…" : "Add"}</Text>
                      </Pressable>
                    </View>
                  ) : null}

                  {lifecycleError ? (
                    <Text accessibilityRole="alert" className="text-sm text-danger">
                      {lifecycleError}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </Panel>
          ) : null}

          {hasActiveCampaign ? (
            <Text className="text-sm text-ink-muted">
              This post already has {existingPromotion?.status === "pending" ? "a campaign awaiting review" : "an active campaign"}.
              {existingPromotion?.status === "pending" ? " You can submit a new one once this is reviewed." : ""}
            </Text>
          ) : !promotionsEnabled ? (
            <Text className="text-sm text-ink-muted">Post promotions are temporarily unavailable. Check back later.</Text>
          ) : (
            <View>
              <FormField
                label={`Daily budget (USD, ${formatUsd(PROMOTION_DAILY_BUDGET_MIN_USD)}–${formatUsd(PROMOTION_DAILY_BUDGET_MAX_USD)})`}
                value={dailyBudget}
                onChangeText={setDailyBudget}
                keyboardType="decimal-pad"
              />
              <FormField
                label={`Duration (days, ${PROMOTION_DURATION_MIN_DAYS}–${PROMOTION_DURATION_MAX_DAYS})`}
                value={durationDays}
                onChangeText={setDurationDays}
                keyboardType="number-pad"
              />

              <View className="mb-6">
                <Text className="mb-2.5 text-[11px] font-medium uppercase tracking-[1.54px] text-ink-muted">Audience interests (optional)</Text>
                <Text className="mb-3 text-xs text-ink-muted">
                  Leave blank to reach everyone. Pick a few to focus your budget on people interested in those topics.
                </Text>
                <View className="gap-4">
                  {categories?.map((category) => (
                    <View key={category.id}>
                      <Text className="mb-1.5 text-xs font-medium text-ink-muted">{category.name}</Text>
                      <View className="flex-row flex-wrap gap-2">
                        {category.interests.map((interest) => {
                          const isSelected = selectedInterests.has(interest.id);
                          return (
                            <Pressable
                              key={interest.id}
                              onPress={() => toggleInterest(interest.id)}
                              accessibilityRole="checkbox"
                              accessibilityState={{ checked: isSelected }}
                              className={`rounded-full border px-3 py-1.5 ${isSelected ? "border-accent bg-accent" : "border-border bg-surface"}`}
                            >
                              <Text className={`text-sm font-medium ${isSelected ? "text-canvas" : "text-ink"}`}>{interest.name}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ))}
                </View>
              </View>

              <Panel className="mb-4 flex-row items-center justify-between">
                <Text className="text-sm text-ink-muted">Total charged on submission</Text>
                <Text className="font-display text-lg text-ink">{formatUsd(totalCost)}</Text>
              </Panel>

              {wallet ? <Text className="mb-4 text-xs text-ink-muted">Wallet balance: {formatUsd(wallet.balance)}</Text> : null}

              <Text className="mb-4 text-xs text-ink-muted">
                You'll be charged the full amount now. An admin reviews every campaign before it goes live — if it's declined, you're refunded in full and
                notified with the reason.
              </Text>

              {error ? (
                <Text accessibilityRole="alert" className="mb-4 rounded-xl bg-danger/10 p-3 text-sm text-danger">
                  {error}
                </Text>
              ) : null}

              <Button onPress={handleSubmit} loading={submitPromotion.isPending}>
                {`Submit for review — ${formatUsd(totalCost)}`}
              </Button>
            </View>
          )}
        </View>
      </ScrollView>

      {confirmTerminate ? (
        <ConfirmDialog
          title="End this campaign now?"
          description="You'll be refunded for any remaining undelivered days."
          confirmLabel="End campaign"
          onConfirm={handleTerminate}
          onCancel={() => setConfirmTerminate(false)}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}
