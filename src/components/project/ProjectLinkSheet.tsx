// src/components/project/ProjectLinkSheet.tsx
// Choose / change a project's custom short URL, with live availability checking
// and suggestions when a link is taken.
import { Check, Copy } from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import { useEffect, useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { SheetFrame } from "@/components/ui/SheetFrame";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/hooks/useAuth";
import { useCheckProjectSlugAvailable, useSetProjectSlug, useSuggestProjectSlugAlternatives, type Project } from "@/hooks/useProjects";
import { getProjectSlugFormatError, getProjectUrl, normalizeProjectSlug } from "@/lib/projectLinks";
import { useTheme } from "@/theme/ThemeProvider";

export function ProjectLinkSheet({ project, onClose }: { project: Project; onClose: () => void }) {
  const { colors } = useTheme();
  const toast = useToast();
  const { profile } = useAuth();
  const [copied, setCopied] = useState(false);
  const [slugInput, setSlugInput] = useState(project.slug ?? "");
  const [error, setError] = useState<string | null>(null);
  const checkId = useRef(0);
  const [debounced, setDebounced] = useState(normalizeProjectSlug(project.slug ?? ""));
  const setSlug = useSetProjectSlug();

  const normalized = normalizeProjectSlug(slugInput);
  const formatError = normalized.length > 0 ? getProjectSlugFormatError(normalized) : null;
  const unchanged = normalized === normalizeProjectSlug(project.slug ?? "");

  useEffect(() => {
    const id = ++checkId.current;
    const timeout = setTimeout(() => {
      if (id === checkId.current) setDebounced(normalized);
    }, 400);
    return () => clearTimeout(timeout);
  }, [normalized]);

  const { data: available, isFetching: checking } = useCheckProjectSlugAvailable(debounced, project.id);
  const isTaken = debounced === normalized && !!normalized && !formatError && available === false;
  const { data: suggestions } = useSuggestProjectSlugAlternatives(debounced, profile?.username, isTaken);
  const previewUrl = normalized ? getProjectUrl({ id: project.id, slug: normalized }) : getProjectUrl(project);

  async function handleCopy() {
    await Clipboard.setStringAsync(getProjectUrl(project));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast("Link copied.", { variant: "success" });
  }

  async function handleSave() {
    setError(null);
    if (!normalized) return setError("Enter a link.");
    if (formatError) return setError(formatError);
    if (unchanged) return onClose();
    if (debounced === normalized && available === false) return setError("That link is already taken. Try another.");
    try {
      await setSlug.mutateAsync({ projectId: project.id, slug: normalized });
      toast("Custom URL updated.", { variant: "success" });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update the link. Please try again.");
    }
  }

  const canSave = !!normalized && !formatError && !(debounced === normalized && checking) && !setSlug.isPending;

  return (
    <SheetFrame title="Custom URL" subtitle={project.title} onClose={onClose} avoidKeyboard zIndex={55}>
      <Text className="mb-4 mt-1 text-sm text-ink-muted">
        This is the link people use to find this Project. You can change it any time — the old link will still bring people here.
      </Text>

      {project.slug ? (
        <View className="mb-4 flex-row items-center gap-2 rounded-xl border border-border bg-canvas p-3">
          <Text numberOfLines={1} className="flex-1 text-sm text-ink">
            {getProjectUrl(project)}
          </Text>
          <Pressable onPress={() => void handleCopy()} accessibilityRole="button" accessibilityLabel="Copy link" hitSlop={8} className="shrink-0 p-1.5">
            <Icon as={copied ? Check : Copy} size={16} className="text-accent" />
          </Pressable>
        </View>
      ) : null}

      <Text className="mb-1 text-xs font-medium text-ink-muted">{project.slug ? "Change link" : "Choose a link"}</Text>
      <TextInput
        value={slugInput}
        onChangeText={(v) => setSlugInput(v.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
        maxLength={60}
        placeholder="calling"
        placeholderTextColor={colors.inkMuted}
        selectionColor={colors.accent}
        autoCapitalize="none"
        autoCorrect={false}
        className="rounded-xl bg-canvas px-4 py-3 text-sm text-ink"
        style={{ fontFamily: "Inter_400Regular" }}
      />
      <Text numberOfLines={1} className="mt-1 text-xs text-ink-muted">
        {previewUrl}
      </Text>

      {normalized && !formatError && !unchanged ? (
        debounced !== normalized || checking ? (
          <Text className="mt-1.5 text-xs text-ink-muted">Checking availability…</Text>
        ) : available ? (
          <Text className="mt-1.5 text-xs text-accent">This link is available.</Text>
        ) : (
          <View className="mt-1.5">
            <Text className="text-xs text-danger">That link is already taken.</Text>
            {suggestions && suggestions.length > 0 ? (
              <View className="mt-2 flex-row flex-wrap gap-1.5">
                {suggestions.map((s) => (
                  <Pressable key={s} onPress={() => setSlugInput(s)} accessibilityRole="button" className="rounded-full border border-border bg-canvas px-2.5 py-1">
                    <Text className="text-xs text-ink">{s}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        )
      ) : null}

      {error ? (
        <Text accessibilityRole="alert" className="mt-3 text-sm text-danger">
          {error}
        </Text>
      ) : null}

      <View className="mb-2 mt-5">
        <Button onPress={() => void handleSave()} loading={setSlug.isPending} disabled={!canSave}>
          {project.slug ? "Save link" : "Set link"}
        </Button>
      </View>
    </SheetFrame>
  );
}
