// src/screens/ScheduledPosts.tsx
// Posts queued to publish later: resume in Compose or cancel.
import { router, type Href } from "expo-router";
import { FileEdit, Send, X } from "lucide-react-native";
import { useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyNotice } from "@/components/activity/EmptyNotice";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useDeleteDraftOrScheduledPost, useMyScheduledPosts } from "@/hooks/usePosts";

function timeUntil(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return "publishing shortly";
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `in ${mins} min${mins === 1 ? "" : "s"}`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `in ${hours} hr${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

export function ScheduledPosts() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { data: scheduled, isLoading } = useMyScheduledPosts();
  const cancelScheduled = useDeleteDraftOrScheduledPost();
  const [pendingCancel, setPendingCancel] = useState<string | null>(null);

  function handleCancel(id: string) {
    cancelScheduled.mutate(id, {
      onSuccess: () => toast("Scheduled post cancelled."),
      onError: () => toast("Couldn't cancel that. Try again.", { variant: "error" }),
    });
  }

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Scheduled" />
      {isLoading ? (
        <Text className="py-10 text-center text-sm text-ink-muted">Loading…</Text>
      ) : !scheduled?.length ? (
        <EmptyNotice large icon={Send} title="Nothing scheduled" message={'Choose "Schedule…" instead of posting to queue something for later — it\'ll show up here.'} />
      ) : (
        <FlatList
          data={scheduled}
          keyExtractor={(p) => p.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 24, gap: 12 }}
          renderItem={({ item: post }) => (
            <View className="rounded-2xl border border-accent/30 bg-accent-soft/40 p-4">
              <View className="mb-2 flex-row items-center justify-between">
                <View className="flex-row items-center gap-1.5">
                  <Icon as={Send} size={12} className="text-accent" />
                  <Text className="text-xs font-medium text-accent">Publishes {post.scheduled_for ? timeUntil(post.scheduled_for) : ""}</Text>
                </View>
                <Pressable onPress={() => setPendingCancel(post.id)} accessibilityRole="button" accessibilityLabel="Cancel scheduled post" hitSlop={10}>
                  <Icon as={X} size={16} className="text-ink-muted" />
                </Pressable>
              </View>
              {post.heading ? (
                <Text numberOfLines={1} className="mb-1 font-medium text-ink">
                  {post.heading}
                </Text>
              ) : null}
              <Text numberOfLines={3} className="text-sm text-ink-muted">
                {post.content}
              </Text>
              {post.scheduled_for ? (
                <Text className="mt-2 text-[11px] text-ink-muted">
                  {new Date(post.scheduled_for).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </Text>
              ) : null}
              <View className="mt-3 flex-row items-center gap-2">
                <Pressable
                  onPress={() => router.push({ pathname: "/compose", params: { scheduledId: post.id } } as Href)}
                  accessibilityRole="button"
                  className="flex-1 flex-row items-center justify-center gap-1.5 rounded-full bg-accent py-2"
                >
                  <Icon as={FileEdit} size={14} className="text-canvas" />
                  <Text className="text-sm font-medium text-canvas">Resume</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      )}
      {pendingCancel && (
        <ConfirmDialog
          title="Cancel this scheduled post?"
          description="It won't be published, and it'll be deleted. This can't be undone."
          confirmLabel="Cancel post"
          cancelLabel="Keep it"
          onConfirm={() => {
            const id = pendingCancel;
            setPendingCancel(null);
            handleCancel(id);
          }}
          onCancel={() => setPendingCancel(null)}
        />
      )}
    </View>
  );
}
