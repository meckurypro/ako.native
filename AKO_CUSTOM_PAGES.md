# Akọ Custom Pages

A Custom Page is a small website anyone on Akọ can publish at `myako.site/<slug>` with no domain, code or designer. It is a published document: a JSON config rendered through a style and a template.

A Custom Page is **not** a "Page" (`/page/:username`, an account-like identity). They share no code, names or routes. In the UI it is always called "Custom page".

## How it works

- A page has a **draft** and a **published snapshot**. The editor autosaves the draft. Visitors only ever see the snapshot, and only after Publish.
- The page is its own website. The app sidebar and bottom nav never show on it.
- A fixed footer reads "Powered by Akọ · Create your own custom page". It is not part of the config, so owners cannot remove it. It links to `/me/custom-pages?ref=<slug>` and records a `create_click` event.
- Visitors can be signed out. Inquiries and analytics work for anonymous visitors.
- Slugs share one namespace with Projects (`/:slug`). The database refuses a collision in either direction, and an old slug keeps redirecting after a change.
- Motion respects the system reduce-motion setting on web and native.

## Config (jsonb, v1)

| Key | Contents |
| --- | --- |
| `identity` | `name`, `tagline`, `intro`, `copyright`, `icon_path` |
| `brand` | `primary`, `secondary`, `accent` (hex), `hero[{path}]` up to 8 |
| `contact` | `email`, `phone`, `address` |
| `gallery` | `[{path, caption}]` up to 24 |
| `ctas` | up to 6 of `{id, label, action, url?, file_path?, file_name?}` |
| `document` | `{path, title, file_name}` |
| `engagement` | `{inquiry: boolean}` (default true) |
| `design` | `{style, template, animation}` as short slugs |
| `share` | `{enabled, look, position}` for the optional share button |
| `seo` | `{share_image_path}` |

Button actions: `url`, `ako` (internal link), `message` (opens an Akọ chat with the owner), `inquiry`, `download`, `email`, `call`.

Files are never stored inside the JSON, only paths. Every path must start with `<owner_id>/` and live in the public `custom-pages` bucket (100 MB limit; images, PDF, Office files, CSV, text).

## Design is three separate choices

- **Styles:** minimalist, glass, elegant, midnight, aurora, bold, soft, neo, clay, chrome, mono, organic.
- **Templates:** showcase, stacked, brochure, spotlight, linkcard, split, portfolio, bento, poster.
- **Animations:** none, fade, slide-up, zoom, stagger, blur, pop, slide-left, tilt, bounce.

The database accepts any short slug (`^[a-z][a-z0-9-]{0,23}$`) for these, so adding one never needs a migration. To add a style or template, extend the registries in `src/lib/customPage.ts` and the renderer, then mirror the change in `Ako.native`.

## Design presets

On the Design tab a creator can save their current look as a named preset and bring it back from a dropdown after experimenting. A preset holds only the tab's choices: `style`, `template`, `animation` and the `share` button settings. Colours, content and uploaded images (including the link preview image) are never part of one.

- Presets belong to the person, not to a page, so every page of theirs can use them, on web and native.
- Up to 20 presets, names up to 40 characters. Saving with an existing name replaces that preset (that is how one is updated).
- Applying a preset replaces the page's design choices straight away and the draft autosaves as usual.
- The row stores the design as JSON. Reading goes through `resolvePresetDesign()` so a preset that names a style or template that no longer exists falls back to the default instead of breaking.
- Table `custom_page_presets` (RLS on, owners read their own rows). Writes: `save_custom_page_preset`, `delete_custom_page_preset`. Read: `list_my_custom_page_presets`. The validator `custom_page_preset_problem()` is internal.

## Backend

All writes go through SECURITY DEFINER functions that validate with `custom_page_config_problem()`:
`create_custom_page`, `save_custom_page_draft`, `publish_custom_page`, `unpublish_custom_page`, `set_custom_page_slug`, `set_custom_page_visibility`, `check_custom_page_slug_available`, `delete_custom_page`, `list_my_custom_pages`, `get_custom_page_stats`, `list_my_custom_page_presets`, `save_custom_page_preset`, `delete_custom_page_preset`.

Callable by signed-out visitors: `get_public_custom_page`, `submit_custom_page_inquiry` (honeypot and rate limits), `record_custom_page_event` (`view`, `cta_click`, `download`, `create_click`).

Creation is gated by `fn_can_access_feature('custom_pages', uid)`. A user can have up to 10 pages. The tables have RLS on; owners read their own rows and write only through the functions above. The source of truth is `supabase/ako_custom_pages.sql`.

## Where the code is

Web: `src/lib/customPage.ts`, `src/hooks/useCustomPages.ts`, `src/components/customPage/`, and the pages `SlugRoute`, `CustomPageView`, `CustomPages`, `CustomPageEditor`, `CustomPageManage`. `api/share.ts` gives crawlers a rich preview.

Native (`Ako.native`): the same names under `src/lib`, `src/hooks`, `src/components/customPage` and `src/screens`. Routes live under `src/app/(app)/me/custom-pages`. `src/lib/customPageSlugs.ts` remembers which slugs are Custom Pages so the bottom nav stays off them.

Keep web and native in step. Web is the source of truth.

## Tests

`supabase/tests/custom_page_config_problem.test.sql` checks the validator with 34 cases (limits, ownership of file paths, link safety, draft versus publish rules). It is pure and read-only, so it is safe on any environment. Paste it into the SQL editor; it raises on the first failure.

## Known gaps

- No automated tests for the client renderer or hooks.
- No report or takedown tool for admins.
- Files removed from a draft stay in storage, because the published snapshot may still use them. There is no cleanup job yet.
- A page owner cannot yet pin a page to their profile.
- The `custom-pages` bucket has a public read policy on `storage.objects`. A public bucket serves files by URL without it, so it only adds the ability to list every owner's files. Consider dropping it once public file URLs have been checked in staging.
