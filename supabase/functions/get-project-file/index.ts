// ============================================================
// AKỌ — Edge Function: get-project-file
// ============================================================
// Returns a short-lived signed URL for a project's uploaded file,
// stored in the private-content bucket (which has NO public or
// authenticated read policy at all). This function IS the access
// gate: it only mints a URL if the requester is the project owner,
// has a purchases row, or the project is free.
//
// `kind` selects which file path column to resolve:
//  - "file"  (default) → project_files (a File project can hold several files). `file_id` picks one; without it
//              the FIRST file is used, which is exactly what older app builds expect. The response carries
//              `file_name`: the name the saved copy should bear (the uploaded file's own name unless the creator
//              typed a title for that slot). Falls back to projects.file_path if a project somehow has no rows.
//              `all: true` is the batch form ("download all" — as a zip or one by one): ONE call returns every
//              file as `files: [{ file_id, url, file_name, size_bytes }]` (names made unique, in slot order) under
//              ONE download attempt, so the whole batch counts as a single download.
//  - "audio" → project_media_details.audio_file_path
//  - "video" → project_media_details.video_file_path
//  - "image" → project_media_details.image_file_path
//  - "book"  → project_book_details.file_path (content_source='upload'),
//              additionally gated per `action` by allow_download /
//              allow_read_in_app.
//
// For kind "file" this also opens a download attempt row
// (project_file_downloads, remembering which file — null for a batch) and returns its id as `download_id`. The
// client reports the attempt finished via the complete_file_download
// RPC once the whole file (or the whole batch) has arrived — that is what bumps the
// project's download_count and notifies the creator.
//
// Deploy: supabase functions deploy get-project-file
// Secrets required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
// ============================================================

import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// Long enough to start a download of a large (up to 1GB) file on a slow connection — and, for a batch, long enough
// to work through every file in turn.
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60;

type FileKind = "file" | "audio" | "video" | "image" | "book";
type FileAction = "download" | "stream";

