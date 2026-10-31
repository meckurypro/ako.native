// src/lib/cropImage.ts
// Crop a picked image to an exact aspect ratio (centered) and re-encode it small.
//
// A page's hero slides must all share one aspect ratio, and the banner has its own. Rather than
// reject anything that isn't already that shape, we crop to it on upload — so what the editor
// previews is exactly what visitors see. (The web app does the same with a canvas.)
import { File as FsFile } from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";

import { getImageSize, type LocalFile } from "./localFile";
import type { ThumbSpec } from "./thumbnailSpec";

export async function cropToAspect(file: LocalFile, aspect: number, opts: { maxWidth?: number } = {}): Promise<LocalFile> {
  const maxWidth = opts.maxWidth ?? 1600;

  let size: { width: number; height: number };
  try {
    size = await getImageSize(file);
  } catch {
    throw new Error("That image couldn't be read. Try a JPEG, PNG or WebP.");
  }

  // Largest centered rectangle of the requested shape.
  let cropW = size.width;
  let cropH = Math.round(cropW / aspect);
  if (cropH > size.height) {
    cropH = size.height;
    cropW = Math.round(cropH * aspect);
  }
  const originX = Math.round((size.width - cropW) / 2);
  const originY = Math.round((size.height - cropH) / 2);

  try {
    const ctx = ImageManipulator.ImageManipulator.manipulate(file.uri);
    ctx.crop({ originX, originY, width: cropW, height: cropH });
    if (cropW > maxWidth) ctx.resize({ width: maxWidth });
    const rendered = await ctx.renderAsync();
    const saved = await rendered.saveAsync({ format: ImageManipulator.SaveFormat.JPEG, compress: 0.85 });
    let bytes = 0;
    try {
      bytes = new FsFile(saved.uri).size ?? 0;
    } catch {
      bytes = 0;
    }
    return { uri: saved.uri, name: `page-image-${Date.now()}.jpg`, type: "image/jpeg", size: bytes, width: saved.width, height: saved.height };
  } catch {
    throw new Error("Couldn't process that image.");
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Project thumbnails: crop to a ThumbSpec (lib/thumbnailSpec.ts).
// ---------------------------------------------------------------------------------------------------------------

/**
 * Crop an explicit source rectangle (in the picture's own pixels) and export it in the spec's shape. The output is
 * never larger than the rectangle (a small picture isn't blown up) nor than the spec's own size.
 */
export async function cropRectToSpec(
  file: LocalFile,
  rect: { originX: number; originY: number; width: number; height: number },
  spec: ThumbSpec
): Promise<LocalFile> {
  const outW = Math.max(16, Math.min(spec.outWidth, Math.round(rect.width)));
  const outH = Math.max(16, Math.round(outW / spec.ratio));
  try {
    const ctx = ImageManipulator.ImageManipulator.manipulate(file.uri);
    ctx.crop({
      originX: Math.max(0, Math.round(rect.originX)),
      originY: Math.max(0, Math.round(rect.originY)),
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height)),
    });
    ctx.resize({ width: outW, height: outH });
    const rendered = await ctx.renderAsync();
    const saved = await rendered.saveAsync({ format: ImageManipulator.SaveFormat.JPEG, compress: 0.88 });
    let bytes = 0;
    try {
      bytes = new FsFile(saved.uri).size ?? 0;
    } catch {
      bytes = 0;
    }
    return { uri: saved.uri, name: `thumbnail-${Date.now()}.jpg`, type: "image/jpeg", size: bytes, width: saved.width, height: saved.height };
  } catch {
    throw new Error("Couldn't process that image.");
  }
}

/** Centre-crop a picture that is already (about) the spec's shape to exactly that shape and size. No UI. */
export async function cropToSpec(file: LocalFile, spec: ThumbSpec): Promise<LocalFile> {
  let size: { width: number; height: number };
  try {
    size = await getImageSize(file);
  } catch {
    throw new Error("That image couldn't be read. Try a JPEG, PNG or WebP.");
  }
  let w = size.width;
  let h = Math.round(w / spec.ratio);
  if (h > size.height) {
    h = size.height;
    w = Math.round(h * spec.ratio);
  }
  return cropRectToSpec(file, { originX: Math.round((size.width - w) / 2), originY: Math.round((size.height - h) / 2), width: w, height: h }, spec);
}
