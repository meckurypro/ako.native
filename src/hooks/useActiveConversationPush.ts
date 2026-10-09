// src/hooks/useActiveConversationPush.ts
// Call from a thread screen. While it's mounted: pushes for THIS conversation are silenced in the foreground
// handler, and any of its notifications already sitting in the tray are cleared (you're reading them now).
import { useEffect } from "react";

import { dismissPresentedWhere } from "../lib/push";
import { setActiveConversation } from "../lib/pushState";

export function useActiveConversationPush(conversationId: string | undefined) {
  useEffect(() => {
    if (!conversationId) return;
    setActiveConversation(conversationId);
    void dismissPresentedWhere((data) => data.type === "message" && data.conversationId === conversationId);
    return () => setActiveConversation(null);
  }, [conversationId]);
}
