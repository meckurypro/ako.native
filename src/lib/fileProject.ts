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
