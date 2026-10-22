// src/lib/liveCounts.ts
// Live counters. Every count on a post or comment (likes, dislikes, comments, replies, shares, gifts, per-stance
// totals) follows the database in real time, so other people's reactions land on screen without a refresh.
// Your OWN taps never wait for this — they already render instantly from the pending-intent overlay
// (offlineMutations.ts), and comment counts are patched the moment a reply is accepted (useCreateComment).
//
// Transport: Realtime BROADCAST from database triggers (supabase/live_counts_broadcast.sql), the same approach as
// post edits (usePostRealtime.ts) — NOT postgres_changes on `posts`, so nobody is woken for rows they aren't
// looking at. Each topic is private and per-entity, so a client only hears about what is on its screen:
//   post-counts:<postId>  → "counts"          { id, like_count, … }             (one channel per post on screen)
//   thread:<postId>       → "comment_counts"  { id, parent_comment_id, … }      (one channel per open conversation)
//                         → "comment_added"   { id, parent_comment_id }
//
// Double-count guard: while YOUR OWN reaction on an entity is still in flight, an incoming absolute count already
// includes it and the overlay would add it a second time. Those events are held back (latest wins) and applied once
// the mutation settles; if it is still unsettled after a few tries (offline), the held event is dropped.
import type { QueryClient } from "@tanstack/react-query";
import { notifyManager } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { COMMENT_REACTION_MUTATION_KEY, REACTION_MUTATION_KEY } from "./offlineMutations";
import { COMMENT_QUERY_ROOTS, patchFields, POST_QUERY_ROOTS } from "./optimisticCache";
import { supabase } from "./supabase";

const POST_FIELDS = ["like_count", "dislike_count", "share_count", "support_count", "disagree_count", "pushback_count", "question_count", "neutral_count", "gift_count", "comment_count"];
const COMMENT_FIELDS = ["like_count", "dislike_count", "reply_count", "support_count", "disagree_count", "pushback_count", "question_count", "neutral_count"];

const MAX_POST_CHANNELS = 40; // Supabase caps channels per connection; a screen never needs more than this
const SUBSCRIBE_DELAY_MS = 300; // cards scrolled past in a flick never subscribe
const LINGER_MS = 4000; // …and a card that just left keeps its channel briefly (scroll back up = no resubscribe)
const HOLD_MS = 900;
const MAX_HOLDS = 6;
const LIST_REFRESH_MS = 300;

type Row = Record<string, unknown>;

function pick(row: Row, fields: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of fields) if (typeof row[f] === "number") out[f] = row[f] as number;
  return out;
}

/**
 * Writes server-confirmed absolute counts into every cached copy of one entity. Unlike an optimistic patch this
 * deliberately bumps the query's freshness timestamp: it IS new server data, and adjustCountInCaches uses that
 * timestamp to notice "the cache already moved since I tapped" and refetch instead of adding a delta on top.
 */
function setCounts(qc: QueryClient, roots: ReadonlySet<string>, id: string, values: Record<string, number>) {
  if (Object.keys(values).length === 0) return;
  notifyManager.batch(() => {
    for (const query of qc.getQueryCache().findAll()) {
      if (!roots.has(String(query.queryKey[0]))) continue;
      const data = query.state.data;
      if (data === undefined) continue;
      const next = patchFields(data, id, values);
      if (next !== data) qc.setQueryData(query.queryKey, next);
    }
  });
}

function ownReactionInFlight(qc: QueryClient, kind: "post" | "comment", id: string): boolean {
  return qc
    .getMutationCache()
    .findAll({ mutationKey: kind === "post" ? REACTION_MUTATION_KEY : COMMENT_REACTION_MUTATION_KEY, status: "pending" })
    .some((m) => {
      const v = m.state.variables as { targetId?: string; commentId?: string } | undefined;
      return kind === "post" ? v?.targetId === id : v?.commentId === id;
    });
}

/** Latest not-yet-applied payload per entity — a newer event replaces an older held one. */
const held = new Map<string, Row>();

