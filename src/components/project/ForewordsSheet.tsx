// src/components/project/ForewordsSheet.tsx
// The creator's Forewords panel for a book or course: invite someone to preview it and write a foreword, then approve,
// decline or remove what comes back. The creator never edits a foreword — only the writer can. Mirrors the web sheet.
import { Lock, UserPlus } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { PeoplePicker } from "@/components/post/PeoplePicker";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SheetFrame } from "@/components/ui/SheetFrame";
import { SurfaceInput } from "@/components/ui/SurfaceInput";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import {
  FOREWORD_MAX_LIVE,
  FOREWORD_NOTE_MAX,
  FOREWORD_STATUS_LABEL,
  isInviteOpen,
  isLiveForeword,
  useInviteForeword,
  useProjectForewords,
  useReviewForeword,
  useRevokeForeword,
  type ForewordWithInvitee,
} from "@/hooks/useForewords";
import type { MentionCandidate } from "@/hooks/useMentions";
import { haptics } from "@/lib/haptics";
import { friendlyError } from "@/lib/friendlyError";

function daysLeft(expiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000));
}

function ForewordRow({
  f,
  busy,
  noun,
  onApprove,
  onReject,
  onRemove,
  onRevoke,
}: {
  f: ForewordWithInvitee;
  busy: boolean;
  noun: string;
  onApprove: () => void;
  onReject: () => void;
  onRemove: () => void;
  onRevoke: () => void;
}) {
  const person = f.invitee;
  const expired = f.status === "invited" && !isInviteOpen(f);
  const isUpdate = f.status === "submitted" && !!f.published_body;

  let label: string = FOREWORD_STATUS_LABEL[f.status];
  if (f.status === "invited") label = expired ? "Invite expired" : `Invited · ${daysLeft(f.expires_at)}d left`;
  if (isUpdate) label = "Edit awaiting your review";

  return (
    <View className="rounded-xl border border-border bg-canvas p-3">
      <View className="flex-row items-center gap-3">
        <Avatar src={person?.avatar_url ?? null} name={person?.display_name ?? "?"} size="sm" />
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-sm font-medium text-ink">
            {person?.display_name ?? "Unknown"}
          </Text>
          <Text numberOfLines={1} className={`text-xs ${f.status === "submitted" ? "font-medium text-accent" : "text-ink-muted"}`}>
            {label}
          </Text>
        </View>
        {f.status === "invited" && !expired ? (
          <Pressable onPress={onRevoke} disabled={busy} accessibilityRole="button" hitSlop={8} className={`px-2 py-1 ${busy ? "opacity-50" : ""}`}>
            <Text className="text-xs text-danger">Cancel</Text>
          </Pressable>
        ) : null}
        {f.status === "approved" || isUpdate ? (
          <Pressable onPress={onRemove} disabled={busy} accessibilityRole="button" hitSlop={8} className={`px-2 py-1 ${busy ? "opacity-50" : ""}`}>
            <Text className="text-xs text-danger">Remove</Text>
          </Pressable>
        ) : null}
      </View>

      {f.status === "submitted" && f.body ? (
        <>
          <Text className="mt-2 text-sm text-ink">{f.body}</Text>
          {f.credit_line || f.disclosure ? (
            <Text className="mt-2 text-xs italic text-ink-muted">{[f.credit_line, f.disclosure].filter(Boolean).join(" · ")}</Text>
          ) : null}
          {isUpdate ? <Text className="mt-2 text-xs text-ink-muted">The version already in your {noun} stays live until you approve this one.</Text> : null}
          <View className="mt-3 flex-row items-center gap-2">
            <Pressable
              onPress={onReject}
              disabled={busy}
              accessibilityRole="button"
              className={`flex-1 items-center rounded-full border border-border py-2 ${busy ? "opacity-60" : ""}`}
            >
              <Text className="text-sm font-medium text-ink">Decline</Text>
            </Pressable>
            <Pressable onPress={onApprove} disabled={busy} accessibilityRole="button" className={`flex-1 items-center rounded-full bg-cta py-2 ${busy ? "opacity-60" : ""}`}>
              <Text className="text-sm font-medium text-white">Approve</Text>
            </Pressable>
          </View>
        </>
      ) : null}

      {f.status === "approved" && f.published_body ? (
        <>
          <Text className="mt-2 text-sm text-ink">{f.published_body}</Text>
          {f.published_credit_line || f.published_disclosure ? (
            <Text className="mt-2 text-xs italic text-ink-muted">{[f.published_credit_line, f.published_disclosure].filter(Boolean).join(" · ")}</Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

export function ForewordsSheet({ projectId, projectType, onClose }: { projectId: string; projectType: "book" | "course"; onClose: () => void }) {
  const { data: forewords, isLoading } = useProjectForewords(projectId);
  const invite = useInviteForeword(projectId);
  const review = useReviewForeword(projectId);
  const revoke = useRevokeForeword(projectId);
  const toast = useToast();

  const [showPicker, setShowPicker] = useState(false);
  const [pending, setPending] = useState<MentionCandidate[] | null>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<ForewordWithInvitee | null>(null);

  const noun = projectType === "book" ? "book" : "course";
  const sectionNoun = projectType === "book" ? "chapter" : "module";
  const visible = (forewords ?? []).filter((f) => f.status !== "revoked");
  const live = (forewords ?? []).filter(isLiveForeword).length;
  const slotsLeft = Math.max(0, FOREWORD_MAX_LIVE - live);
  const busy = review.isPending || revoke.isPending;

  // Pending first (they need a decision), then published, then invited, then the rest.
  const rank = (f: ForewordWithInvitee) => (f.status === "submitted" ? 0 : f.status === "approved" ? 1 : isInviteOpen(f) ? 2 : 3);
  const sorted = visible.slice().sort((a, b) => rank(a) - rank(b));

  function handlePickerConfirm(selected: MentionCandidate[]) {
    const people = selected.filter((p) => p.kind === "profile");
    setShowPicker(false);
    if (people.length === 0) return;
    setError(null);
    if (people.length > slotsLeft) {
      setError(slotsLeft === 0 ? `You already have ${FOREWORD_MAX_LIVE} forewords in progress.` : `You can invite ${slotsLeft} more right now.`);
      return;
    }
    setPending(people);
  }

  async function sendInvites() {
    if (!pending) return;
    setError(null);
    setSending(true);
    const failures: string[] = [];
    for (const person of pending) {
      try {
        await invite.mutateAsync({ inviteeId: person.id, note });
      } catch (err) {
        failures.push(`${person.display_name}: ${friendlyError(err, "couldn't invite.")}`);
      }
    }
    setSending(false);
    if (failures.length === 0) {
      haptics.success();
      toast(pending.length > 1 ? "Invites sent." : "Invite sent.", { variant: "success" });
      setPending(null);
      setNote("");
    } else {
      setError(failures.join(" "));
      // Keep only the ones that failed so a retry doesn't re-send the rest.
      setPending((prev) => (prev ? prev.filter((p) => failures.some((m) => m.startsWith(`${p.display_name}:`))) : prev));
    }
  }

  function decide(f: ForewordWithInvitee, action: "approve" | "reject" | "remove") {
    setError(null);
    review.mutate(
      { forewordId: f.id, action },
      {
        onSuccess: () => {
          if (action === "approve") haptics.success();
          toast(action === "approve" ? `Added to your ${noun}.` : action === "remove" ? "Foreword removed." : "Foreword declined.", { variant: "success" });
        },
        onError: (err) => setError(friendlyError(err, "Couldn't update this foreword.")),
      }
    );
  }

  return (
    <>
      <SheetFrame
        title={pending ? "Add a note" : "Forewords"}
        subtitle={pending ? "Optional — tell them why you'd like their words." : `Invite someone to read your ${noun} and write a few words to open it. It appears in a locked ${sectionNoun}.`}
        onBack={pending ? () => setPending(null) : undefined}
        onClose={onClose}
        avoidKeyboard
        footer={
          pending ? (
            <Button onPress={sendInvites} loading={sending}>
              {pending.length > 1 ? "Send invites" : "Send invite"}
            </Button>
          ) : (
            <View>
              <Pressable
                onPress={() => setShowPicker(true)}
                disabled={slotsLeft === 0}
                accessibilityRole="button"
                className={`flex-row items-center justify-center gap-2 rounded-full bg-cta py-3 active:opacity-85 ${slotsLeft === 0 ? "opacity-50" : ""}`}
              >
                <Icon as={UserPlus} size={16} className="text-white" />
                <Text className="text-sm font-medium text-white">Invite someone</Text>
              </Pressable>
              <Text className="mt-2 text-center text-[11px] text-ink-muted">
                {slotsLeft === 0 ? `You have ${FOREWORD_MAX_LIVE} forewords in progress — remove or wait for one to invite another.` : `${live} of ${FOREWORD_MAX_LIVE} in progress`}
              </Text>
            </View>
          )
        }
      >
        {pending ? (
          <View className="gap-3">
            <View className="flex-row flex-wrap gap-2">
              {pending.map((p) => (
                <View key={p.id} className="flex-row items-center gap-2 rounded-full border border-border bg-canvas px-2.5 py-1.5">
                  <Avatar src={p.avatar_url} name={p.display_name} size="sm" />
                  <Text className="text-xs text-ink">{p.display_name}</Text>
                </View>
              ))}
            </View>
            <SurfaceInput
              label="Note (optional)"
              rows={4}
              value={note}
              onChangeText={(t) => setNote(t.slice(0, FOREWORD_NOTE_MAX))}
              placeholder={`Why I'd love your words on this ${noun}…`}
            >
              <Text className="mt-1 text-right text-[11px] text-ink-muted">
                {note.length}/{FOREWORD_NOTE_MAX}
              </Text>
            </SurfaceInput>
            <Text className="text-xs text-ink-muted">
              They can read the {noun} before answering, and the invite lasts 30 days. If they decline, you won't be able to ask again.
            </Text>
          </View>
        ) : isLoading ? (
          <Text className="py-10 text-center text-sm text-ink-muted">Loading…</Text>
        ) : sorted.length === 0 ? (
          <Text className="py-10 text-center text-sm text-ink-muted">No forewords yet.</Text>
        ) : (
          <View className="gap-2">
            {sorted.map((f) => (
              <ForewordRow
                key={f.id}
                f={f}
                busy={busy}
                noun={noun}
                onApprove={() => decide(f, "approve")}
                onReject={() => decide(f, "reject")}
                onRemove={() => setConfirmRemove(f)}
                onRevoke={() =>
                  revoke.mutate(f.id, {
                    onSuccess: () => toast("Invite cancelled.", { variant: "success" }),
                    onError: (err) => setError(friendlyError(err, "Couldn't cancel the invite.")),
                  })
                }
              />
            ))}
          </View>
        )}
        {!pending && sorted.length > 0 ? (
          <View className="mt-4 flex-row items-start gap-1.5">
            <Icon as={Lock} size={12} className="mt-0.5 text-ink-muted" />
            <Text className="flex-1 text-xs text-ink-muted">You can approve, decline or remove a foreword, but only its writer can edit it.</Text>
          </View>
        ) : null}
        {error ? <Text className="mt-3 text-sm text-danger">{error}</Text> : null}
      </SheetFrame>

      {showPicker ? (
        <PeoplePicker
          title="Invite for a foreword"
          subtitle="Choose people on Akọ. They'll get a request they can answer or decline."
          confirmLabel="Next"
          onConfirm={handlePickerConfirm}
          onClose={() => setShowPicker(false)}
        />
      ) : null}

      {confirmRemove ? (
        <ConfirmDialog
          title="Remove this foreword?"
          description={`It comes out of your ${noun} right away, and ${confirmRemove.invitee?.display_name ?? "the writer"} can't be asked to write again.`}
          confirmLabel="Remove"
          themed
          onConfirm={() => {
            const f = confirmRemove;
            setConfirmRemove(null);
            decide(f, "remove");
          }}
          onCancel={() => setConfirmRemove(null)}
        />
      ) : null}
    </>
  );
}
