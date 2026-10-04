// src/screens/CreatePage.tsx
// Create an Organisation / Brand / Product page (optionally as a subsidiary of
// one you manage). Gated by an eligibility check (activity thresholds) and by
// admin kill switches, mirroring the web flow.
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TopicPicker, MAX_TOPICS } from "@/components/post/TopicPicker";
import { Button } from "@/components/ui/Button";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SelectField } from "@/components/ui/SelectField";
import { SurfaceInput } from "@/components/ui/SurfaceInput";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { usePagesFeatureSettings } from "@/hooks/useAdmin";
import { useFeatureFlag } from "@/hooks/useFeatureFlags";
import {
  getPageCreationEligibilityReasons,
  useCreatePage,
  useMyPages,
  usePageById,
  usePageCreationEligibility,
  usePageRoleLabelSuggestions,
} from "@/hooks/usePages";
import { APP_URL } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import type { PageType } from "@/types/database";

type UsernameStatus = "idle" | "checking" | "available" | "taken" | "error";

const TYPES: { value: PageType; label: string }[] = [
  { value: "organization", label: "Organisation" },
  { value: "brand", label: "Brand" },
  { value: "product", label: "Product" },
];
const NAME_LABEL: Record<PageType, string> = { organization: "Organisation name", brand: "Brand name", product: "Product name" };
const NAME_PLACEHOLDER: Record<PageType, string> = { organization: "Acme Inc", brand: "Acme", product: "Acme Widget" };
const TAGLINE_PLACEHOLDER: Record<PageType, string> = {
  organization: "What this organisation does",
  brand: "What this brand does",
  product: "What this product does",
};

function EligibilityBar({ label, current, required }: { label: string; current: number; required: number }) {
  const met = current >= required;
  const pct = required > 0 ? Math.min(100, Math.round((current / required) * 100)) : 100;
  return (
    <View>
      <View className="mb-1 flex-row items-center justify-between">
        <Text className="text-xs text-ink-muted">{label}</Text>
        <Text className="text-xs text-ink-muted">
          {current} / {required}
        </Text>
      </View>
      <View className="h-1.5 overflow-hidden rounded-full bg-border">
        <View className="h-full rounded-full bg-accent" style={{ width: `${met ? 100 : pct}%`, opacity: met ? 1 : 0.7 }} />
      </View>
    </View>
  );
}

