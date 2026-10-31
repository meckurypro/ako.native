// src/hooks/useThumbnailCropper.tsx
//
// One call that turns "a picture the person picked" into "a picture in exactly the shape this project's thumbnail
// needs" (port of the web hook):
//   const cropper = useThumbnailCropper();
//   const ready = await cropper.request(file, spec);   // LocalFile, or null if they cancelled
//   …
//   return <>{…}{cropper.element}</>;
// A picture that is already the right shape is centre-cropped and resized silently. Anything else opens the crop
// screen, locked to the required shape, so the person decides what is kept. Several pictures queue one after another.
import { useCallback, useState, type ReactNode } from "react";
import { ThumbnailCropSheet } from "@/components/project/ThumbnailCropSheet";
import { cropToSpec } from "@/lib/cropImage";
import { getImageSize, type LocalFile } from "@/lib/localFile";
import { matchesThumbSpec, type ThumbSpec } from "@/lib/thumbnailSpec";

interface Pending {
  id: number;
  file: LocalFile;
  spec: ThumbSpec;
  title?: string;
  note?: string;
  resolve: (file: LocalFile | null) => void;
}

let nextId = 1;

export function useThumbnailCropper(): {
  request: (file: LocalFile, spec: ThumbSpec, opts?: { title?: string; note?: string }) => Promise<LocalFile | null>;
  element: ReactNode;
} {
  const [queue, setQueue] = useState<Pending[]>([]);

  const request = useCallback(async (file: LocalFile, spec: ThumbSpec, opts: { title?: string; note?: string } = {}): Promise<LocalFile | null> => {
    let size: { width: number; height: number };
    try {
      size = await getImageSize(file);
    } catch {
      throw new Error("That image couldn't be read. Try a JPEG, PNG or WebP.");
    }
    if (matchesThumbSpec(size.width, size.height, spec)) return cropToSpec(file, spec);
    return new Promise<LocalFile | null>((resolve) => {
      setQueue((q) => [...q, { id: nextId++, file: { ...file, width: size.width, height: size.height }, spec, title: opts.title, note: opts.note, resolve }]);
    });
  }, []);

  const current = queue[0];
  function finish(result: LocalFile | null) {
    if (!current) return;
    current.resolve(result);
    setQueue((q) => q.slice(1));
  }

  const element = current ? (
    <ThumbnailCropSheet
      key={current.id}
      file={current.file}
      spec={current.spec}
      title={current.title}
      note={current.note}
      onCancel={() => finish(null)}
      onConfirm={(cropped) => finish(cropped)}
    />
  ) : null;

  return { request, element };
}
