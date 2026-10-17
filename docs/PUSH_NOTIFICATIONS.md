# Chat push: preview, buttons and tap routing

**Server** (`supabase/functions/send-message-push`, deployed to the Supabase project, copy kept here):
the push body is the start of the message (`preview.ts`: text clipped to 240 chars, photos / documents / voice notes
summarised in words). Every chat push carries `categoryId: "message"` and `data: { type, conversationId, messageId }`.
If messages ever become end-to-end encrypted the server can't read them: put the fixed "Sent you a message" body back.

**Buttons** (`src/lib/pushActions.ts`): the `message` category has **Reply** (inline text) and **Mark as read**, both
with `opensAppToForeground: false`. App open: handled by the response listener in `usePushNavigation`. App backgrounded
or killed: Android runs the `ako-push-actions` background task (needs `expo-task-manager`, a native dependency, so a
**new build** is required, an OTA update is not enough). Replies are inserted with an id derived from the notification,
so the two paths can never double-send.

**Tap routing** (`usePushNavigation`): chat push -> `/inbox` (Page inbox when acting as a Page); activity push -> the
row's most relevant screen, falling back per type (`fallbackRouteForType`) when the row can't be read; anything without
a payload -> `/notifications`. `lib/pushLaunch.ts` records "opened by a notification" at startup so `useRouteMemory`
never restores the last screen on top of it (it used to, because the tap handler cleared the live value first).

Tests: `node scripts/test-push-logic.mjs`.
