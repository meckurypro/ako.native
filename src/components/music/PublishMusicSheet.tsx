// src/components/music/PublishMusicSheet.tsx
//
// "Publish Music to Akọ" — the full creator flow (port of the web sheet): pick an existing Audio
// Project → title/artist/cover → select the best 30 seconds → tag contributors → usage mode →
// accept the rights declaration + licence → publish.
//
// This is a publishing layer over an existing Audio Project, not a new upload flow — the source
// audio always comes from a Project the user already owns. All rights/ownership/split/price
// validation happens server-side in the publish-music edge function; the checks here only exist to
// give a fast, friendly error before that round trip.
import * as ImagePicker from "expo-image-picker";
import { ChevronRight, FileAudio } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { Avatar } from "@/components/ui/Avatar";
import { SheetFrame } from "@/components/ui/SheetFrame";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useCurrentLicenceAgreement, useMyAudioProjects, usePublishMusic, useUploadCatalogueAsset } from "@/hooks/useMusicCatalogue";
import { useMyProfile } from "@/hooks/useProfile";
import { useGetProjectFile } from "@/hooks/useProjects";
import { resolveFunctionErrorMessage } from "@/lib/functionErrors";
import { fromImagePickerAsset, type LocalFile } from "@/lib/localFile";
import { useTheme } from "@/theme/ThemeProvider";
import type { ContributorDraft, EligibleAudioProject } from "@/types/music";
import { ClipSelector, type ClipResult } from "./ClipSelector";
import { ContributorPicker } from "./ContributorPicker";
import { friendlyError } from "@/lib/friendlyError";

interface PublishMusicSheetProps {
  onClose: () => void;
  onPublished?: (catalogueId: string) => void;
  // When opened from a specific Audio Project's own page (the normal case — PublishMusicButton),
  // preselect that Project instead of making the owner re-find it in the generic picker.
  projectId?: string;
}

function Label({ children }: { children: React.ReactNode }) {
  return <Text className="mb-1.5 text-sm font-medium text-ink-muted">{children}</Text>;
}

