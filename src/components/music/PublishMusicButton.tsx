// src/components/music/PublishMusicButton.tsx
//
// Entry point for "Publish Music to Akọ" on an eligible Audio Project's own detail page
// (owner-only). Self-contained: checks project_media_details itself via useMediaDetails, so
// dropping this into ProjectDetail is a single conditional line.
import { Music } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useMyPublishedMusic } from "@/hooks/useMusicCatalogue";
import { useMediaDetails } from "@/hooks/useProjectTypeDetails";
import { PublishMusicSheet } from "./PublishMusicSheet";

export function PublishMusicButton({ projectId }: { projectId: string }) {
  const { data: mediaDetails } = useMediaDetails(projectId);
  const { data: myMusic } = useMyPublishedMusic();
  const [open, setOpen] = useState(false);

  if (!mediaDetails?.has_audio) return null;

  const alreadyPublished = myMusic?.find((m) => m.project_id === projectId && m.publication_status === "published");

  return (
    <View className="mb-4">
      {alreadyPublished ? (
        <View className="flex-row items-center gap-2 rounded-xl bg-accent-soft px-3 py-2.5">
          <Icon as={Music} size={16} className="text-accent" />
          <Text className="flex-1 text-sm text-accent">Published to the Akọ catalogue as "{alreadyPublished.title}"</Text>
        </View>
      ) : (
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          className="flex-row items-center justify-center gap-2 rounded-xl border border-border py-2.5"
        >
          <Icon as={Music} size={16} className="text-accent" />
          <Text className="text-sm font-medium text-ink">Publish Music to Akọ</Text>
        </Pressable>
      )}

      {open ? <PublishMusicSheet projectId={projectId} onClose={() => setOpen(false)} /> : null}
    </View>
  );
}
