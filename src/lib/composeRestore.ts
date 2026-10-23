// src/lib/composeRestore.ts
//
// One-shot, in-memory hand-off for "the post didn't go through - put the person back on the editor with
// everything they typed". Compose redirects to the Feed the moment "Post" is tapped and finishes publishing in
// the background; if the server then rejects the post (moderation, no connection), Compose is reopened with the
// form as it was. Read with peekComposeRestore() on mount, then cleared with clearComposeRestore().

export interface ComposeRestore {
  heading: string;
  headingColor: string | null;
  content: string;
  mediaUrls: string[];
  topicIds: string[];
  taggedProject: { id: string; title: string } | null;
  musicCatalogueId: string | null;
  /** The draft / scheduled post being resumed, so it is still replaced when the post finally goes out. */
  resumedPostId: string | null;
  /** Why it didn't go through, shown inline on the editor. */
  error: string | null;
}

let pending: ComposeRestore | null = null;

export function setComposeRestore(value: ComposeRestore | null) {
  pending = value;
}

export function peekComposeRestore(): ComposeRestore | null {
  return pending;
}

export function clearComposeRestore() {
  pending = null;
}
