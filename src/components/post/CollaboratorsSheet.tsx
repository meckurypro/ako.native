// src/components/post/CollaboratorsSheet.tsx
// Invite collaborators to be credited on a post/project. For projects, an extra
// step assigns each invitee an optional role (what they contributed as).
import { Check, ChevronDown, UserPlus } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Sheet, useSheet } from "@/components/ui/Sheet";
import { SheetCancel, SheetCaption, SheetRow } from "@/components/ui/SheetParts";
import { SheetFrame } from "@/components/ui/SheetFrame";
import { Icon } from "@/components/ui/styled";
import { useToast } from "@/components/ui/Toast";
import { Text } from "@/components/ui/Text";
import {
  useCollaborators,
  useRemoveCollaborator,
  useSendCollaborationRequest,
  type CollaborationTarget,
} from "@/hooks/useCollaboration";
import type { MentionCandidate } from "@/hooks/useMentions";
import { useGigRolesByCategory } from "@/hooks/usePortfolio";
import { PeoplePicker } from "./PeoplePicker";

const STATUS_LABEL: Record<string, string> = {
  invited: "Pending",
  accepted: "Collaborator",
  declined: "Declined",
};

type RoleGroups = ReturnType<typeof useGigRolesByCategory>["grouped"];

/** Native replacement for the web's <select> of roles, grouped by category. */
function RolePickerSheet({
  groups,
  value,
  onSelect,
  onClose,
}: {
  groups: RoleGroups;
  value: string;
  onSelect: (roleId: string) => void;
  onClose: () => void;
}) {
  return (
    <Sheet onClose={onClose} dragZone="handle" zIndex={70} maxHeightRatio={0.7} accessibilityLabel="Choose a role">
      <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false}>
        <SheetRow label="No role" onPress={() => onSelect("")} icon={value === "" ? <Icon as={Check} size={16} className="text-accent" /> : undefined} />
        {[...groups.entries()].map(([category, roles]) => (
          <View key={category}>
            <SheetCaption>{category}</SheetCaption>
            {roles.map((role) => (
              <SheetRow
                key={role.id}
                label={role.label}
                onPress={() => onSelect(role.id)}
                icon={value === role.id ? <Icon as={Check} size={16} className="text-accent" /> : undefined}
              />
            ))}
          </View>
        ))}
      </ScrollView>
      <SheetCancel />
    </Sheet>
  );
}

