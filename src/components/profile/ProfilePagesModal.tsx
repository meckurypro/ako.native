// src/components/profile/ProfilePagesModal.tsx
// The one place pages are listed and switched into (there is no separate Pages screen any more).
//
//  - "visitor": someone else's profile (or your own while previewing as a visitor). Lists the pages that person is
//    affiliated with; tapping one just visits it.
//  - "owner": your own profile / the Pages shortcuts. Lists every page you run with a "Create a page" CTA; tapping one
//    switches your account into that page right away. With no pages it explains what a page is and offers to set one up.
//
// Modal caps the card at 85% of the screen and scrolls its content, so a long list scrolls.
import { Check, Plus, X } from "lucide-react-native";
import { router, type Href } from "expo-router";
import { Pressable, View } from "react-native";

import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/styled";
import { Modal } from "@/components/ui/Modal";
import { Text } from "@/components/ui/Text";
import { TextLink } from "@/components/ui/TextLink";
import { useToast } from "@/components/ui/Toast";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { useIsRestricted } from "@/hooks/useAccountAccess";
import { usePagesFeatureSettings } from "@/hooks/useAdmin";
import { runAfterDismiss } from "@/hooks/useBackDismiss";
import {
  useActiveIdentity,
  useMyPages,
  useMyPendingPageInvites,
  useRespondToPageInvite,
  useSwitchActiveMode,
  type ProfilePageAffiliation,
} from "@/hooks/usePages";
import { useMyProfile } from "@/hooks/useProfile";
import { haptics } from "@/lib/haptics";
import { pageModeLabel } from "@/lib/pageRoles";

type Props =
  | { mode: "visitor"; pages: ProfilePageAffiliation[]; onClose: () => void }
  | {
      mode: "owner";
      onClose: () => void;
      /** Where to land after switching into a page. `false` stays put (e.g. mid-compose). */
      navigateOnSwitch?: boolean;
    };

export function ProfilePagesModal(props: Props) {
  return (
    <Modal onClose={props.onClose} ariaLabel="Pages">
      <Text className="text-lg font-semibold text-overlay-ink">Pages</Text>
      {props.mode === "visitor" ? (
        <VisitorList pages={props.pages} onClose={props.onClose} />
      ) : (
        <OwnerList onClose={props.onClose} navigateOnSwitch={props.navigateOnSwitch ?? true} />
      )}
    </Modal>
  );
}

