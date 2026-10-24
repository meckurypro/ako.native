// src/components/project/AffiliateShareSheet.tsx
// Fork a project to get your own affiliate link. Forking sends you straight to Forked projects, where the link lives.
import { router, type Href } from "expo-router";
import { GitFork } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/Button";
import { useSheet } from "@/components/ui/Sheet";
import { SheetFrame } from "@/components/ui/SheetFrame";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import {
  useAffiliateProgram,
  useCreateAffiliateRelationship,
  useCurrentCommissionPct,
  useMyAffiliateRelationship,
} from "@/hooks/useAffiliates";
import { runAfterDismiss } from "@/hooks/useBackDismiss";
import { useFeatureFlag } from "@/hooks/useFeatureFlags";
import { friendlyError } from "@/lib/friendlyError";

// Where forked projects (and their affiliate links) live.
export const FORKED_PROJECTS_PATH = "/wallet/affiliate-links";

interface AffiliateShareSheetProps {
  projectId: string;
  projectTitle: string;
  // Kept so existing callers compile; the link is copied from the Forked projects screen.
  shareUrl?: string;
  onClose: () => void;
}

function Body({ projectId }: { projectId: string }) {
  const { close } = useSheet();
  const [error, setError] = useState<string | null>(null);

  const { data: program } = useAffiliateProgram(projectId);
  const { data: commissionPct } = useCurrentCommissionPct(program?.id);
  const { data: relationship, isLoading: loadingRelationship } = useMyAffiliateRelationship(projectId);
  const createRelationship = useCreateAffiliateRelationship(projectId);
  // Only gates NEW forks — an existing fork is always viewable.
  const affiliateProgramsEnabled = useFeatureFlag("affiliate_programs_enabled");

  const goToForks = () => runAfterDismiss(close, () => router.push(FORKED_PROJECTS_PATH as Href));

  async function handleFork() {
    setError(null);
    if (!affiliateProgramsEnabled) return setError("Forking is temporarily off.");
    try {
      await createRelationship.mutateAsync();
      goToForks();
    } catch (err) {
      setError(friendlyError(err, "Couldn't fork this project."));
    }
  }

  const pctLabel = commissionPct !== null && commissionPct !== undefined ? `${Math.round(commissionPct * 100)}%` : null;

  if (loadingRelationship) return <Text className="py-6 text-center text-sm text-ink-muted">Loading…</Text>;
  if (relationship?.status === "revoked") return <Text className="py-6 text-center text-sm text-ink-muted">The creator revoked your fork.</Text>;

  if (relationship?.status === "active") {
    return (
      <View className="items-center py-4">
        <Icon as={GitFork} size={28} className="mb-3 text-accent" />
        <Text className="mb-5 text-center text-sm text-ink">You've forked this project.</Text>
        <View className="w-full">
          <Button onPress={goToForks}>View forked projects</Button>
        </View>
      </View>
    );
  }

  return (
    <View className="items-center py-4">
      <Icon as={GitFork} size={28} className="mb-3 text-accent" />
      <Text className="mb-1 text-center text-sm text-ink">{pctLabel ? `Fork it. Earn ${pctLabel} on every sale.` : "Fork it. Earn on every sale."}</Text>
      <Text className="mb-5 text-center text-xs text-ink-muted">You get your own affiliate link.</Text>
      {error ? (
        <Text accessibilityRole="alert" className="mb-3 text-sm text-danger">
          {error}
        </Text>
      ) : null}
      {affiliateProgramsEnabled ? (
        <View className="w-full">
          <Button onPress={() => void handleFork()} loading={createRelationship.isPending}>
            Fork project
          </Button>
        </View>
      ) : (
        <Text className="text-xs text-ink-muted">Forking is temporarily off.</Text>
      )}
    </View>
  );
}

export function AffiliateShareSheet({ projectId, projectTitle, onClose }: AffiliateShareSheetProps) {
  return (
    <SheetFrame title="Fork & earn" subtitle={projectTitle} onClose={onClose} zIndex={55} scrim="ink">
      <Body projectId={projectId} />
    </SheetFrame>
  );
}