export function CollaboratorsSheet({ target, targetId, onClose }: { target: CollaborationTarget; targetId: string; onClose: () => void }) {
  const { data: collaborators, isLoading } = useCollaborators(target, targetId);
  const sendRequest = useSendCollaborationRequest(target);
  const removeCollaborator = useRemoveCollaborator(target);
  const { grouped: roleGroups, roles: allRoles } = useGigRolesByCategory() as ReturnType<typeof useGigRolesByCategory> & {
    roles?: { id: string; label: string }[];
  };
  const [showPicker, setShowPicker] = useState(false);
  const [pendingInvitees, setPendingInvitees] = useState<MentionCandidate[] | null>(null);
  const [roleAssignments, setRoleAssignments] = useState<Record<string, string>>({});
  const [rolePickerFor, setRolePickerFor] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  function roleLabel(roleId: string | undefined): string {
    if (!roleId) return "No role";
    for (const roles of roleGroups.values()) {
      const hit = roles.find((r) => r.id === roleId);
      if (hit) return hit.label;
    }
    return allRoles?.find((r) => r.id === roleId)?.label ?? "No role";
  }

  function handlePickerConfirm(selected: MentionCandidate[]) {
    if (target === "project") {
      setPendingInvitees(selected);
      setShowPicker(false);
      return;
    }
    sendInvites(selected, {});
  }

  function sendInvites(people: MentionCandidate[], roles: Record<string, string>) {
    setError(null);
    setSending(true);
    Promise.all(people.map((p) => sendRequest.mutateAsync({ targetId, userId: p.id, roleId: roles[p.id] })))
      .then(() => {
        setShowPicker(false);
        setPendingInvitees(null);
        setRoleAssignments({});
        toast(people.length > 1 ? "Invites sent." : "Invite sent.", { variant: "success" });
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't send one or more invites."))
      .finally(() => setSending(false));
  }

  return (
    <>
      <SheetFrame
        title={pendingInvitees ? "Assign roles" : "Collaborators"}
        subtitle={
          pendingInvitees
            ? "Optional — what each person contributed as. Helps their work surface on their profile."
            : `Invite others to be credited as collaborators on this ${target}.`
        }
        onBack={pendingInvitees ? () => setPendingInvitees(null) : undefined}
        onClose={onClose}
        footer={
          pendingInvitees ? (
            <Button onPress={() => sendInvites(pendingInvitees, roleAssignments)} loading={sending}>
              {pendingInvitees.length > 1 ? "Send invites" : "Send invite"}
            </Button>
          ) : (
            <Pressable
              onPress={() => setShowPicker(true)}
              accessibilityRole="button"
              className="flex-row items-center justify-center gap-2 rounded-full bg-accent py-3 active:bg-accent-hover"
            >
              <Icon as={UserPlus} size={16} className="text-canvas" />
              <Text className="text-sm font-medium text-canvas">Invite collaborators</Text>
            </Pressable>
          )
        }
      >
        {pendingInvitees ? (
          <View className="gap-2">
            {pendingInvitees.map((p) => (
              <View key={p.id} className="flex-row items-center gap-3 rounded-xl border border-border bg-canvas p-2">
                <Avatar src={p.avatar_url} name={p.display_name} size="sm" />
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="text-sm font-medium text-ink">
                    {p.display_name}
                  </Text>
                  <Pressable onPress={() => setRolePickerFor(p.id)} accessibilityRole="button" className="flex-row items-center gap-1">
                    <Text numberOfLines={1} className="shrink text-xs text-ink-muted">
                      {roleLabel(roleAssignments[p.id])}
                    </Text>
                    <Icon as={ChevronDown} size={12} className="text-ink-muted" />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : isLoading ? (
          <Text className="py-10 text-center text-sm text-ink-muted">Loading…</Text>
        ) : !collaborators || collaborators.length === 0 ? (
          <Text className="py-10 text-center text-sm text-ink-muted">No collaborators yet.</Text>
        ) : (
          <View className="gap-1">
            {collaborators.map((c) => (
              <View key={c.user.id} className="flex-row items-center gap-3 px-1 py-2">
                <Avatar src={c.user.avatar_url} name={c.user.display_name} size="sm" />
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="text-sm font-medium text-ink">
                    {c.user.display_name}
                    {c.role_label ? <Text className="font-normal text-ink-muted">{` — ${c.role_label}`}</Text> : null}
                  </Text>
                  <Text numberOfLines={1} className="text-xs text-ink-muted">
                    {STATUS_LABEL[c.status] ?? c.status}
                  </Text>
                </View>
                <Pressable
                  onPress={() =>
                    removeCollaborator.mutate(
                      { targetId, userId: c.user.id },
                      { onSuccess: () => toast(`${c.user.display_name} removed.`, { variant: "success" }) }
                    )
                  }
                  accessibilityRole="button"
                  hitSlop={8}
                  className="px-2 py-1"
                >
                  <Text className="text-xs text-danger">Remove</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
        {error ? <Text className="mt-2 text-sm text-danger">{error}</Text> : null}
      </SheetFrame>

      {showPicker ? (
        <PeoplePicker
          title="Invite collaborators"
          subtitle="They'll get a request to accept before they're credited."
          confirmLabel={target === "project" ? "Next" : "Send invites"}
          onConfirm={handlePickerConfirm}
          onClose={() => setShowPicker(false)}
        />
      ) : null}

      {rolePickerFor ? (
        <RolePickerSheet
          groups={roleGroups}
          value={roleAssignments[rolePickerFor] ?? ""}
          onSelect={(roleId) => setRoleAssignments((prev) => ({ ...prev, [rolePickerFor]: roleId }))}
          onClose={() => setRolePickerFor(null)}
        />
      ) : null}
    </>
  );
}
