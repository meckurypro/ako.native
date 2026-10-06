// src/components/post/ArchivedPostModal.tsx
// Preview of one of your archived posts (with its Restore / Delete controls),
// opened from the Archive screen. Sits on a lower layer (40) so the sheets and
// dialogs the card opens appear above it.
import { X } from "lucide-react-native";
import { Pressable } from "react-native";

import { Modal } from "@/components/ui/Modal";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import type { PostWithAuthor } from "@/types/database";
import { PostCard } from "./PostCard";

export function ArchivedPostModal({ post, onClose }: { post: PostWithAuthor; onClose: () => void }) {
  return (
    <Modal onClose={onClose} ariaLabel="Archived post preview" maxWidth={576} bare zIndex={40}>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
        className="mb-3 flex-row items-center gap-1.5 self-start rounded-full bg-ink/70 px-3 py-1.5"
      >
        <Icon as={X} size={15} className="text-canvas" />
        <Text className="text-sm text-canvas">Close</Text>
      </Pressable>
      <PostCard post={post} isOwnerView />
    </Modal>
  );
}
