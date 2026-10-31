// src/components/activity/ListItemMenu.tsx
//
// The options for one row on Connect or Library, behind the quiet "more" button. Nothing here deletes anything a person
// owns or paid for.
//
//   Pin to top / Unpin       the row leads its list
//   Mute / Unmute updates    no room meeting notifications, no group chat pushes
//   Share in Ako             to a person or a community, as a chat message
//   Share outside Ako        the phone's own share sheet
//   Copy link                to the clipboard
//   Exit group               groups you belong to but don't own
//   Remove from list         hides the row. Access doesn't change and it can come back. Not offered for a group: a group
//                            is managed from inside it, and the way out is Exit group
//
// Every share and copy uses the project's public page (/:slug, or /projects/:id with no slug), never a direct link to
// the ticket, reader or files. Whoever receives it lands on the page and gets access the usual way.
import { useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { Bell, BellOff, EyeOff, Link2, LogOut, MoreHorizontal, Pin, PinOff, Send, Share2 } from "lucide-react-native";
import { useRef, useState } from "react";
import { Pressable, Share, type View } from "react-native";

import { ShareProjectSheet } from "@/components/project/ShareProjectSheet";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DropdownMenu, type DropdownMenuItem } from "@/components/ui/DropdownMenu";
import { useErrorNotice } from "@/components/ui/ErrorNotice";
import { Icon } from "@/components/ui/styled";
import { useToast } from "@/components/ui/Toast";
import { useIsOnline } from "@/hooks/useIsOnline";
import { useRemoveFromLibrary } from "@/hooks/useLibraryRemovals";
import { useSetListPref } from "@/hooks/useProjectListPrefs";
import { useLeaveRoom } from "@/hooks/useRoom";
import { getProjectUrl } from "@/lib/projectLinks";

interface ListItemMenuProps {
  projectId: string;
  title: string;
  slug: string | null;
  pinned: boolean;
  muted: boolean;
  /** The list the row is on, used in wording ("Remove from Connect"). */
  listName: "Connect" | "Library";
  /** Set for a group (or one of its meetings). Only then is "Exit group" offered, and never to the owner. */
  group?: { isOwner: boolean };
  /** Extra actions that belong to this list (Library: update or remove a downloaded copy). Shown first. */
  extraItems?: DropdownMenuItem[];
  /** What "Remove" does when it needs more than hiding the row (Library also deletes the downloaded copy). */
  onRemove?: () => Promise<void>;
  /** Replaces the default explanation in the Remove confirmation. */
  removeDescription?: string;
}

type Dialog = null | "menu" | "remove" | "exit" | "share";

const ICON = "text-overlay-ink";

