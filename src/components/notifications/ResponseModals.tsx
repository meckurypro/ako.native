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

// `light` = the themed surface-card look the web uses for the collaboration + music-credit dialogs
// (surface card, ink text, outlined Decline); the Page invite uses the dark overlay panel via <Modal>.
const TONE = {
  dark: {
    ink: "text-overlay-ink",
    muted: "text-overlay-ink-muted",
    danger: "text-overlay-danger",
    ghostBtn: "bg-overlay-surface-raised",
    acceptBtn: "bg-overlay-accent",
    acceptText: "text-white",
    preview: "border border-overlay-border bg-overlay-surface-raised",
    thumb: "bg-overlay-border",
  },
  light: {
    ink: "text-ink",
    muted: "text-ink-muted",
    danger: "text-danger",
    ghostBtn: "border border-border",
    acceptBtn: "bg-accent",
    acceptText: "text-canvas",
    preview: "border border-border bg-canvas",
    thumb: "border border-border bg-surface",
  },
} as const;

/** Web: relative w-full max-w-sm bg-surface rounded-2xl border border-border p-5 shadow-xl, over a canvas/70 scrim. */
function LightModal({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <Modal onClose={onClose} bare scrim="canvas">
      <View
        className="rounded-2xl border border-border bg-surface p-5"
        style={{ shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 12 }}
      >
        {children}
      </View>
    </Modal>
  );
}

function Stale({ message, onClose, light }: { message: string; onClose: () => void; light?: boolean }) {
  const t = TONE[light ? "light" : "dark"];
  return (
    <View className={`items-center ${light ? "py-4" : "py-2"}`}>
      <Text className={`text-center text-sm ${t.muted}`}>{message}</Text>
      <Pressable onPress={onClose} accessibilityRole="button" className={`${light ? "mt-4 py-2.5" : "mt-5 py-3"} w-full items-center rounded-full ${t.ghostBtn}`}>
        <Text className={`text-sm font-medium ${t.ink}`}>Close</Text>
      </Pressable>
    </View>
  );
}

function Loading({ light }: { light?: boolean }) {
  return <Text className={`py-6 text-center text-sm ${TONE[light ? "light" : "dark"].muted}`}>Loading…</Text>;
}

function Buttons({ pending, onDecline, onAccept, light }: { pending: boolean; onDecline: () => void; onAccept: () => void; light?: boolean }) {
  const t = TONE[light ? "light" : "dark"];
  const pad = light ? "py-2.5" : "py-3";
  return (
    <View className={`${light ? "mt-5 gap-2" : "mt-6 gap-3"} flex-row items-center`}>
      <Pressable onPress={onDecline} disabled={pending} accessibilityRole="button" className={`flex-1 items-center rounded-full ${t.ghostBtn} ${pad} ${pending ? "opacity-60" : ""}`}>
        <Text className={`text-sm font-medium ${t.ink}`}>Decline</Text>
      </Pressable>
      <Pressable onPress={onAccept} disabled={pending} accessibilityRole="button" className={`flex-1 items-center rounded-full ${t.acceptBtn} ${pad} ${pending ? "opacity-60" : ""}`}>
        <Text className={`text-sm font-medium ${t.acceptText}`}>Accept</Text>
      </Pressable>
    </View>
  );
}

