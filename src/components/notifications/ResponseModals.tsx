// src/components/notifications/ResponseModals.tsx
// The three "answer this request" dialogs opened from a notification: a Page team invite, a collaboration
// invite (on a post or project), and a music credit. Each looks the pending request up so a stale tap
// (already answered elsewhere) says so instead of failing.
import { router, type Href } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";

import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Avatar";
import { Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useMyPendingCollaborationInvites, useRespondToCollaborationRequest, type CollaborationTarget } from "@/hooks/useCollaboration";
import { useMyPendingMusicCredits, useRespondToMusicCredit } from "@/hooks/useMusicCatalogue";
import { useMyPendingPageInvites, useRespondToPageInvite } from "@/hooks/usePages";
import { haptics } from "@/lib/haptics";
import { CONTRIBUTOR_ROLE_LABELS } from "@/types/music";

function Stale({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <View className="items-center py-2">
      <Text className="text-center text-sm text-overlay-ink-muted">{message}</Text>
      <Pressable onPress={onClose} accessibilityRole="button" className="mt-5 w-full items-center rounded-full bg-overlay-surface-raised py-3">
        <Text className="text-sm font-medium text-overlay-ink">Close</Text>
      </Pressable>
    </View>
  );
}

function Loading() {
  return <Text className="py-6 text-center text-sm text-overlay-ink-muted">Loading…</Text>;
}

function Buttons({ pending, onDecline, onAccept }: { pending: boolean; onDecline: () => void; onAccept: () => void }) {
  return (
    <View className="mt-6 flex-row items-center gap-3">
      <Pressable onPress={onDecline} disabled={pending} accessibilityRole="button" className={`flex-1 items-center rounded-full bg-overlay-surface-raised py-3 ${pending ? "opacity-60" : ""}`}>
        <Text className="text-sm font-medium text-overlay-ink">Decline</Text>
      </Pressable>
      <Pressable onPress={onAccept} disabled={pending} accessibilityRole="button" className={`flex-1 items-center rounded-full bg-overlay-accent py-3 ${pending ? "opacity-60" : ""}`}>
        <Text className="text-sm font-medium text-white">Accept</Text>
      </Pressable>
    </View>
  );
}