export function ListItemMenu({ projectId, title, slug, pinned, muted, listName, group, extraItems, onRemove, removeDescription }: ListItemMenuProps) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const triggerRef = useRef<View>(null);
  const setPref = useSetListPref();
  const remove = useRemoveFromLibrary();
  const leave = useLeaveRoom(projectId);
  const queryClient = useQueryClient();
  const online = useIsOnline();
  const toast = useToast();
  const notifyError = useErrorNotice();

  const url = getProjectUrl({ id: projectId, slug });
  const canExit = !!group && !group.isOwner;

  async function copyLink() {
    await Clipboard.setStringAsync(url);
    toast("Link copied.", { variant: "success" });
  }

  async function shareOutside() {
    try {
      await Share.share({ message: `${title}\n${url}` });
    } catch {
      // The person closed the share sheet. Nothing to do.
    }
  }

  function needsInternet(): boolean {
    if (online) return false;
    toast("Connect to the internet to do that.", { variant: "error" });
    return true;
  }

  function togglePin() {
    if (needsInternet()) return;
    setPref.mutate({ projectId, pinned: !pinned }, { onError: (err) => notifyError(err, pinned ? "Couldn't unpin that." : "Couldn't pin that.") });
  }

  function toggleMute() {
    if (needsInternet()) return;
    setPref.mutate(
      { projectId, muted: !muted },
      {
        onSuccess: () => toast(muted ? "Updates are back on." : "Updates muted.", { variant: "success" }),
        onError: (err) => notifyError(err, "Couldn't change that."),
      }
    );
  }

  async function removeNow() {
    if (needsInternet()) return;
    try {
      if (onRemove) await onRemove();
      else await remove.mutateAsync(projectId);
      toast(`Removed from ${listName}`);
    } catch {
      toast("Couldn't remove it. Try again.", { variant: "error" });
    }
  }

  async function exitNow() {
    if (needsInternet()) return;
    try {
      await leave.mutateAsync();
      queryClient.invalidateQueries({ queryKey: ["activity"] });
      queryClient.invalidateQueries({ queryKey: ["library"] });
      toast("You left the group.", { variant: "success" });
    } catch (err) {
      notifyError(err, "Couldn't exit the group.");
    }
  }

  // The last group of actions: leaving a group, or hiding the row. A group's owner gets neither, so no divider then.
  const tail: DropdownMenuItem[] = [
    ...(canExit ? [{ key: "exit", label: "Exit group", icon: <Icon as={LogOut} size={22} className={ICON} />, onSelect: () => setDialog("exit"), variant: "danger" as const }] : []),
    ...(group ? [] : [{ key: "remove", label: `Remove from ${listName}`, icon: <Icon as={EyeOff} size={22} className={ICON} />, onSelect: () => setDialog("remove") }]),
  ];

  const items: (DropdownMenuItem | "divider")[] = [
    ...(extraItems?.length ? ([...extraItems, "divider"] as (DropdownMenuItem | "divider")[]) : []),
    { key: "pin", label: pinned ? "Unpin from top" : "Pin to top", icon: <Icon as={pinned ? PinOff : Pin} size={22} className={ICON} />, onSelect: togglePin },
    { key: "mute", label: muted ? "Unmute updates" : "Mute updates", icon: <Icon as={muted ? Bell : BellOff} size={22} className={ICON} />, onSelect: toggleMute },
    "divider",
    { key: "share-in", label: "Share in Ako", icon: <Icon as={Send} size={22} className={ICON} />, onSelect: () => setDialog("share") },
    { key: "share-out", label: "Share outside Ako", icon: <Icon as={Share2} size={22} className={ICON} />, onSelect: () => void shareOutside() },
    { key: "copy", label: "Copy link", icon: <Icon as={Link2} size={22} className={ICON} />, onSelect: () => void copyLink() },
    ...(tail.length ? (["divider", ...tail] as (DropdownMenuItem | "divider")[]) : []),
  ];

  return (
    <>
      <Pressable ref={triggerRef} onPress={() => setDialog("menu")} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Options for ${title}`} className="p-1">
        <Icon as={MoreHorizontal} size={20} className="text-ink-muted" />
      </Pressable>

      {dialog === "menu" ? <DropdownMenu title={title} anchorRef={triggerRef} onClose={() => setDialog(null)} width={224} items={items} /> : null}

      {dialog === "share" ? (
        <ShareProjectSheet
          projectId={projectId}
          title={title}
          slug={slug}
          onClose={() => setDialog(null)}
          onSent={() => {
            setDialog(null);
            toast("Shared.", { variant: "success" });
          }}
        />
      ) : null}

      {dialog === "remove" ? (
        <ConfirmDialog
          themed
          danger={false}
          title={`Remove from ${listName}?`}
          description={removeDescription ?? "This only takes it off this list. Your access doesn't change."}
          confirmLabel="Remove"
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            setDialog(null);
            void removeNow();
          }}
        />
      ) : null}

      {dialog === "exit" ? (
        <ConfirmDialog
          themed
          title="Exit this group?"
          description="You'll stop getting its messages and meetings. You can ask to join again later."
          confirmLabel="Exit group"
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            setDialog(null);
            void exitNow();
          }}
        />
      ) : null}
    </>
  );
}