export function CreatePage() {
  const insets = useSafeAreaInsets();
  const { parent: presetParentId } = useLocalSearchParams<{ parent?: string }>();
  const createPage = useCreatePage();
  const toast = useToast();
  const { data: myPages } = useMyPages();
  const { data: pagesFeature, isLoading: loadingPagesFeature } = usePagesFeatureSettings();
  const subsidiariesEnabled = useFeatureFlag("subsidiaries_enabled");

  const { data: pageEligibilityRaw } = usePageCreationEligibility();
  const eligibility = getPageCreationEligibilityReasons(pageEligibilityRaw);

  const { data: presetParent } = usePageById(presetParentId ?? "", !!presetParentId);
  const [pageType, setPageType] = useState<PageType>("organization");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [roleLabel, setRoleLabel] = useState("");
  const [showRoleSuggestions, setShowRoleSuggestions] = useState(false);
  const [tagline, setTagline] = useState("");
  const [bio, setBio] = useState("");
  const [topicIds, setTopicIds] = useState<Set<string>>(new Set());
  const [parentOrgId, setParentOrgId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const usernameCheckId = useRef(0);
  const roleInputRef = useRef<TextInput>(null);

  const { data: roleSuggestions } = usePageRoleLabelSuggestions(roleLabel);
  const myAdminPages = (myPages ?? []).filter((p) => p.my_is_admin);

  useEffect(() => {
    const candidate = username.trim().toLowerCase();
    if (candidate.length < 3) {
      setUsernameStatus("idle");
      return;
    }
    const checkId = ++usernameCheckId.current;
    setUsernameStatus("checking");
    const timeout = setTimeout(async () => {
      const { data, error: checkError } = await supabase.from("pages").select("id").eq("username", candidate).maybeSingle();
      if (checkId !== usernameCheckId.current) return;
      setUsernameStatus(checkError ? "error" : data ? "taken" : "available");
    }, 400);
    return () => clearTimeout(timeout);
  }, [username]);

  function toggleTopic(interestId: string) {
    setTopicIds((prev) => {
      const next = new Set(prev);
      if (next.has(interestId)) next.delete(interestId);
      else {
        if (next.size >= MAX_TOPICS) return prev;
        next.add(interestId);
      }
      return next;
    });
  }

  async function handleSubmit() {
    setError(null);

    if (!name.trim() || !username.trim() || !roleLabel.trim()) return setError("Name, username, and your role are required.");
    if (usernameStatus === "taken") return setError("That username is already taken.");
    if (eligibility && !eligibility.eligible) return setError(eligibility.reasons[0]);
    if ((presetParentId || parentOrgId) && !subsidiariesEnabled) return setError("Subsidiary creation is temporarily disabled.");

    const { data: existingPage, error: recheckError } = await supabase.from("pages").select("id").eq("username", username.trim().toLowerCase()).maybeSingle();
    if (recheckError) return setError("Couldn't verify that username right now. Please try again.");
    if (existingPage) {
      setUsernameStatus("taken");
      return setError("That username is already taken.");
    }

    try {
      const page = await createPage.mutateAsync({
        page_type: pageType,
        name: name.trim(),
        username: username.trim().toLowerCase(),
        role_label: roleLabel.trim(),
        tagline: tagline.trim() || undefined,
        bio: bio.trim() || undefined,
        topic_ids: Array.from(topicIds),
        parent_organization_id: presetParentId || parentOrgId || undefined,
      });
      router.replace(`/page/${page.username}` as Href);
      toast(`${name.trim()} created successfully.`, { variant: "success" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create that page.");
    }
  }

  const title = presetParentId ? "Add a Subsidiary" : "Create a page";
  const pagesBlocked = !loadingPagesFeature && !(pagesFeature?.pages_creation_enabled ?? true);
  const subsidiaryBlocked = !!presetParentId && !subsidiariesEnabled;

  if (pagesBlocked || subsidiaryBlocked) {
    return (
      <View className="flex-1 bg-canvas">
        <ScreenHeader title={title} />
        <Text className="px-4 text-sm text-ink-muted">
          {pagesBlocked ? "New pages aren't being created right now. Check back later." : "Adding subsidiaries isn't available right now. Check back later."}
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 bg-canvas">
      <ScreenHeader title={title} />
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 40 }}>
        <View className="w-full max-w-md gap-5 self-center">
          <View className="flex-row gap-2">
            {TYPES.map((t) => (
              <Pressable
                key={t.value}
                onPress={() => setPageType(t.value)}
                accessibilityRole="radio"
                accessibilityState={{ selected: pageType === t.value }}
                className={`flex-1 items-center rounded-2xl border p-3 ${pageType === t.value ? "border-accent bg-accent-soft" : "border-border bg-surface"}`}
              >
                <Text className="text-sm font-medium text-ink">{t.label}</Text>
              </Pressable>
            ))}
          </View>

          {eligibility && !eligibility.eligible ? (
            <View className="gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3">
              <View>
                <Text className="mb-1 text-sm font-medium text-danger">Page creation isn't unlocked yet:</Text>
                {eligibility.reasons.map((reason) => (
                  <Text key={reason} className="text-xs text-danger">{`• ${reason}`}</Text>
                ))}
              </View>

              {pageEligibilityRaw ? (
                <View className="gap-2.5 border-t border-danger/20 pt-3">
                  <EligibilityBar label="Posts (last 30 days)" current={pageEligibilityRaw.posts_30d} required={pageEligibilityRaw.posts_required} />
                  <EligibilityBar
                    label="Distinct posts engaged with (last 30 days)"
                    current={pageEligibilityRaw.distinct_engaged_30d}
                    required={pageEligibilityRaw.distinct_engaged_required}
                  />
                  {/* Only shown when an account-age requirement is actually set. */}
                  {pageEligibilityRaw.account_age_required > 0 ? (
                    <EligibilityBar label="Account age (days)" current={pageEligibilityRaw.account_age_days} required={pageEligibilityRaw.account_age_required} />
                  ) : null}
                </View>
              ) : null}

              <Text className="text-xs text-danger/80">Keep posting and engaging with others' posts to unlock this.</Text>
            </View>
          ) : null}

          <SurfaceInput label={NAME_LABEL[pageType]} value={name} onChangeText={setName} maxLength={80} placeholder={NAME_PLACEHOLDER[pageType]} />

          <SurfaceInput
            label="Username"
            value={username}
            onChangeText={(v) => setUsername(v.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
            maxLength={30}
            placeholder="meckuryai"
            autoCapitalize="none"
            autoCorrect={false}
          >
            <Text className="mt-1 text-xs text-ink-muted">{`${APP_URL.replace(/^https?:\/\//, "") || "akọ.app"}/page/${username || "..."}`}</Text>
            {usernameStatus === "checking" ? <Text className="mt-1.5 text-xs text-ink-muted">Checking availability…</Text> : null}
            {usernameStatus === "taken" ? <Text className="mt-1.5 text-xs text-danger">That username is already taken.</Text> : null}
            {usernameStatus === "available" ? <Text className="mt-1.5 text-xs text-accent">Username is available.</Text> : null}
          </SurfaceInput>

          <View>
            <SurfaceInput
              ref={roleInputRef}
              label="Your role at it"
              value={roleLabel}
              onChangeText={(v) => {
                setRoleLabel(v);
                setShowRoleSuggestions(true);
              }}
              onFocus={() => setShowRoleSuggestions(true)}
              onBlur={() => setTimeout(() => setShowRoleSuggestions(false), 150)}
              maxLength={60}
              placeholder="CEO, Founder, Community Lead…"
            >
              <Text className="mt-1 text-xs text-ink-muted">{`Shown as "${roleLabel || "Your role"} at ${name || "this page"}" on your profile.`}</Text>
            </SurfaceInput>

            {/* Existing role titles matching what's typed — same list PageTeam offers when inviting. */}
            {showRoleSuggestions && roleLabel.trim().length > 0 && !!roleSuggestions?.length ? (
              <View className="mt-2 max-h-56 overflow-hidden rounded-xl border border-border bg-canvas">
                <ScrollView keyboardShouldPersistTaps="always" nestedScrollEnabled>
                  {roleSuggestions.map((label) => (
                    <Pressable
                      key={label}
                      onPress={() => {
                        setRoleLabel(label);
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

          <SurfaceInput label="Tagline" value={tagline} onChangeText={setTagline} maxLength={100} placeholder={TAGLINE_PLACEHOLDER[pageType]} />
          <SurfaceInput label="Bio" value={bio} onChangeText={setBio} maxLength={280} rows={3} />

          <TopicPicker selected={topicIds} onToggle={toggleTopic} />

          {presetParentId ? (
            presetParent ? (
              <View className="flex-row items-center gap-2.5 rounded-xl bg-surface px-4 py-3">
                <Text className="text-sm text-ink-muted">Subsidiary of</Text>
                <Text numberOfLines={1} className="shrink text-sm font-medium text-ink">
                  {presetParent.name}
                </Text>
              </View>
            ) : null
          ) : subsidiariesEnabled && myAdminPages.length > 0 ? (
            <SelectField
              label="Make this a Subsidiary of a page you manage? (optional)"
              value={parentOrgId}
              onChange={setParentOrgId}
              options={[{ value: "", label: "None" }, ...myAdminPages.map((p) => ({ value: p.id, label: p.name }))]}
            />
          ) : null}

          {error ? <Text accessibilityRole="alert" className="text-sm text-danger">{error}</Text> : null}

          <Button onPress={handleSubmit} loading={createPage.isPending}>
            {presetParentId ? "Add Subsidiary" : `Create ${pageType}`}
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