function Header({ avatarUrl, name, title, subtitle, light }: { avatarUrl: string | null; name: string; title: string; subtitle: string; light?: boolean }) {
  const t = TONE[light ? "light" : "dark"];
  return (
    <View className="flex-row items-center gap-3">
      <Avatar src={avatarUrl} name={name} size="md" />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className={`font-medium ${t.ink}`}>
          {title}
        </Text>
        <Text numberOfLines={1} className={`text-sm ${t.muted}`}>
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

function Preview({ children, light }: { children: ReactNode; light?: boolean }) {
  return <View className={`${light ? "mt-3" : "mt-4"} rounded-xl px-3.5 py-3 ${TONE[light ? "light" : "dark"].preview}`}>{children}</View>;
}

function Thumb({ url, light }: { url: string | null | undefined; light?: boolean }) {
  return url ? (
    <Image source={url} contentFit="cover" className={`h-12 w-12 shrink-0 rounded-lg ${light ? "border border-border" : ""}`} />
  ) : (
    <View className={`h-12 w-12 shrink-0 rounded-lg ${TONE[light ? "light" : "dark"].thumb}`} />
  );
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
    <LightModal onClose={onClose}>
      {isLoading ? (
        <Loading light />
      ) : !invite ? (
        <Stale light message="This invite isn't pending anymore — it may have already been responded to." onClose={onClose} />
      ) : (
        <>
          <Header light avatarUrl={invite.inviter.avatar_url} name={invite.inviter.display_name} title={invite.inviter.display_name} subtitle={`Invited you to collaborate on their ${target}`} />

          {/* What you're being asked to join, so the decision isn't made blind. content is null if it was deleted after the invite was sent. */}
          {target === "post" ? (
            !content ? (
              <Preview light>
                <Text className="text-sm text-ink-muted">This post is no longer available.</Text>
              </Preview>
            ) : content.is_archived ? (
              <Preview light>
                <Text className="text-sm text-ink-muted">This post has been archived by its author.</Text>
              </Preview>
            ) : (
              <Preview light>
                <View className="flex-row items-center gap-2">
                  <Avatar src={content.author.avatar_url} name={content.author.display_name} size="sm" />
                  <Text numberOfLines={1} className="shrink font-display text-sm font-semibold text-ink">
                    {content.author.display_name}
                  </Text>
                </View>
                {content.content ? (
                  <Text numberOfLines={4} className="mt-1.5 text-sm text-ink">
                    {content.content}
                  </Text>
                ) : null}
                {content.media_urls?.length > 0 && <Image source={content.media_urls[0]} contentFit="cover" className="mt-2 h-32 w-full rounded-lg" />}
              </Preview>
            )
          ) : !content ? (
            <Preview light>
              <Text className="text-sm text-ink-muted">This project is no longer available.</Text>
            </Preview>
          ) : (
            <Preview light>
              <View className="flex-row items-center gap-3">
                <Thumb light url={content.thumbnail_url} />
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="font-display text-sm font-semibold text-ink">
                    {content.title}
                  </Text>
                  {content.description ? (
                    <Text numberOfLines={1} className="text-xs text-ink-muted">
                      {content.description}
                    </Text>
                  ) : null}
                </View>
              </View>
            </Preview>
          )}

          {error ? <Text className="mt-3 text-sm text-danger">{error}</Text> : null}
          <Buttons light pending={respond.isPending} onDecline={() => handleRespond(false)} onAccept={() => handleRespond(true)} />
        </>
      )}
    </LightModal>
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
    <LightModal onClose={onClose}>
      {isLoading ? (
        <Loading light />
      ) : !credit ? (
        <Stale light message="This credit request isn't pending anymore — it may have already been responded to." onClose={onClose} />
      ) : (
        <>
          <Header light avatarUrl={credit.creator.avatar_url} name={credit.creator.display_name} title={credit.creator.display_name} subtitle={`Credited you as ${CONTRIBUTOR_ROLE_LABELS[credit.role]}`} />
          <Preview light>
            <View className="flex-row items-center gap-3">
              <Thumb light url={credit.cover_url} />
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="font-display text-sm font-semibold text-ink">
                  {credit.title}
                </Text>
                <Text numberOfLines={1} className="text-xs text-ink-muted">
                  {credit.primary_artist_name}
                </Text>
              </View>
            </View>
          </Preview>
          <Text className="mt-3 text-xs text-ink-muted">
            Accepting may start a {CONTRIBUTOR_ROLE_LABELS[credit.role]} Gig for you if you don't already have one, with this song added as a portfolio sample.
          </Text>
          {error ? <Text className="mt-3 text-sm text-danger">{error}</Text> : null}
          <Buttons light pending={respond.isPending} onDecline={() => handleRespond(false)} onAccept={() => handleRespond(true)} />
        </>
      )}
    </LightModal>
  );
}
