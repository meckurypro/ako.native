// src/lib/cropImage.ts
// Crop a picked image to an exact aspect ratio (centered) and re-encode it small.
//
// A page's hero slides must all share one aspect ratio, and the banner has its own. Rather than
// reject anything that isn't already that shape, we crop to it on upload — so what the editor
// previews is exactly what visitors see. (The web app does the same with a canvas.)
import { File as FsFile } from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";

import { getImageSize, type LocalFile } from "./localFile";

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
