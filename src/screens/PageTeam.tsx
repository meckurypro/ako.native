// src/screens/PageTeam.tsx
// Manage a Page's team (admins only): invite people with a role, cancel pending
// invites, promote / demote admins, remove members.
import { Check, Search, ShieldCheck, X } from "lucide-react-native";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/hooks/useAuth";
import { useInvitePageMember, usePageByUsername, usePageMembers, usePageRoleLabelSuggestions, useRemovePageMember, useUpdatePageMemberRole } from "@/hooks/usePages";
import { useSearchPeople } from "@/hooks/useSearch";
import { useTheme } from "@/theme/ThemeProvider";
import type { ProfileWithRoles } from "@/types/database";

function Person({ src, name, children }: { src: string | null; name: string; children: React.ReactNode }) {
  return (
    <View className="flex-row items-center gap-3 p-4">
      <Avatar src={src} name={name} size="sm" />
      {children}
    </View>
  );
}

export function PageTeam() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user } = useAuth();

  const { data: page } = usePageByUsername(username ?? "");
  const { data: members } = usePageMembers(page?.id ?? "");
  const invite = useInvitePageMember();
  const remove = useRemovePageMember();
  const updateRole = useUpdatePageMemberRole();
  const toast = useToast();

  const [query, setQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<ProfileWithRoles | null>(null);
  const [inviteRole, setInviteRole] = useState("");
  const [showRoleSuggestions, setShowRoleSuggestions] = useState(false);
  const [inviteAsAdmin, setInviteAsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: searchResults, isLoading: searching } = useSearchPeople(query);
  const { data: roleSuggestions } = usePageRoleLabelSuggestions(inviteRole);

  const myMembership = members?.find((m) => m.user_id === user?.id && m.status === "active");
  const isAdmin = !!myMembership?.is_admin;
  const active = (members ?? []).filter((m) => m.status === "active");
  const pending = (members ?? []).filter((m) => m.status === "invited");
  const existingIds = new Set([...active, ...pending].map((m) => m.user_id));
  const results = (searchResults ?? []).filter((p) => !existingIds.has(p.id));

  async function handleInvite() {
    setError(null);
    if (!page || !selectedUser || !inviteRole.trim()) return;
    setSubmitting(true);
    try {
      await invite.mutateAsync({ page_id: page.id, user_id: selectedUser.id, role_label: inviteRole.trim(), is_admin: inviteAsAdmin });
      setSelectedUser(null);
      setInviteRole("");
      setShowRoleSuggestions(false);
      setInviteAsAdmin(false);
      toast("Invite sent.", { variant: "success" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send that invite.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!page) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <Text className="text-ink-muted">Loading…</Text>
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View className="flex-1 bg-canvas">
        <ScreenHeader title="" />
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-ink-muted">Only a {page.name} admin can manage its team.</Text>
        </View>
      </View>
    );
  }

  const inputClass = "rounded-xl bg-canvas px-4 py-2.5 text-sm text-ink";

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 bg-canvas">
      <ScreenHeader title={`${page.name} team`} />
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 40 }}>
        <View className="w-full max-w-md self-center">
          <View className="mb-6 gap-3 rounded-2xl bg-surface p-4">
            <Text className="text-xs font-medium uppercase tracking-wide text-ink-muted">Invite someone</Text>

            {selectedUser ? (
              <View className="flex-row items-center gap-3 rounded-xl bg-canvas px-3 py-2.5">
                <Avatar src={selectedUser.avatar_url} name={selectedUser.display_name} size="sm" />
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="text-sm text-ink">
                    {selectedUser.display_name}
                  </Text>
                  <Text numberOfLines={1} className="text-xs text-ink-muted">
                    @{selectedUser.username}
                  </Text>
                </View>
                <Pressable onPress={() => setSelectedUser(null)} accessibilityRole="button" accessibilityLabel="Change selected user" hitSlop={10}>
                  <Icon as={X} size={16} className="text-ink-muted" />
                </Pressable>
              </View>
            ) : (
              <View>
                <View className="flex-row items-center rounded-xl bg-canvas px-3.5">
                  <Icon as={Search} size={15} className="shrink-0 text-ink-muted" />
                  <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search by username or name…"
                    placeholderTextColor={colors.inkMuted}
                    selectionColor={colors.accent}
                    autoCapitalize="none"
                    autoCorrect={false}
                    className="ml-2 flex-1 py-2.5 text-sm text-ink"
                    style={{ fontFamily: "Inter_400Regular" }}
                  />
                </View>

                {query.trim().length > 1 ? (
                  <View className="mt-1 max-h-64 overflow-hidden rounded-xl border border-border bg-canvas">
                    {searching ? (
                      <Text className="py-4 text-center text-sm text-ink-muted">Searching…</Text>
                    ) : results.length === 0 ? (
                      <Text className="py-4 text-center text-sm text-ink-muted">No one found.</Text>
                    ) : (
                      <ScrollView keyboardShouldPersistTaps="always" nestedScrollEnabled>
                        {results.map((person) => (
                          <Pressable
                            key={person.id}
                            onPress={() => {
                              setSelectedUser(person);
                              setQuery("");
                            }}
                            accessibilityRole="button"
                            className="flex-row items-center gap-3 px-3 py-2.5 active:bg-surface"
                          >
                            <Avatar src={person.avatar_url} name={person.display_name} size="sm" />
                            <View className="min-w-0 flex-1">
                              <Text numberOfLines={1} className="text-sm text-ink">
                                {person.display_name}
                              </Text>
                              <Text numberOfLines={1} className="text-xs text-ink-muted">
                                @{person.username}
                              </Text>
                            </View>
                          </Pressable>
                        ))}
                      </ScrollView>
                    )}
                  </View>
                ) : null}
              </View>
            )}

            <View>
              <TextInput
                value={inviteRole}
                onChangeText={(v) => {
                  setInviteRole(v);
                  setShowRoleSuggestions(true);
                }}
                onFocus={() => setShowRoleSuggestions(true)}
                onBlur={() => setTimeout(() => setShowRoleSuggestions(false), 150)}
                placeholder="Role — e.g. Graphics Designer"
                placeholderTextColor={colors.inkMuted}
                selectionColor={colors.accent}
                maxLength={60}
                className={inputClass}
                style={{ fontFamily: "Inter_400Regular" }}
              />
              {/* Existing role titles matching what's typed; anything else is still a valid role. */}
              {showRoleSuggestions && inviteRole.trim().length > 0 && !!roleSuggestions?.length ? (
                <View className="mt-1 max-h-56 overflow-hidden rounded-xl border border-border bg-canvas">
                  <ScrollView keyboardShouldPersistTaps="always" nestedScrollEnabled>
                    {roleSuggestions.map((label) => (
                      <Pressable
                        key={label}
                        onPress={() => {
                          setInviteRole(label);
                          setShowRoleSuggestions(false);
                        }}
                        accessibilityRole="button"
                        className="px-3 py-2.5 active:bg-surface"
                      >
                        <Text numberOfLines={1} className="text-sm text-ink">
                          {label}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              ) : null}
            </View>

            <Pressable
              onPress={() => setInviteAsAdmin((v) => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: inviteAsAdmin }}
              className="flex-row items-center gap-2"
            >
              <View className={`h-5 w-5 items-center justify-center rounded border ${inviteAsAdmin ? "border-accent bg-accent" : "border-border bg-canvas"}`}>
                {inviteAsAdmin ? <Icon as={Check} size={13} strokeWidth={3} className="text-canvas" /> : null}
              </View>
              <Text className="flex-1 text-sm text-ink">Make them an admin (can post as {page.name} and manage the team)</Text>
            </Pressable>

            {error ? <Text className="text-sm text-danger">{error}</Text> : null}

            <Button onPress={() => void handleInvite()} loading={submitting} disabled={!selectedUser || !inviteRole.trim()} className="py-2.5">
              Send invite
            </Button>
          </View>

          {pending.length > 0 ? (
            <View className="mb-6">
              <Text className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-ink-muted">Pending</Text>
              <View className="overflow-hidden rounded-2xl bg-surface">
                {pending.map((m, i) => (
                  <View key={m.id} className={i > 0 ? "border-t border-border" : ""}>
                    <Person src={m.profile.avatar_url} name={m.profile.display_name}>
                      <View className="min-w-0 flex-1">
                        <Text numberOfLines={1} className="text-sm text-ink">
                          {m.profile.display_name}
                        </Text>
                        <Text numberOfLines={1} className="text-xs text-ink-muted">
                          Invited as {m.role_label}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() =>
                          remove.mutate({ page_id: page.id, user_id: m.user_id }, { onSuccess: () => toast("Invite cancelled.", { variant: "success" }) })
                        }
                        accessibilityRole="button"
                        accessibilityLabel="Cancel invite"
                        hitSlop={10}
                      >
                        <Icon as={X} size={16} className="text-ink-muted" />
                      </Pressable>
                    </Person>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          <Text className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-ink-muted">Team ({active.length})</Text>
          <View className="overflow-hidden rounded-2xl bg-surface">
            {active.map((m, i) => (
              <View key={m.id} className={i > 0 ? "border-t border-border" : ""}>
                <Person src={m.profile.avatar_url} name={m.profile.display_name}>
                  <View className="min-w-0 flex-1">
                    <View className="flex-row items-center gap-1">
                      <Text numberOfLines={1} className="shrink text-sm text-ink">
                        {m.profile.display_name}
                      </Text>
                      {m.is_admin ? <Icon as={ShieldCheck} size={13} className="text-accent" /> : null}
                    </View>
                    <Text numberOfLines={1} className="text-xs text-ink-muted">
                      {m.role_label}
                    </Text>
                  </View>
                  {m.user_id !== user?.id ? (
                    <View className="shrink-0 items-end gap-1.5">
                      <Pressable
                        onPress={() =>
                          updateRole.mutate(
                            { page_id: page.id, user_id: m.user_id, is_admin: !m.is_admin },
                            {
                              onSuccess: () =>
                                toast(m.is_admin ? `${m.profile.display_name} is no longer an admin.` : `${m.profile.display_name} is now an admin.`, { variant: "success" }),
                              onError: () => toast("Couldn't update their role.", { variant: "error" }),
                            }
                          )
                        }
                        disabled={updateRole.isPending}
                        accessibilityRole="button"
                        hitSlop={6}
                        className={updateRole.isPending ? "opacity-50" : ""}
                      >
                        <Text className="text-xs text-accent">{m.is_admin ? "Remove admin" : "Make admin"}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() =>
                          remove.mutate({ page_id: page.id, user_id: m.user_id }, { onSuccess: () => toast(`${m.profile.display_name} removed.`, { variant: "success" }) })
                        }
                        accessibilityRole="button"
                        hitSlop={6}
                      >
                        <Text className="text-xs text-danger">Remove</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </Person>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
