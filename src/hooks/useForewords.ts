// src/hooks/useForewords.ts
// Forewords: a creator invites an existing user to preview a book or course and write a short endorsement.
// All state changes go through SECURITY DEFINER RPCs (invite / submit / decline / review / withdraw / revoke);
// the project_forewords table is read-only from the client. Approved forewords are written into the product itself
// (a locked "Foreword" chapter or module) by the database — see supabase/ako_forewords.sql.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";

export type ForewordStatus =
  | "invited"
  | "submitted"
  | "approved"
  | "declined"
  | "rejected"
  | "withdrawn"
  | "revoked";

export const FOREWORD_MIN = 20;
export const FOREWORD_MAX = 1500;
export const FOREWORD_CREDIT_MAX = 80;
export const FOREWORD_DISCLOSURE_MAX = 160;
export const FOREWORD_NOTE_MAX = 300;
export const FOREWORD_MAX_LIVE = 5;

export interface ForewordPerson {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export interface Foreword {
  id: string;
  project_id: string;
  invitee_id: string;
  invited_by: string;
  status: ForewordStatus;
  invite_note: string | null;
  body: string | null;
  credit_line: string | null;
  disclosure: string | null;
  published_body: string | null;
  published_credit_line: string | null;
  published_disclosure: string | null;
  invited_at: string;
  expires_at: string;
  responded_at: string | null;
  submitted_at: string | null;
  decided_at: string | null;
  updated_at: string;
}

export interface ForewordWithInvitee extends Foreword {
  invitee: ForewordPerson | null;
}

/** Only books and courses can have forewords. */
export function isForewordSupportedType(projectType: string | undefined | null): boolean {
  return projectType === "book" || projectType === "course";
}

/** An invite that is still open for the invitee (not expired, not answered). */
export function isInviteOpen(f: Pick<Foreword, "status" | "expires_at">): boolean {
  return f.status === "invited" && new Date(f.expires_at).getTime() > Date.now();
}

/** Mirrors can_preview_project_for_foreword(): live invite, or they've written one (submitted / approved). */
export function canPreviewWithForeword(f: Foreword | null | undefined): boolean {
  if (!f) return false;
  return f.status === "submitted" || f.status === "approved" || isInviteOpen(f);
}

/** Counts toward the creator's "5 in progress" limit — same rule the database enforces. */
export function isLiveForeword(f: Pick<Foreword, "status" | "expires_at">): boolean {
  return f.status === "submitted" || f.status === "approved" || isInviteOpen(f);
}

export const FOREWORD_STATUS_LABEL: Record<ForewordStatus, string> = {
  invited: "Invited",
  submitted: "Awaiting your review",
  approved: "Published",
  declined: "Declined",
  rejected: "Not published",
  withdrawn: "Withdrawn",
  revoked: "Invite cancelled",
};

const FOREWORD_COLUMNS =
  "id, project_id, invitee_id, invited_by, status, invite_note, body, credit_line, disclosure, published_body, published_credit_line, published_disclosure, invited_at, expires_at, responded_at, submitted_at, decided_at, updated_at";

/** Every foreword on a project — the creator's panel. RLS only returns rows to the creator and the invitee. */
export function useProjectForewords(projectId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["forewords", projectId],
    queryFn: async (): Promise<ForewordWithInvitee[]> => {
      const { data, error } = await supabase
        .from("project_forewords")
        .select(`${FOREWORD_COLUMNS}, invitee:profiles!project_forewords_invitee_id_fkey(id, username, display_name, avatar_url)`)
        .eq("project_id", projectId)
        .order("invited_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        ...row,
        invitee: Array.isArray(row.invitee) ? (row.invitee[0] ?? null) : (row.invitee ?? null),
      })) as ForewordWithInvitee[];
    },
    enabled: !!projectId && enabled,
  });
}

/** The signed-in user's own foreword row on a project (their invite / draft / published piece), or null. */
export function useMyForeword(projectId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-foreword", projectId, user?.id],
    queryFn: async (): Promise<Foreword | null> => {
      if (!user || !projectId) return null;
      const { data, error } = await supabase
        .from("project_forewords")
        .select(FOREWORD_COLUMNS)
        .eq("project_id", projectId)
        .eq("invitee_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return (data as Foreword | null) ?? null;
    },
    enabled: !!user && !!projectId,
  });
}

/**
 * Whether the viewer may read this project as a foreword invitee. Used to open the reader / course for a draft or
 * a paid project that the invitee hasn't bought. RLS grants the actual rows; this only decides which screen to show.
 */