function applyCounts(qc: QueryClient, kind: "post" | "comment", row: Row, attempt = 0) {
  const id = row.id as string;
  const key = `${kind}:${id}`;
  if (held.get(key) !== row) return; // superseded by a newer event
  if (ownReactionInFlight(qc, kind, id)) {
    if (attempt < MAX_HOLDS) setTimeout(() => applyCounts(qc, kind, row, attempt + 1), HOLD_MS);
    else held.delete(key);
    return;
  }
  held.delete(key);
  setCounts(qc, kind === "post" ? POST_QUERY_ROOTS : COMMENT_QUERY_ROOTS, id, pick(row, kind === "post" ? POST_FIELDS : COMMENT_FIELDS));
}

function onCounts(qc: QueryClient, kind: "post" | "comment", payload: unknown) {
  const row = payload as Row | null;
  if (!row || typeof row.id !== "string") return;
  held.set(`${kind}:${row.id}`, row);
  applyCounts(qc, kind, row);
}

// ─── posts on screen ─────────────────────────────────────────────────────────

interface Entry {
  refs: number;
  channel: RealtimeChannel | null;
  timer: ReturnType<typeof setTimeout> | null;
}
const postEntries = new Map<string, Entry>();
let activePostChannels = 0;

function openPostChannel(qc: QueryClient, postId: string, entry: Entry) {
  entry.timer = null;
  if (entry.refs <= 0 || entry.channel) return;
  if (activePostChannels >= MAX_POST_CHANNELS) return;
  activePostChannels += 1;
  entry.channel = supabase
    .channel(`post-counts:${postId}`, { config: { private: true } })
    .on("broadcast", { event: "counts" }, ({ payload }) => onCounts(qc, "post", payload))
    .subscribe();
}

function closePostChannel(postId: string, entry: Entry) {
  entry.timer = null;
  if (entry.refs > 0) return;
  if (entry.channel) {
    void supabase.removeChannel(entry.channel);
    activePostChannels -= 1;
  }
  postEntries.delete(postId);
}

/** Keeps one post's counters live while it is on screen. Ref-counted: any number of cards/screens can watch one post. */
export function watchPost(qc: QueryClient, postId: string): () => void {
  let entry = postEntries.get(postId);
  if (!entry) {
    entry = { refs: 0, channel: null, timer: null };
    postEntries.set(postId, entry);
  }
  entry.refs += 1;
  if (entry.timer) clearTimeout(entry.timer);
  if (!entry.channel) {
    const e = entry;
    e.timer = setTimeout(() => openPostChannel(qc, postId, e), SUBSCRIBE_DELAY_MS);
  } else {
    entry.timer = null;
  }

  return () => {
    const e = postEntries.get(postId);
    if (!e) return;
    e.refs -= 1;
    if (e.refs > 0) return;
    if (e.timer) clearTimeout(e.timer);
    e.timer = setTimeout(() => closePostChannel(postId, e), LINGER_MS);
  };
}

// ─── an open conversation ────────────────────────────────────────────────────

const threads = new Map<string, { refs: number; channel: RealtimeChannel; timer: ReturnType<typeof setTimeout> | null }>();

/** Keeps an open conversation live: comment counters, new replies, removed replies. */
export function watchThread(qc: QueryClient, postId: string): () => void {
  let entry = threads.get(postId);
  if (!entry) {
    const refreshLists = () => {
      const t = threads.get(postId);
      if (!t || t.timer) return;
      t.timer = setTimeout(() => {
        t.timer = null;
        void qc.invalidateQueries({ queryKey: ["comment-list", postId] });
      }, LIST_REFRESH_MS);
    };

    const channel = supabase
      .channel(`thread:${postId}`, { config: { private: true } })
      .on("broadcast", { event: "comment_added" }, refreshLists)
      .on("broadcast", { event: "comment_counts" }, ({ payload }) => {
        onCounts(qc, "comment", payload);
        if ((payload as Row | null)?.is_deleted === true) refreshLists(); // a removed reply leaves the lists
      })
      .subscribe();

    entry = { refs: 0, channel, timer: null };
    threads.set(postId, entry);
  }
  entry.refs += 1;

  return () => {
    const t = threads.get(postId);
    if (!t) return;
    t.refs -= 1;
    if (t.refs > 0) return;
    if (t.timer) clearTimeout(t.timer);
    void supabase.removeChannel(t.channel);
    threads.delete(postId);
  };
}
