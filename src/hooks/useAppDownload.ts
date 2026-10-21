// File: src/hooks/useAppDownload.ts
//
// Read side of the admin-managed "app download" row (app_download_settings, id = 1) — the same row the
// web Settings card and the admin page use. The native app only needs it to learn whether the admin has
// uploaded a newer Android APK than the one installed (see AppUpdateCard). Admin writes stay on the web.
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";

export const APP_RELEASES_BUCKET = "app-releases";
// The name the browser saves the file as, whatever the object is called in storage.
const APK_DOWNLOAD_NAME = "Ako.apk";

export interface AppDownloadSettings {
  id: number;
  android_store_url: string | null;
  ios_store_url: string | null;
  apk_path: string | null;
  apk_file_name: string | null;
  apk_size_bytes: number | null;
  apk_uploaded_at: string | null;
  updated_at: string;
}

export function useAppDownloadSettings(enabled = true) {
  return useQuery({
    queryKey: ["app-download-settings"],
    enabled,
    queryFn: async (): Promise<AppDownloadSettings | null> => {
      const { data, error } = await supabase.from("app_download_settings").select("*").eq("id", 1).maybeSingle();
      if (error) throw error;
      return data as AppDownloadSettings | null;
    },
    staleTime: 60_000,
  });
}

/** Public, download-forcing link to the current APK, or null when none has been uploaded. */
export function getApkDownloadUrl(settings: AppDownloadSettings | null | undefined): string | null {
  if (!settings?.apk_path) return null;
  return supabase.storage.from(APP_RELEASES_BUCKET).getPublicUrl(settings.apk_path, { download: APK_DOWNLOAD_NAME }).data.publicUrl;
}

export function formatApkSize(bytes: number | null | undefined): string {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}