function Header({ avatarUrl, name, title, subtitle }: { avatarUrl: string | null; name: string; title: string; subtitle: string }) {
  return (
    <View className="flex-row items-center gap-3">
      <Avatar src={avatarUrl} name={name} size="md" />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="font-medium text-overlay-ink">
          {title}
        </Text>
        <Text numberOfLines={1} className="text-sm text-overlay-ink-muted">
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

function Preview({ children }: { children: ReactNode }) {
  return <View className="mt-4 rounded-xl border border-overlay-border bg-overlay-surface-raised px-3.5 py-3">{children}</View>;
}

function Thumb({ url }: { url: string | null | undefined }) {
  return url ? <Image source={url} contentFit="cover" className="h-12 w-12 shrink-0 rounded-lg" /> : <View className="h-12 w-12 shrink-0 rounded-lg bg-overlay-border" />;
}

export function PageInviteResponseModal({ pageId, onClose }: { pageId: string; onClose: () => void }) {
  const { data: invites, isLoading } = useMyPendingPageInvites();
  const respond = useRespondToPageInvite();
  const [error, setError] = useState<string | null>(null);
  const invite = invites?.find((i) => i.page.id === pageId);

  function handleRespond(accept: boolean) {
    setError(null);
    respond.mutate(
      { page_id: pageId, accept },
      {
        onSuccess: () => {
          haptics.success();
          onClose();
          if (accept && invite) router.push(`/page/${invite.page.username}` as Href);
        },
        onError: (err) => setError(err instanceof Error ? err.message : "Couldn't respond to this invite."),
      }
    );
  }

  return (
    <Modal onClose={onClose}>
      {isLoading ? (
        <Loading />
      ) : !invite ? (
        <Stale message="This invite isn't pending anymore — it may have already been responded to." onClose={onClose} />
      ) : (
        <>
          <Header avatarUrl={invite.page.avatar_url} name={invite.page.name} title={invite.page.name} subtitle={`Invited you as ${invite.role_label}`} />
          {error ? <Text className="mt-3 text-sm text-overlay-danger">{error}</Text> : null}
          <Buttons pending={respond.isPending} onDecline={() => handleRespond(false)} onAccept={() => handleRespond(true)} />
        </>
      )}
    </Modal>
  );
}

export function CollaborationInviteResponseModal({ target, targetId, onClose }: { target: CollaborationTarget; targetId: string; onClose: () => void }) {
  const { data: invites, isLoading } = useMyPendingCollaborationInvites();
  const respond = useRespondToCollaborationRequest(target);
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);

  const list = target === "post" ? invites?.posts : invites?.projects;
  const invite: any = list?.find((i: any) => (target === "post" ? i.post_id : i.project_id) === targetId);
  const content: any = target === "post" ? invite?.post : invite?.project;

  function handleRespond(accept: boolean) {
    setError(null);
    respond.mutate(
      { targetId, accept },
      {
        onSuccess: () => {
          haptics.success();
          onClose();
          toast(accept ? "You're now a collaborator." : "Invite declined.", { variant: "success" });
          if (accept) router.push((target === "post" ? `/post/${targetId}` : `/projects/${targetId}`) as Href);
        },
        onError: (err) => setError(err instanceof Error ? err.message : "Couldn't respond to this invite."),
      }
    );
  }

  return (
    <Modal onClose={onClose}>
      {isLoading ? (
        <Loading />
      ) : !invite ? (
        <Stale message="This invite isn't pending anymore — it may have already been responded to." onClose={onClose} />
      ) : (
        <>
          <Header avatarUrl={invite.inviter.avatar_url} name={invite.inviter.display_name} title={invite.inviter.display_name} subtitle={`Invited you to collaborate on their ${target}`} />

          {/* What you're being asked to join, so the decision isn't made blind. content is null if it was deleted after the invite was sent. */}
          {target === "post" ? (
            !content ? (
              <Preview>
                <Text className="text-sm text-overlay-ink-muted">This post is no longer available.</Text>
              </Preview>
            ) : content.is_archived ? (
              <Preview>
                <Text className="text-sm text-overlay-ink-muted">This post has been archived by its author.</Text>
              </Preview>
            ) : (
              <Preview>
                <View className="flex-row items-center gap-2">
                  <Avatar src={content.author.avatar_url} name={content.author.display_name} size="sm" />
                  <Text numberOfLines={1} className="shrink font-display text-sm font-semibold text-overlay-ink">
                    {content.author.display_name}
                  </Text>
                </View>
                {content.content ? (
                  <Text numberOfLines={4} className="mt-1.5 text-sm text-overlay-ink">
                    {content.content}
                  </Text>
                ) : null}
                {content.media_urls?.length > 0 && <Image source={content.media_urls[0]} contentFit="cover" className="mt-2 h-32 w-full rounded-lg" />}
              </Preview>
            )
          ) : !content ? (
            <Preview>
              <Text className="text-sm text-overlay-ink-muted">This project is no longer available.</Text>
            </Preview>
          ) : (
            <Preview>
              <View className="flex-row items-center gap-3">
                <Thumb url={content.thumbnail_url} />
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="font-display text-sm font-semibold text-overlay-ink">
                    {content.title}
                  </Text>
                  {content.description ? (
                    <Text numberOfLines={1} className="text-xs text-overlay-ink-muted">
                      {content.description}
                    </Text>
                  ) : null}
                </View>
              </View>
            </Preview>
          )}

          {error ? <Text className="mt-3 text-sm text-overlay-danger">{error}</Text> : null}
          <Buttons pending={respond.isPending} onDecline={() => handleRespond(false)} onAccept={() => handleRespond(true)} />
        </>
      )}
    </Modal>
  );
}

export function MusicCreditResponseModal({ catalogueId, onClose }: { catalogueId: string; onClose: () => void }) {
  const { data: credits, isLoading } = useMyPendingMusicCredits();
  const respond = useRespondToMusicCredit();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const credit = credits?.find((c) => c.catalogue_id === catalogueId);

  function handleRespond(accept: boolean) {
    setError(null);
    respond.mutate(
      { catalogueId, accept },
      {
        onSuccess: (result) => {
          haptics.success();
          onClose();
          if (accept && result.gig_created && result.gig_id) {
            toast("Credit accepted — a Gig was started for you.", { variant: "success" });
            router.push(`/projects/${result.gig_id}` as Href);
          } else toast(accept ? "Credit accepted." : "Credit declined.", { variant: "success" });
        },
        onError: (err) => setError(err instanceof Error ? err.message : "Couldn't respond to this credit."),
      }
    );
  }

  return (
    <Modal onClose={onClose}>
      {isLoading ? (
        <Loading />
      ) : !credit ? (
        <Stale message="This credit request isn't pending anymore — it may have already been responded to." onClose={onClose} />
      ) : (
        <>
          <Header avatarUrl={credit.creator.avatar_url} name={credit.creator.display_name} title={credit.creator.display_name} subtitle={`Credited you as ${CONTRIBUTOR_ROLE_LABELS[credit.role]}`} />
          <Preview>
            <View className="flex-row items-center gap-3">
              <Thumb url={credit.cover_url} />
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="font-display text-sm font-semibold text-overlay-ink">
                  {credit.title}
                </Text>
                <Text numberOfLines={1} className="text-xs text-overlay-ink-muted">
                  {credit.primary_artist_name}
                </Text>
              </View>
            </View>
          </Preview>
          <Text className="mt-3 text-xs text-overlay-ink-muted">
            Accepting may start a {CONTRIBUTOR_ROLE_LABELS[credit.role]} Gig for you if you don't already have one, with this song added as a portfolio sample.
          </Text>
          {error ? <Text className="mt-3 text-sm text-overlay-danger">{error}</Text> : null}
          <Buttons pending={respond.isPending} onDecline={() => handleRespond(false)} onAccept={() => handleRespond(true)} />
        </>
      )}
    </Modal>
  );
}
