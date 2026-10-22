// src/screens/ProjectBySlug.tsx
// Short links like /my-project-title resolve to a project, then show it (mirrors the web ProjectBySlug). A stale
// slug (the creator renamed it) redirects to the canonical one. Failure states are told apart so a dropped
// connection never reads as "this project doesn't exist": offline / couldn't load → Retry; resolved to nothing →
// not found, with a way forward (Feed when signed in, Log in when a guest followed a shared link).
import { ArrowLeft } from "lucide-react-native";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useEffect } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/hooks/useAuth";
import { useIsOnline } from "@/hooks/useIsOnline";
import { useSmartBack } from "@/hooks/useSmartBack";
import { useResolveProjectSlug } from "@/hooks/useProjects";
import { getProjectPath, normalizeProjectSlug } from "@/lib/projectLinks";
import { ProjectDetail } from "./ProjectDetail";

function StatusScreen({
  title,
  body,
  actionLabel,
  onAction,
  showBack,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  showBack: boolean;
}) {
  const insets = useSafeAreaInsets();
  const smartBack = useSmartBack();
  return (
    <View className="flex-1 bg-canvas px-4" style={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }}>
      {showBack ? (
        <Pressable
          onPress={smartBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="h-10 w-10 items-center justify-center self-start rounded-full border border-border-a60 bg-surface"
          style={{ elevation: 2 }}
        >
          <Icon as={ArrowLeft} size={20} className="text-ink-muted" />
        </Pressable>
      ) : null}
      <View className="mt-16 w-full max-w-xl items-center self-center">
        <Text className="text-center font-display text-xl font-semibold text-ink">{title}</Text>
        <Text className="mt-2 text-center text-sm text-ink-muted">{body}</Text>
        {actionLabel && onAction ? (
          <Pressable onPress={onAction} accessibilityRole="button" hitSlop={8} className="mt-5 px-4 py-2">
            <Text className="text-sm font-medium text-accent">{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function ProjectBySlug() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const insets = useSafeAreaInsets();
  const { user, loading: authLoading } = useAuth();
  const online = useIsOnline();
  const { data: project, isPending, isError, refetch } = useResolveProjectSlug(slug);

  // A retired slug still resolves (to its project's current one) — see resolve_project_slug. When that's what
  // happened, swap to the up-to-date link rather than serving old-slug content under an address that no longer
  // matches it.
  const isStaleSlug = !!project && !!slug && normalizeProjectSlug(project.slug ?? "") !== normalizeProjectSlug(slug);

  useEffect(() => {
    if (project && isStaleSlug) router.replace(getProjectPath(project) as Href);
  }, [project, isStaleSlug]);

  const signedIn = !!user;

  // Offline, React Query pauses the fetch instead of failing it: still pending, never loading. Say so (with Retry)
  // rather than spinning forever or, worse, falling through to "not found".
  if (isPending && !online && !authLoading) {
    return (
      <StatusScreen
        title="You're offline"
        body="Connect to the internet to open this link, then try again."
        actionLabel="Retry"
        onAction={() => void refetch()}
        showBack={signedIn}
      />
    );
  }

  if (isPending || authLoading) {
    return (
      <View className="flex-1 bg-canvas px-4" style={{ paddingTop: insets.top + 24 }}>
        <Text className="text-ink-muted">Loading…</Text>
      </View>
    );
  }

  if (isStaleSlug) return null;

  if (isError) {
    return (
      <StatusScreen
        title={online ? "Couldn't load this page" : "You're offline"}
        body={online ? "Check your connection and try again." : "Connect to the internet to open this link, then try again."}
        actionLabel="Retry"
        onAction={() => void refetch()}
        showBack={signedIn}
      />
    );
  }

  if (!project) {
    return (
      <StatusScreen
        title="This project couldn't be found"
        body="The link may have changed, or the project is no longer available."
        actionLabel={signedIn ? "Go to your feed" : "Log in"}
        onAction={() => router.replace((signedIn ? "/feed" : "/login") as Href)}
        showBack={signedIn}
      />
    );
  }

  return <ProjectDetail resolvedProjectId={project.id} />;
}
