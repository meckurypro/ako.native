// src/types/music.ts
// Types for the Akọ Music Catalogue — a publishing/discovery layer
// over an existing Audio Project (project_type = 'media' with
// project_media_details.has_audio = true), not a second content
// system. See done/AKO_MUSIC_CATALOGUE_AND_CREATOR_DISCOVERY_SYSTEM.md
// and the music_catalogue_v1 Supabase migration.
//
// Hand-maintained to match the SQL schema, same convention as
// src/types/database.ts.

import type { AuthorSummary } from "./database";

export type MusicUsageMode = "free" | "paid";

export type MusicPublicationStatus =
  | "draft"
  | "rights_review"
  | "licence_required"
  | "published"
  | "unpublished"
  | "suspended"
  | "takedown"
  | "reinstated";

export type MusicContributorRole =
  | "artist"
  | "featured_artist"
  | "songwriter"
  | "producer"
  | "beat_maker"
  | "composer"
  | "mixing_engineer"
  | "mastering_engineer"
  | "other_contributor";

export const CONTRIBUTOR_ROLE_LABELS: Record<MusicContributorRole, string> = {
  artist: "Artist",
  featured_artist: "Featured Artist",
  songwriter: "Songwriter",
  producer: "Producer",
  beat_maker: "Beat Maker",
  composer: "Composer",
  mixing_engineer: "Mixing Engineer",
  mastering_engineer: "Mastering Engineer",
  other_contributor: "Other Contributor",
};

export const CONTRIBUTOR_ROLE_OPTIONS: MusicContributorRole[] = [
  "artist",
  "featured_artist",
  "songwriter",
  "producer",
  "beat_maker",
  "composer",
  "mixing_engineer",
  "mastering_engineer",
  "other_contributor",
];

export interface MusicLicenceAgreement {
  id: string;
  version: number;
  title: string;
  body: string;
  is_current: boolean;
  created_at: string;
}

export interface MusicCatalogueEntry {
  id: string;
  project_id: string;
  creator_id: string;
  title: string;
  primary_artist_name: string;
  cover_image_path: string | null;
  clip_file_path: string;
  clip_start_seconds: number;
  clip_duration_seconds: number;
  usage_mode: MusicUsageMode;
  usage_price_usd: number | null;
  rights_declaration_accepted: boolean;
  licence_agreement_id: string | null;
  publication_status: MusicPublicationStatus;
  published_at: string | null;
  unpublished_at: string | null;
  created_at: string;
  updated_at: string;
}

export type MusicCreditStatus = "pending" | "accepted" | "declined";

export interface MusicCatalogueContributor {
  id: string;
  catalogue_id: string;
  contributor_id: string;
  role: MusicContributorRole;
  split_percent: number;
  status: MusicCreditStatus;
  responded_at: string | null;
  created_at: string;
}

// Contributor joined with enough profile info to render a byline —
// mirrors AuthorSummary's role elsewhere in the app.
export interface MusicCatalogueContributorWithProfile extends MusicCatalogueContributor {
  contributor: Pick<AuthorSummary, "id" | "username" | "display_name" | "avatar_url">;
}

// What the composer/feed actually need to render attribution +
// playback — a catalogue entry plus its contributors, plus a signed
// public URL for the clip (the bucket is public, so this is really
// just the bucket URL, but kept as a resolved field so components
// don't each re-derive storage paths).
export interface MusicCatalogueWithContributors extends MusicCatalogueEntry {
  contributors: MusicCatalogueContributorWithProfile[];
  clip_url: string;
  cover_url: string | null;
}

// What MusicCreditResponseModal needs to show someone a pending
// credit request without exposing the full catalogue entry — just
// enough to make an informed accept/decline decision.
export interface PendingMusicCredit {
  catalogue_id: string;
  role: MusicContributorRole;
  title: string;
  primary_artist_name: string;
  cover_url: string | null;
  creator: Pick<AuthorSummary, "id" | "username" | "display_name" | "avatar_url">;
}

// A song the composer's "Add music" search returns — trimmed to the
// minimum useful info per the product spec (§10): small circular
// cover, title, creator, featured artist where applicable.
export interface MusicSearchResult {
  id: string;
  title: string;
  primary_artist_name: string;
  cover_url: string | null;
  clip_url: string;
  clip_duration_seconds: number;
  featured_artist_names: string[];
}

// A locally-selected Audio Project eligible to publish from — one of
// the current user's own 'media' Projects with has_audio = true.
export interface EligibleAudioProject {
  id: string;
  title: string;
  thumbnail_url: string | null;
  audio_url: string | null;
  audio_file_path: string | null;
  audio_source: "link" | "upload" | null;
}

// What PublishMusicSheet collects locally before calling
// usePublishMusic — the wire shape (ContributorInput) is a subset of
// this without the display-only fields.
export interface ContributorDraft {
  contributor_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  role: MusicContributorRole;
  split_percent: number;
}
