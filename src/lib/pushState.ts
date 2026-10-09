// src/lib/pushState.ts
// Which conversation is on screen right now. A chat push for the conversation you're already looking at
// is noise (the message just appears), so the foreground handler suppresses it.
let activeConversationId: string | null = null;

export function setActiveConversation(id: string | null): void {
  activeConversationId = id;
}

export function getActiveConversation(): string | null {
  return activeConversationId;
}
