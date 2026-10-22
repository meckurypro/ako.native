// src/components/post/PostStatusBanner.tsx
// Native counterpart of web PostStatusBanner. Shown above a post that is NOT live (draft or scheduled) when
// its author or an admin/moderator opens it. RLS lets them in; everyone else is told it isn't available.
// Without this banner the screen looks exactly like a published post, so an author thinks it's live and
// shares a link nobody else can open. See lib/postStatus.ts.
import { router, type Href } from "expo-router";
import type { ReactNode } from "react";
import { View } from "react-native";

import { Text } from "@/components/ui/Text";
import { postLifecycle } from "@/lib/postStatus";
import type { PostWithAuthor } from "@/types/database";

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "a later time";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function PostStatusBanner({ post, isOwnPost }: { post: PostWithAuthor; isOwnPost: boolean }) {
  const state = postLifecycle(post);
  if (state === "published") return null;

  const handle = post.author?.username ? `@${post.author.username}` : "the author";
  let text: ReactNode;
  if (state === "draft") {
    // For the author, "draft" / "Drafts" are links to the Drafts screen, where the post can be resumed and published.
    const draftsLink = (label: string) => (
      <Text
        accessibilityRole="link"
        onPress={() => router.push("/activity/drafts" as Href)}
        className="text-xs font-medium text-accent underline"
      >
        {label}
      </Text>
    );
    text = isOwnPost ? (
      <>
        This is a {draftsLink("draft")} — only you can see it. It isn't live yet, so a link to it won't open for anyone
        else. Publish it from your {draftsLink("Drafts")} to share it.
      </>
    ) : (
      `Draft by ${handle} — not published. Only the author and admins can see it; everyone else is told it isn't available.`
    );
  } else {
    const when = formatWhen(post.scheduled_for);
    text = isOwnPost
      ? `Scheduled for ${when} — only you can see it until then. A link to it won't open for anyone else before it goes live.`
      : `Scheduled by ${handle} for ${when} — not live yet. Only the author and admins can see it until then.`;
  }

  return (
    <View accessibilityRole="alert" className="mb-3 rounded-lg border border-border bg-surface px-3 py-2">
      <Text className="text-xs text-ink-muted">{text}</Text>
    </View>
  );
}
