# Offline-first & instant UI — how Akọ does it (native + web)

> Same code on both platforms: `src/lib/optimisticCache.ts`, `src/lib/offlineMutations.ts`, and the hooks in
> `src/hooks/useReactions.ts` / `useBookmarks.ts`. Native adds persistence (SQLCipher). Keep the two copies in sync.

## 1. Why a like felt slow

Two separate problems:

1. **The count was never optimistic.** The heart came from the `my-reaction` query (patched optimistically), but the
   number is `post.like_count`, a column on the feed row. It only changed after the insert finished **and** the whole
   `feed-posts` list refetched (`invalidateQueries`). Two network round trips before the number moved.
2. **SQLite was only a read cache.** `lib/queryPersister.ts` snapshots a few query results so lists open instantly.
   Writes never touched it: offline, React Query *paused* the mutation, and an app kill lost it. A paused mutation
   also kept `isPending` true, so the old `if (toggleLike.isPending) return` guard made further taps do nothing.

## 2. The pattern (use it for every "toggle"-style write)

```
tap ─▶ enqueue INTENT ─▶ screen renders  server state + pending-intent overlay   (0 ms, no network)
          │
          └▶ runs when online (retried on transient errors) ─▶ onSuccess patches the cache ─▶ overlay disappears
```

| Rule | Why |
|---|---|
| **Variables are an intent, not a toggle.** `{targetId, active: true, userId, actingAsPageId, queuedAt}` | Idempotent and self-describing: replaying it after a crash, retry or double-tap is harmless, and it can be serialised to disk. |
| **Render `server state + overlay`; never write the optimistic value into the server cache.** | Nothing to roll back. A failed write just stops being "pending" and the UI reverts by itself. Refetches can't clobber the optimistic value. |
| **`scope: { id }` per target.** | Mutations for one target run strictly in order (like → unlike → like), even offline. |
| **`mutationFn` + `onSuccess` live in `setMutationDefaults`** (`registerOfflineMutations`), registered at startup. | Functions can't be persisted. A mutation restored after an app kill must be runnable with **no component mounted**. |
| **Only the default `networkMode: "online"`.** | Offline ⇒ the mutation *pauses* (doesn't fail/rollback) and resumes on reconnect. Don't use `offlineFirst` here: the first attempt would fail and roll back. |
| **Retry transient errors only.** PostgREST errors carry a `code` (RLS, constraint) = final. Network failures don't = retry. | Avoids hammering the server with a request that can never succeed. |
| **Patch counters with a delta, and refetch instead when the data is newer than the tap.** (`adjustCountInCaches`) | A refetch that finished after the tap may already include our write; patching it would double-count. |
| **Don't `invalidateQueries(["feed-posts"])` after a like.** | It refetched the whole feed (slow, flickering) to change one number. Counts drift only until the next natural refresh. |

### Reading it in a component

```ts
const likeQuery = useMyReaction(post.id, "post", "like", active);              // server truth
const like = useReactionOverlay(post.id, "post", "like", !!likeQuery.data);    // what to RENDER
const toggleLike = useToggleReaction(post.id, "post", "like");
//   like.active, post.like_count + like.countDelta     toggleLike.mutate(like.active)
```

## 3. Native: persistence (SQLite)

* `lib/queryPersister.ts` → `shouldPersistMutation`: **only paused mutations whose key is in `OFFLINE_MUTATION_ROOTS`**
  are written into the encrypted `kv_cache`, inside the per-user snapshot.
* `hooks/usePersistedQueries.ts`: after restore it calls `queryClient.resumePausedMutations()` (still waits for
  connectivity via the NetInfo → `onlineManager` bridge), and it **flushes to disk the instant a mutation is queued
  offline** instead of waiting for the 2 s throttle.
* `my-reaction` and `is-bookmarked` are in `PERSISTED_QUERY_ROOTS`, so hearts/saves are right on a cold offline start.
  `my-comment-reactions` is deliberately **not** (it holds a `Map`, which JSON can't round-trip).
* Sign-out / account switch already wipes the cache and `dispose()`s the persister, so queued writes never leak to
  another account. (And RLS would reject a replay under the wrong user anyway.)

## 4. Web

Web gets the same instant UI, the same ordered/idempotent mutations and the same retry-on-reconnect **for as long as
the tab stays open**. It does **not** persist the queue (a closed tab loses it). If offline web matters, add:

1. `@tanstack/query-async-storage-persister` + `idb-keyval` (IndexedDB) with `persistQueryClient`, `shouldDehydrateMutation`
   from `shouldPersistMutation`, and `resumePausedMutations()` in `onSuccess` of the restore.
2. **A per-user storage key and a wipe on sign-out.** This is the part that's easy to get wrong on a shared browser:
   a global key would show (and replay!) one account's queue under another.
3. A `PersistQueryClientProvider` buster tied to the app version.

## 5. Converting another write — checklist

1. Can it be expressed as an **idempotent intent**? (toggle/set-state: yes. "append a row": only with a client-generated id.)
2. Add `XIntent`, `sendX`, `onXConfirmed` to `offlineMutations.ts`; register in `registerOfflineMutations`; add the key
   root to `OFFLINE_MUTATION_ROOTS`.
3. Hook: `useMutation({ mutationKey, scope })` + a `mutate` that builds the intent from **what the user sees**.
4. Read side: `useMutationState({ filters: { mutationKey, status: "pending" }, select: m => m.state.variables })` → overlay.
5. `onXConfirmed`: write the confirmed state into the server cache and `adjustCountInCaches` for any counter.
6. Add a case to `scripts/test-optimistic.mjs` (`node scripts/test-optimistic.mjs`).

**Good next candidates (same shape):** follow/unfollow, project save/unsave, project like (already supported by the
reaction mutation; no native UI calls it yet), mark-notification-read, mute/block toggles, poll votes.

**Do not make these offline-first without more design:**
* *Create post / send message / comment:* need a client-generated UUID as an idempotency key and optimistic *temp rows*
  in the list (the existing messaging code already does this per thread, which is why threads aren't persisted).
* *Anything involving money* (gifts, purchases, wallet, withdrawals): the server must decide; show "pending", never "done".
* *Moderated actions* (posting text): the server can reject after the fact; the UI needs an explicit "failed" state.

## 6. Is "SQLite as the source of truth" the right goal?

A full local-first architecture (SQLite as the primary store, a sync engine such as PowerSync / ElectricSQL, the UI reading
only from SQLite) gives the same instant feel **plus** offline reads of everything, but it means a second schema, conflict
rules for every table, and replacing the React Query data layer. For taps like like/save/follow, the intent-queue above
gives the identical UX at a fraction of the cost and risk. Revisit a sync engine only if offline *reading and composing*
(feed, threads, drafts) becomes a core promise.

## 7. Known limits / not yet verified on a device

* Everything here is verified in Node against the real `@tanstack/query-core` (`scripts/test-optimistic.mjs`: patch math,
  in-order replay, offline queue → persist → "kill" → restore → replay). **Not yet run on a phone.**
* Server-side `like_count` maintenance (trigger) was not readable from the sandbox. The client assumes the server keeps
  the counter in step with `reactions` rows; any refetch overwrites a local patch with server truth, so a wrong
  assumption can only cause a brief drift, never a wrong stored value.
* A like queued offline on a post that was deleted meanwhile fails with a DB error and silently reverts.
* The persisted queue is replayed with the **user id captured at tap time**; if that session no longer exists the
  replay is rejected by RLS and dropped.
* `share` reactions are queued like the others but their count isn't patched locally (its counter semantics are unclear).
