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
//  - "file"  (default) → projects.file_path
//  - "audio" → project_media_details.audio_file_path
//  - "video" → project_media_details.video_file_path
//  - "image" → project_media_details.image_file_path
//  - "book"  → project_book_details.file_path (content_source='upload'),
//              additionally gated per `action` by allow_download /
//              allow_read_in_app.
//
// For kind "file" this also opens a download attempt row
// (project_file_downloads) and returns its id as `download_id`. The
// client reports the attempt finished via the complete_file_download
// RPC once the whole file has arrived — that is what bumps the
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

// Long enough to start a download of a large (up to 1GB) file on a slow connection.
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60;

type FileKind = "file" | "audio" | "video" | "image" | "book";
type FileAction = "download" | "stream";

interface FileRequest {
  project_id: string;
  kind?: FileKind;
  action?: FileAction;
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
    const { project_id, kind = "file", action = "download" }: FileRequest = await req.json();

    if (!project_id) {
      return jsonResponse({ error: "project_id is required" }, 400);
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

    let filePath: string | null = null;

    if (kind === "file") {
      filePath = project.file_path;
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
        .insert({ project_id, user_id: user.id })
        .select("id")
        .single();
      if (attemptError) {
        console.error("get-project-file: could not log download attempt:", attemptError);
      } else {
        downloadId = attempt.id;
      }
    }

    return jsonResponse(
      { url: signedUrlData.signedUrl, expires_in: SIGNED_URL_EXPIRY_SECONDS, download_id: downloadId },
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