export function PublishMusicSheet({ onClose, onPublished, projectId }: PublishMusicSheetProps) {
  const toast = useToast();
  const { colors } = useTheme();
  const { data: me } = useMyProfile();
  const { data: eligibleProjects, isLoading: loadingProjects } = useMyAudioProjects();
  const { data: licence } = useCurrentLicenceAgreement();
  const getProjectFile = useGetProjectFile();
  const uploadAsset = useUploadCatalogueAsset();
  const publishMusic = usePublishMusic();

  const [project, setProject] = useState<EligibleAudioProject | null>(null);
  const [signedAudioUrl, setSignedAudioUrl] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [artistName, setArtistName] = useState("");
  const [coverFile, setCoverFile] = useState<LocalFile | null>(null);
  const [clip, setClip] = useState<ClipResult | null>(null);
  const [contributors, setContributors] = useState<ContributorDraft[]>([]);
  const [usageMode, setUsageMode] = useState<"free" | "paid">("free");
  const [priceUsd, setPriceUsd] = useState("");
  const [rightsAccepted, setRightsAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default: publisher tags themselves as Artist — the most common case, fully editable.
  useEffect(() => {
    if (me && contributors.length === 0) {
      setContributors([
        {
          contributor_id: me.id,
          username: me.username,
          display_name: me.display_name,
          avatar_url: me.avatar_url,
          role: "artist",
          split_percent: 100,
        },
      ]);
      setArtistName((prev) => prev || me.display_name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  // Preselect the Project this sheet was opened for, the moment it shows up in the eligible list.
  useEffect(() => {
    if (!projectId || project) return;
    const match = eligibleProjects?.find((p) => p.id === projectId);
    if (match) void handleSelectProject(match);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, eligibleProjects, project]);

  async function handleSelectProject(p: EligibleAudioProject) {
    setProject(p);
    setTitle((prev) => prev || p.title);
    setAudioError(null);
    setSignedAudioUrl(null);
    setClip(null);

    if (!p.audio_file_path) {
      setAudioError(
        "This Project only has a link to the full track, not an uploaded file — upload an audio file to it first so Akọ can pick a real 30-second clip.",
      );
      return;
    }
    try {
      const url = await getProjectFile.mutateAsync({ projectId: p.id, kind: "audio", action: "stream" });
      setSignedAudioUrl(url);
    } catch (err) {
      setAudioError(await resolveFunctionErrorMessage(err, "Couldn't load this Project's audio."));
    }
  }

  async function pickCover() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9 });
    if (!res.canceled && res.assets[0]) setCoverFile(fromImagePickerAsset(res.assets[0]));
  }

  async function handlePublish() {
    setError(null);

    if (!project) return setError("Select a Project first.");
    if (!title.trim()) return setError("Add a song title.");
    if (!artistName.trim()) return setError("Add a primary artist name.");
    if (!clip) return setError("Select the 30-second clip first.");
    if (contributors.length === 0) return setError("Tag at least one contributor.");
    if (!contributors.some((c) => c.role === "artist")) return setError("At least one contributor must be tagged Artist.");
    if (!rightsAccepted) return setError("Accept the rights declaration to publish.");

    let price: number | null = null;
    if (usageMode === "paid") {
      price = Number(priceUsd);
      if (!Number.isFinite(price) || price <= 0) return setError("Set a usage price greater than $0.");
      const splitTotal = contributors.reduce((sum, c) => sum + (c.split_percent || 0), 0);
      if (Math.abs(splitTotal - 100) > 0.01) return setError(`Contributor splits must total exactly 100% (currently ${splitTotal}%).`);
    }

    try {
      const clipPath = await uploadAsset.mutateAsync({ file: clip.file, extension: "wav" });
      let coverPath: string | null = null;
      if (coverFile) {
        const ext = coverFile.name.split(".").pop() || "jpg";
        coverPath = await uploadAsset.mutateAsync({ file: coverFile, extension: ext });
      }

      const result = await publishMusic.mutateAsync({
        project_id: project.id,
        title: title.trim(),
        primary_artist_name: artistName.trim(),
        cover_image_path: coverPath,
        clip_file_path: clipPath,
        clip_start_seconds: clip.startSeconds,
        clip_duration_seconds: clip.durationSeconds,
        usage_mode: usageMode,
        usage_price_usd: price,
        rights_declaration_accepted: true,
        contributors,
      });

      toast(`${title.trim()} is live in the Akọ catalogue.`, { variant: "success" });
      onPublished?.(result.catalogue.id);
      onClose();
    } catch (err) {
      setError(friendlyError(err, "Couldn't publish this song."));
    }
  }

  const isPublishing = uploadAsset.isPending || publishMusic.isPending;
  const inputClass = "rounded-xl border border-border bg-canvas px-3 py-2.5 text-sm text-ink";

  return (
    <SheetFrame
      title="Publish Music to Akọ"
      onClose={onClose}
      zIndex={60}
      avoidKeyboard
    >
      {!project ? (
        <ProjectPicker projects={eligibleProjects} isLoading={loadingProjects} onSelect={(p) => void handleSelectProject(p)} />
      ) : (
        <View>
          <Pressable onPress={() => setProject(null)} accessibilityRole="button" className="mb-4 self-start">
            <Text className="text-xs text-accent">← Choose a different Project</Text>
          </Pressable>

          {audioError ? <Text className="mb-4 text-sm text-danger">{audioError}</Text> : null}

          {signedAudioUrl ? (
            <>
              <View className="mb-4">
                <Label>Song title</Label>
                <TextInput value={title} onChangeText={setTitle} maxLength={100} selectionColor={colors.accent} className={inputClass} />
              </View>

              <View className="mb-4">
                <Label>Primary artist</Label>
                <TextInput value={artistName} onChangeText={setArtistName} maxLength={80} selectionColor={colors.accent} className={inputClass} />
              </View>

              <View className="mb-4">
                <Label>
                  Cover art <Text className="font-normal">(optional)</Text>
                </Label>
                <Pressable
                  onPress={() => void pickCover()}
                  accessibilityRole="button"
                  className="flex-row items-center gap-2 rounded-xl border border-border bg-canvas px-3 py-2.5"
                >
                  <Icon as={FileAudio} size={16} className="text-ink-muted" />
                  <Text numberOfLines={1} className="flex-1 text-sm text-ink-muted">
                    {coverFile ? coverFile.name : "Choose image"}
                  </Text>
                </Pressable>
              </View>

              <View className="mb-4 overflow-hidden rounded-xl border border-border">
                <ClipSelector audioUrl={signedAudioUrl} onConfirm={setClip} onCancel={() => setClip(null)} />
                {clip ? (
                  <Text className="px-4 pb-3 text-xs text-accent">
                    Clip set: {clip.startSeconds.toFixed(0)}s–{(clip.startSeconds + clip.durationSeconds).toFixed(0)}s
                  </Text>
                ) : null}
              </View>

              <ContributorPicker contributors={contributors} onChange={setContributors} usageMode={usageMode} />

              <View className="mb-4">
                <Label>Usage</Label>
                <View className="flex-row gap-2">
                  {(
                    [
                      ["free", "Free — discovery"],
                      ["paid", "Paid usage"],
                    ] as const
                  ).map(([mode, text]) => (
                    <Pressable
                      key={mode}
                      onPress={() => setUsageMode(mode)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: usageMode === mode }}
                      className={`flex-1 items-center rounded-xl border py-2.5 ${usageMode === mode ? "border-cta bg-cta" : "border-border bg-canvas"}`}
                    >
                      <Text className={`text-sm font-medium ${usageMode === mode ? "text-white" : "text-ink-muted"}`}>{text}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text className="mt-1.5 text-xs text-ink-muted">
                  {usageMode === "free"
                    ? "Free usage is promotion and discovery — Akọ doesn't owe you money when someone uses it."
                    : "People will see this price before using the song in a post."}
                </Text>
                {usageMode === "paid" ? (
                  <View className="mt-2 flex-row items-center gap-2">
                    <Text className="text-sm text-ink-muted">$</Text>
                    <TextInput
                      value={priceUsd}
                      onChangeText={setPriceUsd}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={colors.inkMuted}
                      selectionColor={colors.accent}
                      className="w-24 rounded-xl border border-border bg-canvas px-3 py-2 text-sm text-ink"
                    />
                  </View>
                ) : null}
              </View>

              <View className="mb-4 rounded-xl border border-border bg-canvas p-3">
                <Text className="text-xs leading-relaxed text-ink-muted">{licence?.body}</Text>
              </View>

              <Pressable
                onPress={() => setRightsAccepted((v) => !v)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: rightsAccepted }}
                className="mb-4 flex-row items-start gap-2"
              >
                <View
                  className={`mt-0.5 h-4 w-4 items-center justify-center rounded border ${rightsAccepted ? "border-cta bg-cta" : "border-border bg-canvas"}`}
                >
                  {rightsAccepted ? <Text className="text-[10px] font-bold leading-none text-white">✓</Text> : null}
                </View>
                <Text className="flex-1 text-xs text-ink">
                  I confirm I own or control the rights necessary to publish this music on Akọ and authorize its use in Akọ posts under the
                  Akọ Music Licence.
                </Text>
              </Pressable>

              {error ? <Text className="mb-3 text-sm text-danger">{error}</Text> : null}

              <Pressable
                onPress={() => void handlePublish()}
                disabled={isPublishing}
                accessibilityRole="button"
                className={`items-center rounded-full bg-cta py-3 ${isPublishing ? "opacity-50" : ""}`}
              >
                <Text className="text-sm font-medium text-white">{isPublishing ? "Publishing…" : "Publish to Akọ"}</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      )}
    </SheetFrame>
  );
}

function ProjectPicker({
  projects,
  isLoading,
  onSelect,
}: {
  projects: EligibleAudioProject[] | undefined;
  isLoading: boolean;
  onSelect: (p: EligibleAudioProject) => void;
}) {
  if (isLoading) {
    return <Text className="py-8 text-center text-sm text-ink-muted">Loading your Projects…</Text>;
  }
  if (!projects || projects.length === 0) {
    return (
      <Text className="py-8 text-center text-sm text-ink-muted">
        You don't have an Audio Project yet. Create a Media Project with an audio channel first, then come back here to publish it to the
        catalogue.
      </Text>
    );
  }
  return (
    <View>
      <Text className="mb-3 text-sm text-ink-muted">Choose the Audio Project you're publishing from.</Text>
      <View className="gap-1">
        {projects.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => onSelect(p)}
            accessibilityRole="button"
            className="flex-row items-center gap-3 rounded-xl px-2 py-2.5 active:bg-canvas"
          >
            <Avatar src={p.thumbnail_url} name={p.title} size="sm" />
            <Text numberOfLines={1} className="flex-1 text-sm text-ink">
              {p.title}
            </Text>
            <Icon as={ChevronRight} size={16} className="text-ink-muted" />
          </Pressable>
        ))}
      </View>
    </View>
  );
}
