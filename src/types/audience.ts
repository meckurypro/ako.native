// src/types/audience.ts
// Audience shapes shared by ad creatives and verification. On web these lived
// in the admin comms hook; the admin tooling stays on web, so just the types
// the member-facing code needs are kept here.
export type AudienceType = "all" | "tier" | "page_followers" | "manual";

export interface AudienceInput {
  audience_type: AudienceType;
  audience_filter: Record<string, unknown>;
  manual_recipient_ids: string[];
}

export interface AudienceSample {
  id: string;
  username: string;
  display_name: string;
}
