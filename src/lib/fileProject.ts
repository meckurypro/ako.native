// src/lib/fileProject.ts
// File projects never have a custom thumbnail: everywhere one would appear (profile grid, project page, post
// embed, pickers, mini cards) they show the 📂 folder icon instead. Existing File rows may still carry an old
// thumbnail_url — it is simply ignored for display.
export const FILE_FOLDER_EMOJI = "📂";
/** Hosted project files can be up to 1GB. Keep in sync with the private-content bucket's file_size_limit. */
export const MAX_PROJECT_FILE_BYTES = 1024 * 1024 * 1024;
export const MAX_PROJECT_FILE_LABEL = "1GB";

export function isFileType(projectType: string | null | undefined): boolean {
  return projectType === "file";
}

export function formatDownloadCount(n: number | null | undefined): string {
  const count = Math.max(0, Number(n ?? 0));
  return `${count.toLocaleString()} download${count === 1 ? "" : "s"}`;
}

/** "12.4 MB" / "830 KB" — for showing a picked file's size. */
export function formatFileSize(bytes: number | null | undefined): string {
  const n = Math.max(0, Number(bytes ?? 0));
  if (n >= 1024 * 1024 * 1024) return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(n >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

/**
 * How many files one File project can hold. One for everyone; up to six for verified, unrestricted accounts — the
 * same rule as profile websites. The database enforces it (project_file_limit in
 * supabase/ako_multi_file_projects.sql); this only decides how much of the form to show.
 */
export const MAX_PROJECT_FILES_VERIFIED = 6;
export const MAX_PROJECT_FILES_DEFAULT = 1;

export function maxProjectFiles(canAddMore: boolean): number {
  return canAddMore ? MAX_PROJECT_FILES_VERIFIED : MAX_PROJECT_FILES_DEFAULT;
}

/** "My Song.final.wav" → "My Song.final" — what a slot's title box shows as its placeholder. */
export function stripExtension(name: string): string {
  return name.replace(/\.[A-Za-z0-9]{1,10}$/, "");
}