function VisitorList({ pages, onClose }: { pages: ProfilePageAffiliation[]; onClose: () => void }) {
  return (
    <View className="-mx-2 mt-3">
      {pages.map((p) => (
        <Pressable
          key={p.page_id}
          onPress={() => runAfterDismiss(onClose, () => router.push(`/page/${p.username}` as Href))}
          accessibilityRole="button"
          accessibilityLabel={`${p.name}, ${p.role_label}`}
          className="flex-row items-center gap-3 rounded-2xl px-2 py-3 active:bg-overlay-surface-raised"
        >
          <Avatar src={p.avatar_url} name={p.name} size="vn" />
          <View className="min-w-0 flex-1">
            <View className="flex-row items-center gap-1.5">
              <Text numberOfLines={1} className="shrink font-medium text-overlay-ink">{p.name}</Text>
              {p.is_verified ? <VerifiedBadge className="shrink-0" /> : null}
            </View>
            <Text numberOfLines={1} className="text-sm text-overlay-ink-muted">{p.role_label}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function OwnerList({ onClose, navigateOnSwitch }: { onClose: () => void; navigateOnSwitch: boolean }) {
  const toast = useToast();
  const restricted = useIsRestricted();
  const { data: me } = useMyProfile();
  const { data: identity } = useActiveIdentity();
  const { data: pages, isLoading } = useMyPages();
  const { data: invites } = useMyPendingPageInvites();
  const { data: pagesFeature } = usePagesFeatureSettings();
  const switchMode = useSwitchActiveMode();
  const respond = useRespondToPageInvite();

  const canCreate = (pagesFeature?.pages_creation_enabled ?? true) && !restricted;
  const actingAsPage = identity?.mode === "page" ? identity.page.id : null;
  const hasPages = (pages?.length ?? 0) > 0;

  function goToPage(pageId: string, username: string) {
    haptics.selection();
    const land = () =>
      runAfterDismiss(onClose, () => {
        if (navigateOnSwitch) router.push(`/page/${username}` as Href);
      });
    // Already acting as this page: nothing to switch, just go there.
    if (actingAsPage === pageId) return land();
    switchMode.mutate(pageId, {
      onSuccess: land,
      onError: () => toast("Couldn't switch to that page.", { variant: "error" }),
    });
  }

  function backToPersonal() {
    haptics.selection();
    switchMode.mutate(null, {
      onSuccess: () =>
        runAfterDismiss(onClose, () => {
          if (navigateOnSwitch) router.replace("/me");
        }),
      onError: () => toast("Couldn't switch accounts.", { variant: "error" }),
    });
  }

  function goCreate() {
    runAfterDismiss(onClose, () => router.push("/pages/new"));
  }

  if (isLoading) return <Text className="mt-4 text-sm text-overlay-ink-muted">Loading…</Text>;

  return (
    <>
      {invites && invites.length > 0 ? (
        <View className="mt-3">
          <Text className="mb-1 text-xs font-medium uppercase tracking-wide text-overlay-ink-muted">Invites</Text>
          <View className="-mx-2">
            {invites.map((invite) => (
              <View key={invite.id} className="flex-row items-center gap-3 px-2 py-2.5">
                <Avatar src={invite.page.avatar_url} name={invite.page.name} size="vn" />
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="font-medium text-overlay-ink">{invite.page.name}</Text>
                  <Text numberOfLines={1} className="text-sm text-overlay-ink-muted">Invited as {invite.role_label}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Decline"
                  disabled={respond.isPending}
                  hitSlop={6}
                  onPress={() =>
                    respond.mutate({ page_id: invite.page_id, accept: false }, { onSuccess: () => toast(`Declined ${invite.page.name}.`, { variant: "success" }) })
                  }
                  className="h-9 w-9 items-center justify-center rounded-full active:bg-overlay-surface-raised"
                >
                  <Icon as={X} size={16} className="text-overlay-ink-muted" />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Accept"
                  disabled={respond.isPending}
                  hitSlop={6}
                  onPress={() =>
                    respond.mutate({ page_id: invite.page_id, accept: true }, { onSuccess: () => toast(`Joined ${invite.page.name}.`, { variant: "success" }) })
                  }
                  className="h-9 w-9 items-center justify-center rounded-full bg-accent-soft"
                >
                  <Icon as={Check} size={16} className="text-accent" />
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {hasPages ? (
        <View className="-mx-2 mt-3">
          {actingAsPage ? (
            <Pressable
              accessibilityRole="button"
              disabled={switchMode.isPending}
              onPress={backToPersonal}
              className="flex-row items-center gap-3 rounded-2xl px-2 py-3 active:bg-overlay-surface-raised"
            >
              <Avatar src={me?.avatar_url} name={me?.display_name ?? "You"} size="vn" />
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="font-medium text-overlay-ink">{me?.display_name}</Text>
                <Text numberOfLines={1} className="text-sm text-overlay-ink-muted">Personal account</Text>
              </View>
            </Pressable>
          ) : null}
          {pages!.map((page) => (
            <Pressable
              key={page.id}
              accessibilityRole="button"
              accessibilityState={{ selected: actingAsPage === page.id }}
              accessibilityLabel={`${page.name}, ${page.my_role_label}`}
              disabled={switchMode.isPending}
              onPress={() => goToPage(page.id, page.username)}
              className="flex-row items-center gap-3 rounded-2xl px-2 py-3 active:bg-overlay-surface-raised"
            >
              <Avatar src={page.avatar_url} name={page.name} size="vn" />
              <View className="min-w-0 flex-1">
                <View className="flex-row items-center gap-1.5">
                  <Text numberOfLines={1} className="shrink font-medium text-overlay-ink">{page.name}</Text>
                  {page.is_verified ? <VerifiedBadge className="shrink-0" /> : null}
                </View>
                <Text numberOfLines={1} className="text-sm text-overlay-ink-muted">
                  {page.my_role_label} · {pageModeLabel(page.page_type)}
                </Text>
              </View>
              {actingAsPage === page.id ? <Icon as={Check} size={18} className="shrink-0 text-accent" /> : null}
            </Pressable>
          ))}
        </View>
      ) : (
        <Text className="mt-3 text-sm text-overlay-ink-muted">
          While you're acting as a page, your posts, name, and photo show as the page's instead of yours — everyone managing it shares the same page.
          {canCreate ? (
            <>
              {" "}
              <TextLink onPress={goCreate} className="font-medium text-accent">
                Set one up
              </TextLink>
              .
            </>
          ) : null}
        </Text>
      )}

      {hasPages && canCreate ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create a page"
          onPress={goCreate}
          className="-mx-2 mt-2 flex-row items-center gap-3 rounded-2xl px-2 py-3 active:bg-overlay-surface-raised"
        >
          <View className="h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft">
            <Icon as={Plus} size={18} className="text-accent" />
          </View>
          <Text className="text-sm font-medium text-accent">Create a page</Text>
        </Pressable>
      ) : null}
    </>
  );
}
