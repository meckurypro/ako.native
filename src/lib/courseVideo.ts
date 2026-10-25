// src/lib/courseVideo.ts
// Course lesson videos live in the private `course-videos` bucket. Uploading is done from the web builder for now;
// the app plays them (signed link) and cleans them up when a lesson is deleted.
import { supabase } from "./supabase";

export const COURSE_VIDEO_BUCKET = "course-videos";

export async function removeCourseVideos(paths: (string | null | undefined)[]): Promise<void> {
  const list = paths.filter((p): p is string => !!p);
  if (list.length === 0) return;
  try {
    await supabase.storage.from(COURSE_VIDEO_BUCKET).remove(list);
  } catch {
    /* a leftover file is harmless */
  }
}

export async function signedCourseVideoUrl(path: string, expiresInSeconds = 6 * 3600): Promise<string> {
  const { data, error } = await supabase.storage.from(COURSE_VIDEO_BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) throw error ?? new Error("Couldn't load this video.");
  return data.signedUrl;
}
