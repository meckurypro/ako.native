// src/components/project/ForewordInviteModal.tsx
// What the person asked to write a foreword sees: the invite, a way to read the work first, decline (final), or write.
// The same dialog handles the writer's later visits — edit a submitted or published foreword, or withdraw it.
// Mirrors the web modal.
import { router, type Href } from "expo-router";
import { BookOpen } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { Avatar } from "@/components/ui/Avatar";
import { Modal } from "@/components/ui/Modal";
import { SurfaceInput } from "@/components/ui/SurfaceInput";
import { Icon, Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import {
  FOREWORD_CREDIT_MAX,
  FOREWORD_DISCLOSURE_MAX,
  FOREWORD_MAX,
  FOREWORD_MIN,
  canPreviewWithForeword,
  isInviteOpen,
  useDeclineForeword,
  useForewordInviter,
  useMyForeword,
  useSubmitForeword,
  useWithdrawForeword,
  validateForewordBody,
  type Foreword,
} from "@/hooks/useForewords";
import { useProject } from "@/hooks/useProjects";
import { haptics } from "@/lib/haptics";

type Mode = "overview" | "compose" | "confirm-decline" | "confirm-withdraw";

function ClosedNotice({ foreword, onClose }: { foreword: Foreword | null | undefined; onClose: () => void }) {
  let message = "This invite isn't open anymore.";
  if (!foreword) message = "We couldn't find an invite for this project.";
  else if (foreword.status === "declined") message = "You declined this invite.";
  else if (foreword.status === "withdrawn") message = "You withdrew your foreword.";
  else if (foreword.status === "rejected") message = "The creator chose not to publish this foreword.";
  else if (foreword.status === "revoked") message = "The creator cancelled this invite.";
  else if (foreword.status === "invited") message = "This invite has expired.";
  return (
    <View className="items-center py-4">
      <Text className="text-center text-sm text-ink-muted">{message}</Text>
      <Pressable onPress={onClose} accessibilityRole="button" className="mt-4 w-full items-center rounded-full border border-border py-2.5">
        <Text className="text-sm font-medium text-ink">Close</Text>
      </Pressable>
    </View>
  );
}

export function ForewordInviteModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const toast = useToast();
  const { data: foreword, isLoading } = useMyForeword(projectId);
  const { data: project } = useProject(foreword && canPreviewWithForeword(foreword) ? projectId : undefined);
  const { data: inviter } = useForewordInviter(foreword?.invited_by);
  const submit = useSubmitForeword(projectId);
  const decline = useDeclineForeword(projectId);
  const withdraw = useWithdrawForeword(projectId);

  const [mode, setMode] = useState<Mode>("overview");
  const [body, setBody] = useState("");
  const [creditLine, setCreditLine] = useState("");
  const [disclosure, setDisclosure] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isBook = project?.project_type === "book";
  const noun = project ? (isBook ? "book" : "course") : "project";
  const readPath = project ? (isBook ? `/books/${projectId}` : `/courses/${projectId}`) : `/projects/${projectId}`;
  const open = !!foreword && canPreviewWithForeword(foreword);
  const hasWritten = foreword?.status === "submitted" || foreword?.status === "approved";
  const busy = submit.isPending || decline.isPending || withdraw.isPending;
  const trimmedLength = body.trim().length;

  function startCompose() {
    setError(null);
    setBody(foreword?.body ?? "");
    setCreditLine(foreword?.credit_line ?? "");
    setDisclosure(foreword?.disclosure ?? "");
    setMode("compose");
  }

  function handleSubmit() {
    const problem = validateForewordBody(body);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    submit.mutate(
      { body: body.trim(), creditLine, disclosure },
      {
        onSuccess: () => {
          haptics.success();
          toast(hasWritten ? "Sent for the creator to review." : "Foreword sent to the creator.", { variant: "success" });
          onClose();
        },
        onError: (err) => setError(err instanceof Error ? err.message : "Couldn't send your foreword."),
      }
    );
  }

  function handleDecline() {
    setError(null);
    decline.mutate(undefined, {
      onSuccess: () => {
        toast("Invite declined.", { variant: "success" });
        onClose();
      },
      onError: (err) => setError(err instanceof Error ? err.message : "Couldn't decline this invite."),
    });
  }

  function handleWithdraw() {
    setError(null);
    withdraw.mutate(undefined, {
      onSuccess: () => {
        toast("Foreword withdrawn.", { variant: "success" });
        onClose();
      },
      onError: (err) => setError(err instanceof Error ? err.message : "Couldn't withdraw your foreword."),
    });
  }

  return (
    <Modal onClose={onClose} bare scrim="canvas" align={mode === "compose" ? "bottom" : "center"}>
      <View className="max-h-full rounded-2xl border border-border bg-surface p-5">
        <ScrollView showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {isLoading ? (
            <Text className="py-6 text-center text-sm text-ink-muted">Loading…</Text>
          ) : !foreword || !open ? (
            <ClosedNotice foreword={foreword} onClose={onClose} />
          ) : (
            <>
              <View className="flex-row items-center gap-3">
                <Avatar src={inviter?.avatar_url ?? null} name={inviter?.display_name ?? "?"} size="md" />
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="font-medium text-ink">
                    {inviter?.display_name ?? "A creator"}
                  </Text>
                  <Text className="text-sm text-ink-muted">{hasWritten ? `Your foreword for their ${noun}` : `Asked you to write a foreword for their ${noun}`}</Text>
                </View>
              </View>

              {project ? (
                <View className="mt-3 flex-row items-center gap-3 rounded-xl border border-border bg-canvas px-3.5 py-3">
                  {project.thumbnail_url ? (
                    <Image source={project.thumbnail_url} contentFit="cover" className={`w-12 shrink-0 rounded-lg border border-border ${isBook ? "h-[72px]" : "h-12"}`} />
                  ) : (
                    <View className="h-12 w-12 shrink-0 rounded-lg border border-border bg-surface" />
                  )}
                  <View className="min-w-0 flex-1">
                    <Text numberOfLines={1} className="font-display text-sm font-semibold text-ink">
                      {project.title}
                    </Text>
                    {project.description ? (
                      <Text numberOfLines={2} className="text-xs text-ink-muted">
                        {project.description}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ) : null}

              {mode === "overview" ? (
                <>
                  {foreword.invite_note ? <Text className="mt-3 rounded-xl border border-border bg-canvas px-3.5 py-3 text-sm text-ink">{foreword.invite_note}</Text> : null}

                  {hasWritten ? (
                    <View className="mt-3 rounded-xl border border-border bg-canvas px-3.5 py-3">
                      <Text className="mb-1 text-xs font-medium text-ink-muted">
                        {foreword.status === "approved"
                          ? "Published"
                          : foreword.published_body
                            ? "Your edit is waiting for review — the published version stays live"
                            : "Waiting for the creator's review"}
                      </Text>
                      <Text className="text-sm text-ink">{foreword.body}</Text>
                    </View>
                  ) : null}

                  {isInviteOpen(foreword) ? <Text className="mt-3 text-xs text-ink-muted">You can read the {noun} first. Declining is final, and the creator isn't told why.</Text> : null}
                  {error ? <Text className="mt-3 text-sm text-danger">{error}</Text> : null}

                  <Pressable
                    onPress={() => {
                      onClose();
                      router.push(readPath as Href);
                    }}
                    accessibilityRole="button"
                    className="mt-4 w-full flex-row items-center justify-center gap-2 rounded-full border border-border py-2.5"
                  >
                    <Icon as={BookOpen} size={15} className="text-ink" />
                    <Text className="text-sm font-medium text-ink">{isBook ? "Read the book" : project ? "Open the course" : "Open"}</Text>
                  </Pressable>

                  <View className="mt-2 flex-row items-center gap-2">
                    {hasWritten ? (
                      <>
                        <Pressable onPress={() => setMode("confirm-withdraw")} accessibilityRole="button" className="flex-1 items-center rounded-full border border-border py-2.5">
                          <Text className="text-sm font-medium text-danger">Withdraw</Text>
                        </Pressable>
                        <Pressable onPress={startCompose} accessibilityRole="button" className="flex-1 items-center rounded-full bg-accent py-2.5">
                          <Text className="text-sm font-medium text-canvas">Edit</Text>
                        </Pressable>
                      </>
                    ) : (
                      <>
                        <Pressable onPress={() => setMode("confirm-decline")} accessibilityRole="button" className="flex-1 items-center rounded-full border border-border py-2.5">
                          <Text className="text-sm font-medium text-ink">Decline</Text>
                        </Pressable>
                        <Pressable onPress={startCompose} accessibilityRole="button" className="flex-1 items-center rounded-full bg-accent py-2.5">
                          <Text className="text-sm font-medium text-canvas">Write it</Text>
                        </Pressable>
                      </>
                    )}
                  </View>
                </>
              ) : null}

              {mode === "compose" ? (
                <View className="mt-4 gap-3">
                  <SurfaceInput
                    label="Your foreword"
                    rows={8}
                    value={body}
                    onChangeText={(t) => setBody(t.slice(0, FOREWORD_MAX))}
                    placeholder={`Why does this ${noun} matter, and who is it for? Speak as yourself.`}
                    autoFocus
                  >
                    <Text className={`mt-1 text-right text-[11px] ${trimmedLength > 0 && trimmedLength < FOREWORD_MIN ? "text-danger" : "text-ink-muted"}`}>
                      {trimmedLength}/{FOREWORD_MAX.toLocaleString()} · at least {FOREWORD_MIN}
                    </Text>
                  </SurfaceInput>
                  <SurfaceInput
                    label="Credit line (optional)"
                    value={creditLine}
                    onChangeText={(t) => setCreditLine(t.slice(0, FOREWORD_CREDIT_MAX))}
                    placeholder="e.g. Author of Things Fall Apart"
                  />
                  <SurfaceInput
                    label="Connection to disclose (optional)"
                    value={disclosure}
                    onChangeText={(t) => setDisclosure(t.slice(0, FOREWORD_DISCLOSURE_MAX))}
                    placeholder="e.g. The author is a close friend."
                  >
                    <Text className="mt-1 text-[11px] text-ink-muted">Readers trust a foreword more when they know any relationship you have with the creator.</Text>
                  </SurfaceInput>
                  <Text className="text-xs text-ink-muted">
                    No links.{" "}
                    {hasWritten
                      ? "Your edit goes back to the creator for approval; the current version stays live until then."
                      : "The creator approves it before it appears, and they can't change your words."}
                  </Text>
                  {error ? <Text className="text-sm text-danger">{error}</Text> : null}
                  <View className="flex-row items-center gap-2">
                    <Pressable
                      onPress={() => {
                        setError(null);
                        setMode("overview");
                      }}
                      disabled={busy}
                      accessibilityRole="button"
                      className={`flex-1 items-center rounded-full border border-border py-2.5 ${busy ? "opacity-60" : ""}`}
                    >
                      <Text className="text-sm font-medium text-ink">Back</Text>
                    </Pressable>
                    <Pressable onPress={handleSubmit} disabled={busy} accessibilityRole="button" className={`flex-1 items-center rounded-full bg-accent py-2.5 ${busy ? "opacity-60" : ""}`}>
                      <Text className="text-sm font-medium text-canvas">{submit.isPending ? "Sending…" : hasWritten ? "Send edit" : "Send foreword"}</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}

              {mode === "confirm-decline" || mode === "confirm-withdraw" ? (
                <View className="mt-4">
                  <Text className="text-sm text-ink">
                    {mode === "confirm-decline"
                      ? "Decline this invite? This is final — the creator won't be able to ask you again."
                      : `Withdraw your foreword? It comes out of the ${noun}, and you'd need a new invite to write it again.`}
                  </Text>
                  {error ? <Text className="mt-2 text-sm text-danger">{error}</Text> : null}
                  <View className="mt-4 flex-row items-center gap-2">
                    <Pressable
                      onPress={() => {
                        setError(null);
                        setMode("overview");
                      }}
                      disabled={busy}
                      accessibilityRole="button"
                      className={`flex-1 items-center rounded-full border border-border py-2.5 ${busy ? "opacity-60" : ""}`}
                    >
                      <Text className="text-sm font-medium text-ink">Keep it</Text>
                    </Pressable>
                    <Pressable
                      onPress={mode === "confirm-decline" ? handleDecline : handleWithdraw}
                      disabled={busy}
                      accessibilityRole="button"
                      className={`flex-1 items-center rounded-full bg-danger py-2.5 ${busy ? "opacity-60" : ""}`}
                    >
                      <Text className="text-sm font-medium text-canvas">{mode === "confirm-decline" ? "Decline" : "Withdraw"}</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
