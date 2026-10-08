// src/components/project/AffiliateProgramSheet.tsx
// Creator settings for a project's affiliate program: on/off, commission %, and
// two advanced behaviours — plus a small analytics strip once a program exists.
import { Users } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { FormField } from "@/components/ui/FormField";
import { SheetFrame } from "@/components/ui/SheetFrame";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { Toggle } from "@/components/ui/Toggle";
import { useToast } from "@/components/ui/Toast";
import { useAffiliateProgram, useCreatorAffiliateAnalytics, useSetAffiliateProgram } from "@/hooks/useAffiliates";
import { useFeatureFlag } from "@/hooks/useFeatureFlags";
import { formatUsd } from "@/lib/money";

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 items-center rounded-xl border border-border bg-canvas p-3">
      <Text numberOfLines={1} className="font-display text-base text-ink">
        {value}
      </Text>
      <Text className="mt-0.5 text-[11px] text-ink-muted">{label}</Text>
    </View>
  );
}

interface AffiliateProgramSheetProps {
  projectId: string;
  projectTitle: string;
  priceUsd: number;
  onClose: () => void;
}

export function AffiliateProgramSheet({ projectId, projectTitle, priceUsd, onClose }: AffiliateProgramSheetProps) {
  const toast = useToast();
  const { data: program, isLoading } = useAffiliateProgram(projectId);
  const { data: analytics } = useCreatorAffiliateAnalytics(projectId);
  const setProgram = useSetAffiliateProgram(projectId);
  const affiliateProgramsEnabled = useFeatureFlag("affiliate_programs_enabled");
  const isFree = priceUsd <= 0;

  const [enabled, setEnabled] = useState(false);
  const [commissionPct, setCommissionPct] = useState("20");
  const [allowExternalPromotion, setAllowExternalPromotion] = useState(true);
  const [existingForksSurviveDisable, setExistingForksSurviveDisable] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (hydrated || isLoading) return;
    if (program) {
      setEnabled(program.enabled);
      setAllowExternalPromotion(program.allow_external_promotion);
      setExistingForksSurviveDisable(program.existing_forks_survive_disable);
    }
    setHydrated(true);
  }, [program, isLoading, hydrated]);

  async function handleSave() {
    setError(null);
    if (enabled && !affiliateProgramsEnabled) return setError("Affiliate programs are temporarily disabled.");
    if (enabled && isFree) return setError("Free projects can't have an affiliate program — there's no sale for a commission to come from.");

    const pct = parseFloat(commissionPct);
    if (enabled && (Number.isNaN(pct) || pct <= 0 || pct > 100)) return setError("Commission must be a percentage between 0 and 100.");

    try {
      await setProgram.mutateAsync({
        enabled,
        commissionPct: enabled ? pct / 100 : undefined,
        allowExternalPromotion,
        existingForksSurviveDisable,
      });
      toast(enabled ? "Affiliate program updated." : "Affiliate program disabled.", { variant: "success" });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save affiliate settings.");
    }
  }

  const cannotEnable = !enabled && (isFree || !affiliateProgramsEnabled);

  return (
    <SheetFrame title="Affiliate program" subtitle={projectTitle} onClose={onClose} avoidKeyboard zIndex={55}>
      {isLoading ? (
        <Text className="py-6 text-center text-sm text-ink-muted">Loading…</Text>
      ) : (
        <View className="pb-2">
          <View className="flex-row items-center justify-between gap-3 border-b border-border py-4">
            <View className="min-w-0 flex-1 flex-row items-center gap-3">
              <Icon as={Users} size={18} className="shrink-0 text-ink-muted" />
              <View className="min-w-0 flex-1">
                <Text className="text-sm font-medium text-ink">Let people earn by sharing this</Text>
                <Text className="text-xs text-ink-muted">Anyone can fork it for their own referral link — you only pay a commission on sales it actually brings in.</Text>
                {!enabled && isFree ? <Text className="mt-1 text-xs text-danger">This project is free — set a price before turning on an affiliate program.</Text> : null}
                {!affiliateProgramsEnabled && !enabled && !isFree ? (
                  <Text className="mt-1 text-xs text-danger">Affiliate programs are temporarily disabled platform-wide.</Text>
                ) : null}
              </View>
            </View>
            <Toggle checked={enabled} disabled={cannotEnable} onChange={setEnabled} accessibilityLabel="Affiliate program" />
          </View>

          {enabled ? (
            <>
              <View className="mb-2 mt-4">
                <FormField label="Commission (% of your take-home per sale)" value={commissionPct} onChangeText={setCommissionPct} keyboardType="decimal-pad" />
                <Text className="-mt-4 text-xs text-ink-muted">
                  Comes out of your share after the platform fee — buyers always pay the same price either way. Changing this only affects sales from now on; past
                  commissions keep the rate they were made at.
                </Text>
              </View>

              <Pressable onPress={() => setShowAdvanced((s) => !s)} accessibilityRole="button" className="mb-1 mt-2 self-start">
                <Text className="text-sm font-medium text-accent">{showAdvanced ? "Hide advanced options" : "Advanced options"}</Text>
              </Pressable>

              {showAdvanced ? (
                <View className="mb-2 mt-2 gap-4 rounded-xl border border-border bg-canvas p-3">
                  <Checkbox
                    checked={allowExternalPromotion}
                    onChange={setAllowExternalPromotion}
                    label="Allow affiliates to promote this off Akọ (social media, blogs, etc.), not just by sharing within the app."
                  />
                  <Checkbox
                    checked={existingForksSurviveDisable}
                    onChange={setExistingForksSurviveDisable}
                    label="If I turn this off later, let people who already forked it keep earning — only stop new people from forking it."
                  />
                </View>
              ) : null}
            </>
          ) : null}

          {analytics?.program_exists ? (
            <View className="mb-1 mt-5 flex-row gap-2">
              <StatTile label="Affiliates" value={String(analytics.total_affiliates ?? 0)} />
              <StatTile label="Sales" value={String(analytics.conversions ?? 0)} />
              <StatTile label="Paid out" value={formatUsd(analytics.total_affiliate_commissions ?? 0)} />
            </View>
          ) : null}

          {error ? (
            <Text accessibilityRole="alert" className="mt-4 text-sm text-danger">
              {error}
            </Text>
          ) : null}

          <View className="mt-6">
            <Button onPress={() => void handleSave()} loading={setProgram.isPending}>
              Save
            </Button>
          </View>
        </View>
      )}
    </SheetFrame>
  );
}
