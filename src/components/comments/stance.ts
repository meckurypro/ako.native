// src/components/comments/stance.ts
import type { Stance } from "@/types/database";

/**
 * The quiet colour language of a conversation. A reply's stance is always its stance toward the thing it
 * replies to (the post, or the comment you're standing on), so the same comment can be tinted on a post's page
 * and neutral once opened as the parent of its own replies.
 *
 * Deliberately subtle: a 2px rail down the row's edge and a tiny label — never a fill, pill or border box.
 * Tokens (--color-stance-*) live in the palettes so page mode's orange accent never recolours "supports".
 */
export const STANCE_TONE: Record<
  Stance,
  {
    /** Tiny label on a reply row: "Supports" */
    label: string;
    /** Filter chip / count label: "Support" */
    noun: string;
    rail: string;
    text: string;
    underline: string;
  }
> = {
  support: { label: "Adds", noun: "Add", rail: "bg-stance-support-a50", text: "text-stance-support", underline: "border-stance-support" },
  question: { label: "Asks", noun: "Question", rail: "bg-stance-question-a50", text: "text-stance-question", underline: "border-stance-question" },
  pushback: { label: "Pushes back", noun: "Pushback", rail: "bg-stance-pushback-a50", text: "text-stance-pushback", underline: "border-stance-pushback" },
  // The neutral stance: deliberately no colour. Reply rows draw no rail or label for it (see CommentRow).
  comment: { label: "Comments", noun: "Comment", rail: "bg-ink-muted-a50", text: "text-ink-muted", underline: "border-ink-muted" },
};

/** Display order everywhere stances are listed (filter chips, quick-reply words). */
// Every comment is an Add, a Question or a Pushback — the old neutral "comment" is retired (folded into Add).
export const STANCE_ORDER: Stance[] = ["support", "question", "pushback"];

/** "now" / "5m" / "2h" / "3d" / "2w" — compact, for dense reply rows. */
export function timeAgoCompact(dateString: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  if (days < 365) return `${Math.floor(days / 7)}w`;
  return `${Math.floor(days / 365)}y`;
}