export function useForewordPreview(projectId: string | undefined) {
  const query = useMyForeword(projectId);
  return {
    foreword: query.data ?? null,
    canPreview: canPreviewWithForeword(query.data),
    isLoading: query.isLoading,
  };
}

function invalidateForeword(queryClient: ReturnType<typeof useQueryClient>, projectId: string) {
  queryClient.invalidateQueries({ queryKey: ["forewords", projectId] });
  queryClient.invalidateQueries({ queryKey: ["my-foreword", projectId] });
  // An approve / remove / withdraw rewrites the locked Foreword chapter (book) or module (course).
  queryClient.invalidateQueries({ queryKey: ["book-chapters", projectId] });
  queryClient.invalidateQueries({ queryKey: ["course-modules", projectId] });
  queryClient.invalidateQueries({ queryKey: ["notifications"] });
}

function friendlyError(err: unknown, fallback: string): Error {
  const message = (err as { message?: string } | null)?.message;
  return new Error(message && message.length < 200 ? message : fallback);
}

export function useInviteForeword(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ inviteeId, note }: { inviteeId: string; note?: string }) => {
      const { error } = await supabase.rpc("invite_project_foreword", {
        p_project_id: projectId,
        p_invitee_id: inviteeId,
        p_note: note?.trim() || null,
      });
      if (error) throw friendlyError(error, "Couldn't send the invite.");
    },
    onSuccess: () => invalidateForeword(queryClient, projectId),
  });
}

export function useRevokeForeword(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (forewordId: string) => {
      const { error } = await supabase.rpc("revoke_project_foreword", { p_foreword_id: forewordId });
      if (error) throw friendlyError(error, "Couldn't cancel the invite.");
    },
    onSuccess: () => invalidateForeword(queryClient, projectId),
  });
}

/** Creator's decision on a submitted foreword: approve it, decline it, or remove one that's already published. */
export function useReviewForeword(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ forewordId, action }: { forewordId: string; action: "approve" | "reject" | "remove" }) => {
      const { error } = await supabase.rpc("review_project_foreword", { p_foreword_id: forewordId, p_action: action });
      if (error) throw friendlyError(error, "Couldn't update this foreword.");
    },
    onSuccess: () => invalidateForeword(queryClient, projectId),
  });
}

export function useSubmitForeword(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ body, creditLine, disclosure }: { body: string; creditLine?: string; disclosure?: string }) => {
      const { error } = await supabase.rpc("submit_project_foreword", {
        p_project_id: projectId,
        p_body: body,
        p_credit_line: creditLine?.trim() || null,
        p_disclosure: disclosure?.trim() || null,
      });
      if (error) throw friendlyError(error, "Couldn't send your foreword.");
    },
    onSuccess: () => invalidateForeword(queryClient, projectId),
  });
}

/** Declining is final — the creator can't re-invite the same person. */
export function useDeclineForeword(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("decline_project_foreword", { p_project_id: projectId });
      if (error) throw friendlyError(error, "Couldn't decline this invite.");
    },
    onSuccess: () => invalidateForeword(queryClient, projectId),
  });
}

export function useWithdrawForeword(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("withdraw_project_foreword", { p_project_id: projectId });
      if (error) throw friendlyError(error, "Couldn't withdraw your foreword.");
    },
    onSuccess: () => invalidateForeword(queryClient, projectId),
  });
}

/** Client-side mirror of the server's checks, so the form can say what's wrong before the round trip. */
export function validateForewordBody(body: string): string | null {
  const text = body.trim();
  if (text.length < FOREWORD_MIN) return "Write at least a couple of sentences.";
  if (text.length > FOREWORD_MAX) return `Keep it under ${FOREWORD_MAX.toLocaleString()} characters.`;
  if (/(https?:\/\/|www\.|\]\()/i.test(text)) return "Links aren't allowed in a foreword.";
  return null;
}

/** The creator who sent the invite — shown to the invitee ("X asked you to write a foreword"). */
export function useForewordInviter(inviterId: string | undefined) {
  return useQuery({
    queryKey: ["foreword-inviter", inviterId],
    queryFn: async (): Promise<ForewordPerson | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .eq("id", inviterId)
        .maybeSingle();
      if (error) throw error;
      return (data as ForewordPerson | null) ?? null;
    },
    enabled: !!inviterId,
    staleTime: 5 * 60_000,
  });
}
