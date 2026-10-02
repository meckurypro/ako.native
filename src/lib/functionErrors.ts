import { FunctionsHttpError } from "@supabase/supabase-js";

/**
 * Given the `error` from `supabase.functions.invoke(...)`, resolves the
 * message that should actually be shown to the user.
 *
 * supabase-js's `functions.invoke` collapses any non-2xx response into a
 * FunctionsHttpError whose own `.message` is just the generic "Edge
 * Function returned a non-2xx status code" — the JSON body the function
 * actually returned (e.g. `{ error: "This content isn't allowed here." }`
 * from create-post/create-comment's moderation rejection) is discarded
 * from `data` and only reachable via `error.context`, the raw Response.
 * Every content-creation edge function (create-post, create-comment,
 * create-reshare, ...) relies on that body reaching the composer UI as
 * the toast/inline message, so this reads it back out — falling back to
 * `fallback` if the body isn't JSON, has no `.error` string, or the
 * error isn't a FunctionsHttpError at all (network failure, relay error).
 */
export async function resolveFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (typeof body?.error === "string") return body.error;
    } catch {
      // Non-JSON or unreadable body — fall through to the fallback below.
    }
  }
  return error instanceof Error ? error.message || fallback : fallback;
}
