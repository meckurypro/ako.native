// src/hooks/useGuestPass.ts
//
// Guest Pass data layer (port of the web hook). Two audiences:
//   • Creators: create / list / revoke passes for a project they own (authenticated RPCs).
//   • Guests: read a pass's content (anon-safe RPC) and fetch hosted files (guest-pass-file edge function).

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// ------------------------------------------------------------------ types
export type GuestPassStatus = "valid" | "expired" | "revoked" | "unavailable" | "not_found";

export interface GuestPassCreator {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface GuestPassPage {
  username: string;
  name: string;
  avatar_url: string | null;
}

export interface GuestPassProject {
  id: string;
  title: string;
  description: string | null;
  project_type: string;
  thumbnail_url: string | null;
  thumbnail_shape?: string | null;
  supporting_image_urls: string[] | null;
  price_usd: number;
  promo_price_usd: number | null;
  is_private: boolean;
  external_url: string | null;
  slug: string | null;
}

export interface GuestPassView {
  status: GuestPassStatus;
  server_now: string;
  expires_at?: string;
  creator?: GuestPassCreator | null;
  page?: GuestPassPage | null;
  project?: GuestPassProject;
  // Type-specific payload — shape depends on project.project_type (see get_guest_pass_view).
  detail?: Record<string, any>;
  // Present on non-valid answers for PUBLIC projects only.
  project_title?: string | null;
  project_id?: string | null;
  project_slug?: string | null;
}

export interface GuestPassRow {
  pass_id: string;
  token: string;
  created_at: string;
  expires_at: string;
  open_count: number;
  last_opened_at: string | null;
}

// ------------------------------------------------------------------ guest
export function useGuestPassView(token: string | undefined) {
  return useQuery({
    queryKey: ["guest-pass", token],
    queryFn: async (): Promise<GuestPassView> => {
      const { data, error } = await supabase.rpc("get_guest_pass_view", { p_token: token });
      if (error) throw error;
      return data as GuestPassView;
    },
    enabled: !!token,
    // Every read counts as an "open" for the creator, and the content can't change in a way that matters inside the
    // pass window — so never refetch on focus/reconnect.
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60 * 7,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });
}

/**
 * The pass's expiry as a timestamp on THIS device's clock. The server tells us how long is left (expires_at −
 * server_now) so a wrong device clock can't make a live pass look expired, or an expired one look live.
 */
export function usePassDeadline(view: GuestPassView | undefined, fetchedAt: number | undefined): string | null {
  const expiresAt = view?.expires_at;
  const serverNow = view?.server_now;
  return useMemo(() => {
    if (!expiresAt || !serverNow || !fetchedAt) return null;
    const remaining = new Date(expiresAt).getTime() - new Date(serverNow).getTime();
    return new Date(fetchedAt + remaining).toISOString();
  }, [expiresAt, serverNow, fetchedAt]);
}

export interface GuestPassFile {
  file_id: string | null;
  url: string;
  file_name: string;
  size_bytes: number | null;
}

export type GuestPassFileKind = "file" | "audio" | "video" | "image" | "book";

export class GuestPassExpiredError extends Error {
  constructor() {
    super("This pass has expired");
    this.name = "GuestPassExpiredError";
  }
}

export function useGuestPassFile(token: string) {
  return useMutation({
    mutationFn: async (args: {
      kind: GuestPassFileKind;
      fileId?: string | null;
      action?: "download" | "stream";
    }): Promise<{ url: string; file_name?: string }> => {
      const { data, error } = await supabase.functions.invoke("guest-pass-file", {
        body: { token, kind: args.kind, file_id: args.fileId ?? undefined, action: args.action ?? "download" },
      });
      if (error) {
        // supabase-js hides the JSON body of a non-2xx — read it to tell "expired" from a plain failure.
        const ctx = (error as { context?: Response }).context;
        try {
          const body = await ctx?.json();
          if (body?.code === "expired" || body?.code === "revoked") throw new GuestPassExpiredError();
          if (body?.error) throw new Error(body.error);
        } catch (e) {
          if (e instanceof GuestPassExpiredError) throw e;
          if (e instanceof Error && e.message && e.name !== "SyntaxError") throw e;
        }
        throw error;
      }
      if (data?.error) throw new Error(data.error);
      if (args.kind === "file") {
        const f = (data.files as GuestPassFile[] | undefined)?.[0];
        if (!f) throw new Error("File not found");
        return { url: f.url, file_name: f.file_name };
      }
      return { url: data.url as string };
    },
  });
}

// ------------------------------------------------------------------ creator
export function useGuestPasses(projectId: string | undefined) {
  return useQuery({
    queryKey: ["guest-passes", projectId],
    queryFn: async (): Promise<GuestPassRow[]> => {
      const { data, error } = await supabase.rpc("list_project_guest_passes", { p_project_id: projectId });
      if (error) throw error;
      return (data ?? []) as GuestPassRow[];
    },
    enabled: !!projectId,
    staleTime: 15_000,
  });
}

export function useCreateGuestPass(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ pass_id: string; token: string; expires_at: string }> => {
      const { data, error } = await supabase.rpc("create_project_guest_pass", { p_project_id: projectId });
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as { pass_id: string; token: string; expires_at: string };
      if (!row) throw new Error("Couldn't create the pass.");
      return row;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["guest-passes", projectId] }),
  });
}

export function useRevokeGuestPass(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (passId: string) => {
      const { error } = await supabase.rpc("revoke_project_guest_pass", { p_pass_id: passId });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["guest-passes", projectId] }),
  });
}
