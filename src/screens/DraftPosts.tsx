// src/screens/DraftPosts.tsx
// Posts saved as drafts: resume in Compose or discard.
import { router, type Href } from "expo-router";
import { FileEdit, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyNotice } from "@/components/activity/EmptyNotice";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useDeleteDraftOrScheduledPost, useMyDraftPosts } from "@/hooks/usePosts";

export function DraftPosts() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { data: drafts, isLoading } = useMyDraftPosts();
  const deleteDraft = useDeleteDraftOrScheduledPost();
  const [pendingDiscard, setPendingDiscard] = useState<string | null>(null);

  function handleDiscard(id: string) {
    deleteDraft.mutate(id, {
      onSuccess: () => toast("Draft discarded."),
      onError: () => toast("Couldn't discard that draft. Try again.", { variant: "error" }),
    });
  }

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Drafts" />
      {isLoading ? (
        <Text className="py-10 text-center text-sm text-ink-muted">Loading…</Text>
      ) : !drafts?.length ? (
        <EmptyNotice large icon={FileEdit} title="No drafts yet" message={'Start a post and choose "Save as draft" instead of posting — it\'ll show up here.'} />
      ) : (
        <FlatList
          data={drafts}
          keyExtractor={(d) => d.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 24, gap: 12 }}
          renderItem={({ item: draft }) => (
            <View className="rounded-2xl border border-dashed border-border bg-surface p-4">
              <View className="mb-2 flex-row items-center gap-2">
                <View className="rounded-full border border-border bg-canvas px-2 py-0.5">
                  <Text className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">Draft</Text>
                </View>
                {draft.category_id ? <Text className="text-[11px] text-ink-muted">{new Date(draft.created_at).toLocaleDateString()}</Text> : null}
              </View>
              {draft.heading ? (
                <Text numberOfLines={1} className="mb-1 font-medium text-ink">
                  {draft.heading}
                </Text>
              ) : null}
              <Text numberOfLines={3} className="text-sm text-ink-muted">
                {draft.content || "(No text yet — just media or a heading.)"}
              </Text>
              <View className="mt-3 flex-row items-center gap-2">
                <Pressable onPress={() => router.push({ pathname: "/compose", params: { draftId: draft.id } } as Href)} accessibilityRole="button" className="flex-1 items-center rounded-full bg-accent py-2">
                  <Text className="text-sm font-medium text-canvas">Resume</Text>
                </Pressable>
                <Pressable onPress={() => setPendingDiscard(draft.id)} accessibilityRole="button" accessibilityLabel="Discard draft" className="rounded-full border border-border p-2">
                  <Icon as={Trash2} size={16} className="text-ink-muted" />
                </Pressable>
              </View>
            </View>
          )}
        />
      )}
      {pendingDiscard && (
        <ConfirmDialog
          title="Discard this draft?"
          description="The draft will be deleted. This can't be undone."
          confirmLabel="Discard"
          onConfirm={() => {
            const id = pendingDiscard;
            setPendingDiscard(null);
            handleDiscard(id);
          }}
          onCancel={() => setPendingDiscard(null)}
        />
      )}
    </View>
  );
}