interface FileRequest {
  project_id: string;
  kind?: FileKind;
  action?: FileAction;
  /** kind "file" only: which of the project's files. Omit for the first. */
  file_id?: string;
  /** kind "file" only: every file of the project in one go (see header). Ignored when file_id is given. */
  all?: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "Song.wav", "Song.wav" → "Song.wav", "Song (2).wav" — two slots may legitimately end up with the same name. */
function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const key = name.toLowerCase();
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    if (n === 1) return name;
    const dot = name.lastIndexOf(".");
    return dot > 0 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`;
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Missing Authorization header" }, 401);
  }

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: authError } = await userClient.auth.getUser();

  if (authError || !user) {
    return jsonResponse({ error: "Invalid or expired session" }, 401);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const { project_id, kind = "file", action = "download", file_id, all }: FileRequest = await req.json();

    if (!project_id) {
      return jsonResponse({ error: "project_id is required" }, 400);
    }
    if (file_id !== undefined && file_id !== null && !UUID_RE.test(file_id)) {
      return jsonResponse({ error: "file_id is not valid" }, 400);
    }

    const { data: project, error: projectError } = await admin
      .from("projects")
      .select("owner_id, price_usd, file_path, is_active")
      .eq("id", project_id)
      .maybeSingle();

    if (projectError || !project || !project.is_active) {
      return jsonResponse({ error: "Project not found" }, 404);
    }

    // Access check: owner, OR free project, OR has a purchase record.
    const isOwner = project.owner_id === user.id;
    const isFree = Number(project.price_usd) <= 0;

    let hasPurchased = false;
    if (!isOwner && !isFree) {
      const { data: purchase } = await admin
        .from("purchases")
        .select("id")
        .eq("project_id", project_id)
        .eq("buyer_id", user.id)
        .maybeSingle();
      hasPurchased = !!purchase;
    }

    if (!isOwner && !isFree && !hasPurchased) {
      return jsonResponse({ error: "Purchase required to access this file" }, 403);
    }

    // ── Batch: every file of a File project, one attempt ──
    if (kind === "file" && all && !file_id) {
      const { data: rows, error: rowsError } = await admin
        .from("project_files")
        .select("id, file_path, download_name, size_bytes")
        .eq("project_id", project_id)
        .order("position", { ascending: true });
      if (rowsError) throw rowsError;

      let list: { id: string | null; file_path: string; download_name: string; size_bytes: number | null }[] = rows ?? [];
      if (list.length === 0 && project.file_path) {
        // A project with no project_files rows yet: its legacy single file is the whole batch.
        const tail = String(project.file_path).split("/").pop() ?? "download";
        list = [{ id: null, file_path: project.file_path, download_name: tail, size_bytes: null }];
      }
      if (list.length === 0) {
        return jsonResponse({ error: "This project has no hosted file" }, 404);
      }

      const { data: signed, error: signManyError } = await admin.storage
        .from("private-content")
        .createSignedUrls(list.map((f) => f.file_path), SIGNED_URL_EXPIRY_SECONDS);
      if (signManyError || !signed || signed.length !== list.length || signed.some((s) => !s.signedUrl)) {
        throw signManyError ?? new Error("Failed to sign URLs");
      }

      let batchDownloadId: string | null = null;
      const { data: batchAttempt, error: batchAttemptError } = await admin
        .from("project_file_downloads")
        .insert({ project_id, user_id: user.id, file_id: null })
        .select("id")
        .single();
      if (batchAttemptError) {
        console.error("get-project-file: could not log batch download attempt:", batchAttemptError);
      } else {
        batchDownloadId = batchAttempt.id;
      }

      const names = uniqueNames(list.map((f) => f.download_name));
      return jsonResponse(
        {
          download_id: batchDownloadId,
          expires_in: SIGNED_URL_EXPIRY_SECONDS,
          files: list.map((f, i) => ({
            file_id: f.id,
            url: signed[i].signedUrl,
            file_name: names[i],
            size_bytes: f.size_bytes,
          })),
        },
        200,
      );
    }

    let filePath: string | null = null;
    let fileRowId: string | null = null;
    let fileName: string | null = null;

    if (kind === "file") {
      // Access was already decided above, at the PROJECT level (price/purchase) — files inherit it.
      const { data: fileRows, error: fileError } = file_id
        ? await admin
            .from("project_files")
            .select("id, file_path, download_name")
            .eq("project_id", project_id)
            .eq("id", file_id)
            .limit(1)
        : await admin
            .from("project_files")
            .select("id, file_path, download_name")
            .eq("project_id", project_id)
            .order("position", { ascending: true })
            .limit(1);
      if (fileError) throw fileError;
      const fileRow = fileRows?.[0] ?? null;
      if (file_id && !fileRow) {
        return jsonResponse({ error: "File not found" }, 404);
      }
      filePath = fileRow?.file_path ?? project.file_path;
      fileRowId = fileRow?.id ?? null;
      fileName = fileRow?.download_name ?? null;
    } else if (kind === "audio" || kind === "video" || kind === "image") {
      const { data: media, error: mediaError } = await admin
        .from("project_media_details")
        .select("audio_file_path, video_file_path, image_file_path")
        .eq("project_id", project_id)
        .maybeSingle();

      if (mediaError || !media) {
        return jsonResponse({ error: "This project has no hosted media" }, 404);
      }

      filePath =
        kind === "audio" ? media.audio_file_path :
        kind === "video" ? media.video_file_path :
        media.image_file_path;
    } else if (kind === "book") {
      const { data: book, error: bookError } = await admin
        .from("project_book_details")
        .select("file_path, allow_download, allow_read_in_app")
        .eq("project_id", project_id)
        .maybeSingle();

      if (bookError || !book) {
        return jsonResponse({ error: "This project has no hosted book file" }, 404);
      }

      if (!isOwner) {
        if (action === "download" && !book.allow_download) {
          return jsonResponse({ error: "Download is not enabled for this book" }, 403);
        }
        if (action === "stream" && !book.allow_read_in_app) {
          return jsonResponse({ error: "In-app reading is not enabled for this book" }, 403);
        }
      }

      filePath = book.file_path;
    }

    if (!filePath) {
      return jsonResponse({ error: "This project has no hosted file" }, 404);
    }

    const { data: signedUrlData, error: signError } = await admin.storage
      .from("private-content")
      .createSignedUrl(filePath, SIGNED_URL_EXPIRY_SECONDS);

    if (signError || !signedUrlData) {
      throw signError ?? new Error("Failed to sign URL");
    }

    // File projects: open a download attempt so a completed download can be counted exactly once.
    let downloadId: string | null = null;
    if (kind === "file") {
      const { data: attempt, error: attemptError } = await admin
        .from("project_file_downloads")
        .insert({ project_id, user_id: user.id, file_id: fileRowId })
        .select("id")
        .single();
      if (attemptError) {
        console.error("get-project-file: could not log download attempt:", attemptError);
      } else {
        downloadId = attempt.id;
      }
    }

    return jsonResponse(
      {
        url: signedUrlData.signedUrl,
        expires_in: SIGNED_URL_EXPIRY_SECONDS,
        download_id: downloadId,
        file_id: fileRowId,
        file_name: fileName,
      },
      200,
    );

  } catch (err) {
    console.error("get-project-file error:", err);
    return jsonResponse({ error: "Failed to generate file access" }, 500);
  }
});

function jsonResponse(body: object, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
