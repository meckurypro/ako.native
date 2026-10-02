// src/lib/localFile.ts
// The browser hands uploaders a `File`. On native, pickers and the recorder
// hand back a file *URI* plus metadata. LocalFile is that shape, so every
// upload hook has one input type regardless of where the file came from.
import { File as FsFile } from "expo-file-system";
import type { DocumentPickerAsset } from "expo-document-picker";
import type { ImagePickerAsset } from "expo-image-picker";
import { Image } from "react-native";

export interface LocalFile {
  uri: string;
  name: string;
  /** MIME type, e.g. "image/jpeg". */
  type: string;
  /** Size in bytes (0 if it could not be determined). */
  size: number;
  width?: number;
  height?: number;
}

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "audio/mp4": "m4a",
  "application/pdf": "pdf",
};

function statSize(uri: string): number {
  try {
    return new FsFile(uri).size ?? 0;
  } catch {
    return 0;
  }
}

export function fromImagePickerAsset(asset: ImagePickerAsset): LocalFile {
  const type = asset.mimeType ?? (asset.type === "video" ? "video/mp4" : "image/jpeg");
  const ext = EXT_BY_MIME[type] ?? (asset.type === "video" ? "mp4" : "jpg");
  return {
    uri: asset.uri,
    name: asset.fileName ?? `${asset.type ?? "image"}-${Date.now()}.${ext}`,
    type,
    size: asset.fileSize ?? statSize(asset.uri),
    width: asset.width,
    height: asset.height,
  };
}

export function fromDocumentPickerAsset(asset: DocumentPickerAsset): LocalFile {
  return {
    uri: asset.uri,
    name: asset.name,
    type: asset.mimeType ?? "application/octet-stream",
    size: asset.size ?? statSize(asset.uri),
  };
}

/** File extension without the dot, falling back to the MIME type, then "bin". */
export function fileExtension(file: Pick<LocalFile, "name" | "type">): string {
  const fromName = file.name.includes(".") ? file.name.split(".").pop() : undefined;
  return (fromName || EXT_BY_MIME[file.type] || "bin").toLowerCase();
}

/** Pixel size of an image — from picker metadata when present, else decoded. Rejects if unreadable. */
export function getImageSize(file: LocalFile): Promise<{ width: number; height: number }> {
  if (file.width && file.height) return Promise.resolve({ width: file.width, height: file.height });
  return new Promise((resolve, reject) => {
    Image.getSize(
      file.uri,
      (width, height) => (width > 0 && height > 0 ? resolve({ width, height }) : reject(new Error("empty image"))),
      (err) => reject(err instanceof Error ? err : new Error("unreadable image"))
    );
  });
}
