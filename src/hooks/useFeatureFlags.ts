// src/hooks/useFeatureFlags.ts
//
// Generic admin feature-flag switchboard, backed by the feature_flags
// table (key text primary key, enabled boolean). Unlike
// moderation_settings (admin-only SELECT — see useAdmin.ts's
// useModerationSettings), this table is readable by any authenticated
// user, because these flags gate client-side entry points directly:
// a flag a regular user's browser can't read can't actually hide
// anything for them.
//
// Every flag here is an OFF switch on a feature that's already live,
// never an opt-in — so every fallback below defaults to `true`
// (enabled) rather than `false`, matching the DB column's own
// `default true` and the seed migration.
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";

export type FeatureFlagCategory =
  | "pages"
  | "wallet"
  | "messaging"
  | "promotions"
  | "affiliates"
  | "projects"
  | "content"
  | "discovery"
  | "access";

export interface FeatureFlagDef {
  key: string;
  label: string;
  description: string;
  category: FeatureFlagCategory;
}

// Mirrors the seed rows in the feature_flags migration, EXCEPT
// pages_creation_enabled — that one predates this file, has its own
// named hook pair (usePagesFeatureSettings/useTogglePagesEnabled in
// useAdmin.ts) for backward compatibility, and is toggled from
// AdminPageSettings.tsx rather than here. subsidiaries_enabled and
// page_messaging_enabled ARE covered by the generic hooks below, but
// are also toggled from AdminPageSettings.tsx (still page-domain,
// just narrower) rather than rendered by AdminFeatureFlags — so the
// "pages" category below exists for completeness/documentation, not
// because AdminFeatureFlags.tsx renders it.
export const FEATURE_FLAG_DEFS: FeatureFlagDef[] = [
  {
    key: "subsidiaries_enabled",
    label: "Subsidiary creation",
    description:
      "Adding a brand as a subsidiary of an organisation page (the \"Add Subsidiary\" flow). Existing subsidiary relationships are unaffected. Toggled from Admin > Page settings.",
    category: "pages",
  },
  {
    key: "page_messaging_enabled",
    label: "Page messaging",
    description:
      "Page inbox / page-to-profile direct messages. Existing threads stay readable. Toggled from Admin > Page settings.",
    category: "pages",
  },
  {
    key: "projects_enabled",
    label: "Projects",
    description:
      "Creating new projects of any type (files, events, courses, gigs, pitches, rooms, etc.) via the Create sheet. Existing projects, purchases, and edits to them are unaffected.",
    category: "projects",
  },
  {
    key: "messaging_enabled",
    label: "Messaging",
    description:
      "Direct messages between profiles — the Messages tab, starting new conversations, and sending in existing threads. Existing conversations stay readable either way.",
    category: "messaging",
  },
  {
    key: "wallet_enabled",
    label: "Wallet",
    description: "The Wallet tab and its entry points across the app.",
    category: "wallet",
  },
  {
    key: "deposits_enabled",
    label: "Wallet deposits",
    description: "Funding the wallet via Paystack. Existing balances are unaffected.",
    category: "wallet",
  },
  {
    key: "withdrawals_enabled",
    label: "Withdrawals",
    description:
      "Requesting a payout and adding new payout accounts. Existing payout accounts and withdrawal history stay visible.",
    category: "wallet",
  },
  {
    key: "gifting_enabled",
    label: "Gifting",
    description: "Sending gifts on posts/comments. Gifts already received are unaffected.",
    category: "wallet",
  },
  {
    key: "purchases_enabled",
    label: "Paid project purchases",
    description: "Buying or booking paid projects and gigs. Already-owned purchases stay accessible.",
    category: "wallet",
  },
  {
    key: "promotions_enabled",
    label: "Post promotions",
    description: "Submitting new post-boost promotions. Admin review of the existing queue stays open.",
    category: "promotions",
  },
  {
    key: "prioritize_posts_enabled",
    label: "Gift-triggered post priority",
    description: "The gift-priority-token bridge that lets a big-enough gift bump a post to the top of a feed.",
    category: "promotions",
  },
  {
    key: "affiliate_programs_enabled",
    label: "Affiliate programs",
    description:
      "Global switch for the affiliate program feature. Per-project toggles (in each project's own settings) still apply on top of this.",
    category: "affiliates",
  },
  {
    key: "music_in_posts_enabled",
    label: "Music in posts",
    description:
      "Attaching a catalogue track as background music on a post via \"Add music\" in Compose. Posts that already have music attached keep it either way.",
    category: "content",
  },
  {
    key: "profile_ads_enabled",
    label: "Profile ad slot",
    description:
      "The reserved ad banner slot on a user's own profile toolbar. Turning this off hides the slot entirely, regardless of any active ad creatives — manage those from Admin > Profile ads.",
    category: "content",
  },
  {
    key: "feed_invitations_enabled",
    label: "Soft Feed discovery",
    description:
      "The quiet 'there's more happening on Akọ' doorway shown at natural stopping points (course complete, book contents, ticket confirmation). Turning this off removes the invitation only — the underlying page and Feed itself are unaffected.",
    category: "discovery",
  },
  {
    key: "incubation_review_gate_enabled",
    label: "Incubation review gate",
    description:
      "When ON, users must be Admin-approved (Admin > Account review) before they can enter Akọ — anyone not yet approved sees the Under Review screen. Turning this OFF does not approve anyone; it only stops the gate from being enforced, and turning it back ON automatically re-locks accounts that were never approved.",
    category: "access",
  },
];

export type FeatureFlagMap = Record<string, boolean>;

export function useFeatureFlags() {
  return useQuery({
    queryKey: ["feature-flags"],
    queryFn: async (): Promise<FeatureFlagMap> => {
      const { data, error } = await supabase.from("feature_flags").select("key, enabled");
      if (error) throw error;
      const map: FeatureFlagMap = {};
      for (const row of data ?? []) map[row.key] = row.enabled;
      return map;
    },
    staleTime: 60_000,
  });
}

/**
 * Convenience for gating a single entry point without pulling the
 * whole map into the component. Defaults to `true` while the query is
 * loading or if a flag has no row yet — see the file header for why
 * that's the correct default for every flag here.
 */
export function useFeatureFlag(key: string): boolean {
  const { data } = useFeatureFlags();
  return data?.[key] ?? true;
}

export function useToggleFeatureFlag() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, enabled }: { key: string; enabled: boolean }) => {
      const { error } = await supabase
        .from("feature_flags")
        .update({ enabled, updated_at: new Date().toISOString(), updated_by: user?.id })
        .eq("key", key);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["feature-flags"] }),
  });
}
