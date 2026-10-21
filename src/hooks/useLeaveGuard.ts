// src/hooks/useLeaveGuard.ts
//
// "You have unsaved progress" guard for create screens (Compose, CreateProject). Native twin of the web hook.
//
// While `when` is true, anything that would REMOVE this screen — the header's back arrow, Android's Back button or
// gesture, the iOS swipe-back — is held (same `beforeRemove` mechanism BookBuilder uses) and `isBlocked` turns true
// so the screen can show <SaveProgressDialog>. The screen then settles it with one of:
//   proceed()  — let the held navigation happen (after saving a draft, or when the person chose Discard)
//   stay()     — drop the held navigation; the person keeps editing
//
// A screen that is about to navigate on its own after a SUCCESSFUL save/publish calls allowLeaving() first, so its
// own router.replace(...) is never mistaken for walking away from unsaved work.
import { useNavigation } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

export function useLeaveGuard(when: boolean) {
  const navigation = useNavigation();
  const whenRef = useRef(when);
  whenRef.current = when;
  const allowRef = useRef(false);
  const [pendingAction, setPendingAction] = useState<unknown>(null);

  useEffect(() => {
    return navigation.addListener("beforeRemove", (e: { preventDefault: () => void; data: { action: unknown } }) => {
      if (allowRef.current || !whenRef.current) return;
      e.preventDefault();
      setPendingAction(e.data.action);
    });
  }, [navigation]);

  const proceed = useCallback(() => {
    if (pendingAction === null) return;
    allowRef.current = true; // the re-dispatched action must not be held again
    const action = pendingAction;
    setPendingAction(null);
    navigation.dispatch(action as Parameters<typeof navigation.dispatch>[0]);
  }, [navigation, pendingAction]);

  const stay = useCallback(() => setPendingAction(null), []);

  const allowLeaving = useCallback(() => {
    allowRef.current = true;
  }, []);

  return { isBlocked: pendingAction !== null, proceed, stay, allowLeaving };
}
