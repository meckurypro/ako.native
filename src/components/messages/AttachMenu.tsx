// src/components/messages/AttachMenu.tsx
// Attach options for the message composer — Document · Camera · Gallery — as the shared centred options list.
import { Camera, FileText, Image as ImageIcon } from "lucide-react-native";

import { OptionsModal, type OptionItem } from "@/components/ui/OptionsModal";
import { Icon } from "@/components/ui/styled";

/** Top-left of the composer in window coordinates. No longer used for placement (the list is centred); kept so callers compile. */
export interface AttachAnchor {
  x: number;
  y: number;
}

interface AttachMenuProps {
  anchor?: AttachAnchor;
  onGallery: () => void;
  onCamera: () => void;
  onDocument: () => void;
  onClose: () => void;
}

export function AttachMenu({ onGallery, onCamera, onDocument, onClose }: AttachMenuProps) {
  const items: OptionItem[] = [
    { key: "document", label: "Document", icon: <Icon as={FileText} size={22} className="text-overlay-ink" />, onSelect: onDocument },
    { key: "camera", label: "Camera", icon: <Icon as={Camera} size={22} className="text-overlay-ink" />, onSelect: onCamera },
    { key: "gallery", label: "Gallery", icon: <Icon as={ImageIcon} size={22} className="text-overlay-ink" />, onSelect: onGallery },
  ];
  // immediate: the pickers must start inside the tap itself, as before (close, then run).
  return <OptionsModal title="Attach" items={items} onClose={onClose} immediate />;
}
