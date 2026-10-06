// src/components/project/AffiliateShareSheet.tsx
// Share a project through your own affiliate link and earn a commission on sales.
import { Check, Copy, TrendingUp } from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { Pressable, Share, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { SheetFrame } from "@/components/ui/SheetFrame";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import {
  affiliateLinkFor,
  useAffiliateDashboard,
  useAffiliateProgram,
  useCreateAffiliateRelationship,
  useCurrentCommissionPct,
  useMyAffiliateRelationship,
} from "@/hooks/useAffiliates";
import { useFeatureFlag } from "@/hooks/useFeatureFlags";
import { APP_URL } from "@/lib/config";
import { formatUsd } from "@/lib/money";

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 items-center rounded-xl border border-border bg-canvas p-3" style={{ minWidth: "46%" }}>
      <Text numberOfLines={1} className="font-display text-base text-ink">
        {value}
      </Text>
      <Text className="mt-0.5 text-[11px] text-ink-muted">{label}</Text>
    </View>
  );
}

interface AffiliateShareSheetProps {
  projectId: string;
  projectTitle: string;
  shareUrl?: string;
  onClose: () => void;
}

export function AffiliateShareSheet({ projectId, projectTitle, shareUrl, onClose }: AffiliateShareSheetProps) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const baseUrl = shareUrl ?? `${APP_URL}/projects/${projectId}`;

  const { data: program } = useAffiliateProgram(projectId);
  const { data: commissionPct } = useCurrentCommissionPct(program?.id);
  const { data: relationship, isLoading: loadingRelationship } = useMyAffiliateRelationship(projectId);
  const { data: dashboard } = useAffiliateDashboard(relationship?.status === "active" ? relationship.id : undefined);
  const createRelationship = useCreateAffiliateRelationship(projectId);
  const affiliateProgramsEnabled = useFeatureFlag("affiliate_programs_enabled");

  async function handleFork() {
    setError(null);
    if (!affiliateProgramsEnabled) return setError("Affiliate programs are temporarily disabled.");
    try {
      await createRelationship.mutateAsync();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't set up your affiliate link.");
    }
  }

  async function handleCopy(link: string) {
    await Clipboard.setStringAsync(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast("Link copied.", { variant: "success" });
  }

  async function handleShare(link: string) {
    try {
      await Share.share({ message: link, url: link, title: projectTitle });
    } catch {
      /* dismissed */
    }
  }

  const pctLabel = commissionPct !== null && commissionPct !== undefined ? `${Math.round(commissionPct * 100)}%` : null;
  const link = relationship?.status === "active" ? affiliateLinkFor(baseUrl, relationship.referral_token) : null;

  return (
    <SheetFrame title="Share & earn" subtitle={projectTitle} onClose={onClose} zIndex={55}>
      {loadingRelationship ? (
        <Text className="py-6 text-center text-sm text-ink-muted">Loading…</Text>
      ) : relationship?.status === "revoked" ? (
        <Text className="py-6 text-center text-sm text-ink-muted">Your affiliate access to this project was revoked by the creator.</Text>
      ) : link ? (
        <View className="pb-2">
          <View className="mb-4 mt-1 flex-row items-center gap-2 rounded-xl border border-border bg-canvas p-3">
            <Text numberOfLines={1} className="flex-1 text-sm text-ink">
              {link}
            </Text>
            <Pressable onPress={() => void handleCopy(link)} accessibilityRole="button" accessibilityLabel="Copy link" hitSlop={8} className="shrink-0 p-1.5">
              <Icon as={copied ? Check : Copy} size={16} className="text-accent" />
            </Pressable>
          </View>

          <Button onPress={() => void handleShare(link)}>Share my link</Button>

          <View className="mt-5 flex-row flex-wrap gap-2">
            <StatTile label="Clicks" value={String(dashboard?.clicks ?? 0)} />
            <StatTile label="Sales" value={String(dashboard?.completed_sales ?? 0)} />
            <StatTile label="Pending" value={formatUsd(dashboard?.pending_commission ?? 0)} />
            <StatTile label="Paid out" value={formatUsd(dashboard?.paid_commission ?? 0)} />
          </View>
        </View>
      ) : (
        <View className="items-center py-4">
          <Icon as={TrendingUp} size={28} className="mb-3 text-accent" />
          <Text className="mb-1 text-center text-sm text-ink">
            {pctLabel ? `Earn ${pctLabel} on every sale you bring in.` : "Get your own link and earn on every sale you bring in."}
          </Text>
          <Text className="mb-5 text-center text-xs text-ink-muted">
            Get a personal link for this project — anyone who buys through it counts as yours, even if they sign up later.
          </Text>
          {error ? (
            <Text accessibilityRole="alert" className="mb-3 text-sm text-danger">
              {error}
            </Text>
          ) : null}
          {affiliateProgramsEnabled ? (
            <View className="w-full">
              <Button onPress={() => void handleFork()} loading={createRelationship.isPending}>
                Get my link
              </Button>
            </View>
          ) : (
            <Text className="text-xs text-ink-muted">New affiliate links are temporarily unavailable.</Text>
          )}
        </View>
      )}
    </SheetFrame>
  );
}
