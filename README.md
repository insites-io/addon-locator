# Insites Add-On — Locator v1.1.0

This add-on is layered on top of an [app-portal](../app-portal/) deployment. It ships:

- **`/find-a-partner`** — public directory of partner locations with map + search + filters
- **`/find-a-partner/{slug}`** — public partner profile page (rendered by the same page via `max_deep_level: 2`)
- **`/my-locator-listing`** — portal page where logged-in users manage their public listing across Profile / Location / Social tabs
- Three JSON API endpoints (`find-a-partner`, `update-visibility`, `upload-presign`)
- Two migrations (`location_custom_field.user_uuid` + `constant_set` for `locator_addon` flag and `google_map_id`)

The add-on is gated behind the `locator_addon` constant — app-portal layouts read `context.constants.locator_addon == 'true'` to show/hide the nav link, footer link, and portal sidebar entry.

---

## Setup — Migrations

| Migration | Purpose |
|---|---|
| `20260507000007_location_custom_field.liquid` | `admin_table_update` to add `user_uuid` (belongs_to users) to the `modules/ins_locator/location_custom_field` table — this is what makes the user ↔ location join work |
| `20260513070054_constants.liquid` | Sets `locator_addon = true` (feature flag the app-portal layouts read) and `google_map_id = d55c604835e6ff00d4f4a0c0` (Map ID used by the `googlemaps` partial) |

---

## Find a Partner Page

`/find-a-partner` is a public directory that lets visitors search for nearby Insites partners using a location search, distance filter, category filter, and an interactive Google Map. The page uses `max_deep_level: 2` so it also serves the Partner Profile page at `/find-a-partner/{slug}` (see [Partner Profile Page](#partner-profile-page) below).

### How it works

#### Initial page load

The page's `results.liquid` partial picks one of three SSR queries based on the URL params, mirroring the AJAX endpoint at `api/locator/find-a-partner.liquid` exactly. The chosen mode is exposed to JS via `data-ssr-mode` on `#locator-list`, so `view-source` matches the live DOM and shared links skip an unnecessary fetch.

**`directory` mode** — no URL params, the default landing page.

1. The server renders up to **30 location cards** from `get_locations.graphql`.
2. All 30 cards are written into the HTML DOM so the map can pin all of them immediately.
3. The list panel shows **10 cards at a time** — the rest are hidden via the `.is-page-hidden` CSS class. Pagination buttons appear below the list when there are more than 10 results.
4. Clicking a pagination button shows the next/previous 10 cards in the list and smoothly scrolls the browser to the top of the list. Map pins are unaffected — all 30 remain visible.

**`text` mode** — URL has `?search=…` only (legacy/manual link, no `lat`/`lng`).

1. The server runs `get_locations.graphql` with a text-contains filter on `city` / `postcode` / `address_1`. The SSR set is approximate, not the geocoded radius set.
2. `locator.js` detects the search param, kicks the Google Maps lazy-loader, waits for `google.maps`, then runs `doSearch()` which geocodes the term and AJAX-refetches `/api/locator/find-a-partner` for the precise radius set. The list panel is replaced with the response.
3. Same flow as a fresh button-click search from this point on.

**`geo` mode** — URL has `?search=…&distance=…&lat=…&lng=…` (a shared link from a previous search).

1. The server runs `get_locations_nearby.graphql` with `point` + `distance` + `page` from the URL — the *same* query the AJAX endpoint uses.
2. Pagination buttons are pre-rendered server-side from `total_pages` / `current_page`.
3. `locator.js` sees `data-ssr-mode="geo"` and **short-circuits**: it hydrates `currentLocation` / `currentDistance` / `lastParams` from the URL, seeds the hidden `lat`/`lng` inputs, calls `updateLocatorMap(center, distance)` to fit the map to the radius, and **does not fire an AJAX call or wait for `google.maps`** — there's nothing for them to do. View-source = live DOM, no flash, no duplicate fetch.

#### Location search

1. The user types a suburb, city, or postcode into the **location input** (`#locator-location`).
2. Google Places Autocomplete is attached to the input (via `google.maps.places.Autocomplete`). As the user types, a suggestion dropdown appears.
3. The **distance select** (`#locator-distance`) is disabled until the location field has a value. Hovering over it while disabled shows the message "Enter a location first".
4. Clicking **Find a partner** (or pressing Enter) triggers `doSearch()` in `locator.js`, which resolves the location to a `lat`/`lng` via one of two paths:

   **Primary path — autocomplete selection:**
   - When the user picks a suggestion from the dropdown, the `place_changed` event fires and the exact `lat`/`lng` is captured directly from the Places API result. No geocoder call is made.

   **Fallback path — manual text entry:**
   - If the user types without selecting a suggestion, the Google Maps Geocoder resolves the text to a `lat`/`lng`.
   - If the input is a postcode (digits only) and `window.locatorCountry` is set, the country name is appended before geocoding (e.g. `"5000, Australia"`) to improve accuracy.

5. `fetchResults()` calls the AJAX endpoint `GET /api/locator/find-a-partner` with `lat`, `lng`, `distance`, and `location` as query parameters.
6. The API endpoint (`find-a-partner.liquid`) runs `get_locations_nearby.graphql`, which filters results using a `distance_sphere` geo query and returns paginated HTML + metadata as JSON.
7. The list panel is replaced with the returned HTML. Pagination is rendered from the API response (`total_pages`, `current_page`).
8. A **red pin** (`--error-hover` colour) is placed on the map at the searched lat/lng to mark the user's search location. All partner result pins are placed in the standard brand colour.
9. The status bar (`#locator-status`) updates to show e.g. `"8 partners within 15km of Sydney, NSW."` or `"3 partners within 15km of postcode 5000."`.
10. The URL is updated via `history.pushState` with `search`, `distance`, `lat`, and `lng` so the search is shareable and supports the browser back button. Including `lat`/`lng` makes the link a complete, deterministic recipe — visiting it later seeds the hidden lat/lng inputs from the URL, skips both the Places autocomplete and the Geocoder fallback, and fires the same `/api/locator/find-a-partner` call. Example: `/find-a-partner?search=Sydney&distance=10&lat=-33.8688&lng=151.2093`.

#### Category filter

1. The **Filters** button opens a right-side drawer (`#locator-filters-drawer`) containing partner tier checkboxes, dynamically built from the categories present in the current result set.
2. Checking a category hides all cards that do not match that category. Multiple selections are cumulative (OR logic within the same group).
3. The **Partner tier** label updates to show the count of active selections, e.g. `"Partner tier (2)"`.
4. If all cards are hidden by the filter, the status bar shows `"No partners match your filters. Clear filters"` with a button to reset.
5. Map pins update to reflect visible cards only (category-filtered cards are excluded from pins; pagination-hidden cards are still pinned).

#### View toggle

The list panel supports two views toggled by the **List / Grid** buttons:
- **List view** — single-column cards with full description
- **Grid view** — two-column cards with truncated description (2 lines)

#### Mobile layout (≤ 830px)

The list and map are stacked rather than split:

- On initial paint the **list of results is shown first**; the map panel is hidden.
- A fixed **"See on map"** bar at the bottom of the viewport (`#locator-see-map-bar`) toggles the map open by adding `locator-mobile-map-open` to `<body>`, which switches the map panel to a fullscreen overlay.
- While the overlay is open, the same bar swaps to **"Close map"** (`#locator-close-map-bar`), which removes the class and returns the user to the list.

Google Maps is lazy-loaded on first user interaction (scroll / touchstart / click / keydown / mousemove) or `requestIdleCallback`, on both mobile and desktop — see [results.liquid](modules/locator/public/views/partials/website/find_a_partner/results.liquid).

#### Clearing search and filters

Three separate controls:

- **X icon in the location input** — appears when the input has a value. Clears location + distance + lat/lng and refetches all results via AJAX. **Category selections are preserved** (they'll re-apply against the new result set).
- **"Clear filters" link in the status bar** — only shown when the category filter has hidden every card (`"No partners match your filters. Clear filters"`). Wired to the same handler as the X icon — clears location + distance and refetches; category selections are preserved.
- **"× Clear" link in the filters drawer** — sits next to the "Partner tier" label, only visible when at least one category is checked. Unchecks every box and reruns the category filter. **Does not touch location or distance.**

### Configuration — default country for geocoding (fallback path only)

This only applies when a user types a postcode without selecting from the Places Autocomplete dropdown. When the geocoder fallback runs and the input is a postcode (digits only), the country name is appended to the query (e.g. `"5000"` becomes `"5000, Australia"`) to avoid ambiguous results.

The country is read from the CMS — **IIA → CMS → Globals → Locations → Location 1 → Country** (`loc_1_country`). If the field is empty or not set, it defaults to `Australia`.

When the user selects from the autocomplete dropdown, the lat/lng comes directly from the Places API and this country value is not used.

### Key files

| File | Purpose |
|---|---|
| `views/pages/website/find-a-partner.liquid` | Page entry point — branches on `context.params.slug2` (profile vs directory) |
| `views/partials/website/find_a_partner/list.liquid` | Directory layout — search bar, list panel, map panel |
| `views/partials/website/find_a_partner/filters.liquid` | Search bar and controls bar |
| `views/partials/website/find_a_partner/filters_drawer.liquid` | Filters side drawer |
| `views/partials/website/find_a_partner/results.liquid` | Card list, map panel, Google Maps script |
| `views/partials/website/find_a_partner/card.liquid` | Single result card (rendered by both SSR and AJAX) |
| `views/pages/api/find-a-partner.liquid` | AJAX JSON endpoint |
| `graphql/locations/get_locations.graphql` | Initial SSR query (up to 30 results) |
| `graphql/locations/get_locations_nearby.graphql` | Geo-distance search query |
| `assets/scripts/locator.js` | All client-side directory logic |
| `assets/styles/locator.css` | All locator styles (both website and portal) |

---

## Partner Profile Page

`/find-a-partner/{location-slug}` is the public per-partner profile. It is **not a separate page file** — the directory page (`find-a-partner.liquid`) declares `max_deep_level: 2` and dispatches to the profile partial when `context.params.slug2` is set.

### How it works

1. `views/partials/website/find_a_partner/details.liquid` runs `get_location_detail.graphql` with `slug: context.params.slug2`.
2. If no match, redirects to a 404.
3. Otherwise renders:
   - Banner image (`image_1`, marked `fetchpriority="high"` as the LCP element; falls back to a no-banner layout when absent)
   - Logo, location name, category `<ins-tag>`, tagline, and "Open website" button
   - Sanitised `long_description` HTML — strips Grammarly extension wrappers and adds `loading="lazy"` to inline `<img>` tags
   - A contact-card sidebar with address, phone, email, website, and social links (Facebook, X, Instagram, LinkedIn, YouTube)

### Slug generation

Slugs are auto-generated by the Profile form's async callback when the listing is saved — see [My Locator Listing → Profile tab](#profile-tab) below. URL pattern: **`/find-a-partner/{kebab-cased-location-name}`**, deduped with `-2`/`-3` suffixes (up to `-100`).

### Key files

| File | Purpose |
|---|---|
| `views/partials/website/find_a_partner/details.liquid` | Profile partial — renders banner, contact card, and sanitised long description |
| `graphql/locations/get_location_detail.graphql` | Lookup by `slug`; returns all public profile fields + `related_record` category |

---

## My Locator Listing (Portal)

`/my-locator-listing` lets a logged-in portal user manage their public partner profile across three tabs (Profile / Location / Social links) and toggle public visibility.

### Data model — user ↔ location join

The `modules/insites_locator/location` table has **no direct user field**. The link is stored in a separate join table:

**`modules/ins_locator/location_custom_field`**

| Property | Description |
|---|---|
| `user_uuid` | The portal user's `external_id` (CRM UUID) — added by migration `20260507000007` |
| `location_uuid` | The location record's `uuid` property |

`get_my_location.graphql` queries this join by `user_uuid`, then uses `related_record` on `location_uuid ↔ uuid` to pull the full location record.

### Page lifecycle

`views/pages/portal/my-locator-listing.liquid` runs these steps server-side on every request:

1. **Fetch.** `get_my_location` for `user.external_id`.
2. **Orphan cleanup.** If the join row exists but its joined location is gone (admin deleted the location from the front-end admin UI without removing the join row), call `delete_my_location_custom_fields` to wipe all of the user's join rows, then fall through to step 3.
3. **First-visit bootstrap.** If the user has no join row, create both rows up-front:
   - `create_my_location` — new location record with a fresh `uuid`, `status: disabled` (so the listing stays hidden until the user toggles visibility on), and `location_name: user.email`
   - `create_location_custom_field` — join row linking `user_uuid ↔ location_uuid`

   Then re-fetch so the rest of the page renders the forms in UPDATE mode just like the returning-user path. Without this bootstrap the listing forms would submit in CREATE mode but the join row would never be created — the next page load would still return nil and the save would appear to have vanished.
4. **Categories.** `get_categories` for the Partner Type dropdown.
5. **Render.** Page header (with visibility toggle + hidden-listing info banner), then `<ins-tab>` with three `<ins-tab-item>`s.
6. **Active-tab restore.** After a form submit, the active tab is restored from the flash message (`Listing-Profile` / `Listing-Location` / `Listing-Social`) so the page reopens on the tab the user just saved. Six notyf scripts emit success/error toasts for the six flash states.

### Visibility toggle

The `<ins-toggle-switch id="locator-visibility">` in the page header drives public visibility:

- `checked` when `location.status == 'enabled'`
- On `insToggle`, `LocatorPortal.updateVisibility(status)` calls `GET /api/locator/update-visibility?status=enabled|disabled`, which runs `update_listing_status.graphql` and returns `{ ok: true, status }`.
- The hidden-listing banner (`#locator-visibility-banner`) hides when visibility is on and shows when off.

### Profile tab

`views/partials/portal/listing_profile_fields.liquid` — the form is rendered by `forms/portal/listing_profile.liquid`, which updates `modules/insites_locator/location`.

Fields:
- Logo `<ins-image-picker>` (120×120) and banner picker (1440×600) — both upload to S3 via the presigned-URL flow (see [Image upload flow](#image-upload-flow) below)
- Company Name, Email, `<ins-input-tel>` (with hidden mirror inputs for `phone_number` + `phone_country_code`), Website
- Partner Type `<ins-input-select>` sourced from `categories`
- Partner Tier (readonly, not yet wired)
- Short Description `<ins-textarea>` (150-char counter)
- About Company `<ins-editor>` (HTML, not markdown — matches the admin)
- Submit button

**Slug generation (async callback).** After a successful save, the form's `async_callback_actions` runs server-side to keep `location.slug` in sync with `location_name`:

1. Kebab-case `location_name` to form a base slug.
2. Query `get_location_slugs.graphql` for any slugs starting with that base.
3. Dedupe against the in-memory haystack (skipping `form.id` so the record's own slug doesn't collide with itself), trying `base`, `base-2`, … `base-100`.
4. `update_location_slug.graphql` writes the resolved slug back to the record.

The resulting slug is what the public Partner Profile page (`/find-a-partner/{slug}`) resolves on.

### Location tab

`views/partials/portal/listing_location_fields.liquid` — form rendered by `forms/portal/listing_location.liquid`.

- A Google Places `address-lookup` search input (prefix `listing` so app-portal's `address-lookup.js` auto-fills `listing_address_1`, `listing_suburb`, etc.)
- Hidden `latitude`, `longitude`, and `geojson` inputs (built client-side from lat/lng before submit — see [`validateForm`](#client-side-validateform) below)
- Address 1, Address 2, Suburb, State, Postcode, Country

### Social tab

`views/partials/portal/listing_social_fields.liquid` — form rendered by `forms/portal/listing_social.liquid`.

Six URL inputs: Facebook, X, YouTube, LinkedIn, Instagram, Snapchat. The first five use the `url-field` attribute and are normalised to `https://` on submit; Snapchat is plain text (since it's a username, not a URL).

### Client-side `validateForm`

All three forms share `LocatorPortal.validateForm` (in `locator-portal.js`) as their `html-onsubmit` handler. Before delegating to `App.validation.validateForm`, it:

1. Bridges `<ins-input-tel>` to its two hidden inputs by calling `getValues()` and writing `phone_number` and `country_code` into them.
2. Builds the `geojson` Point string from the hidden `latitude` and `longitude` inputs.
3. Normalises bare URLs by prepending `https://` to any `[url-field]` input that lacks a protocol.

If validation passes, all `<ins-button>` elements are disabled and the submit button is set to `loading=true` before the form submits.

### Image upload flow

Logo and banner images use the `<ins-image-picker>` component, but the picker only holds a base64 data URL — it does not upload. `LocatorPortal.uploadImage` (bound to the picker's `insValueChange` event) handles the upload:

1. `GET /api/locator/upload-presign?table=modules/insites_locator/location&property={field}` (where `{field}` is `location_image` for the logo or `image_1` for the banner) returns `{ s3_upload: { direct_upload_url, form_data } }` from the `get_s3_upload.graphql` mutation.
   - **Note** — the request must override the `Accept` header to `application/json` because PlatformOS `format: json` pages only match a single content type (see CLAUDE.md for the full quirk).
2. `base64ToBlob` converts the picker's data URL to a Blob.
3. `POST` the blob to S3 as `multipart/form-data` (`form_data` fields + the `file` blob).
4. Parse the returned XML (`<Location>`), URL-decode it, and write the resulting public URL into the hidden form input for the field (`#locator-logo-url` or `#locator-banner-url`).

On failure, the picker is cleared and a notyf error is shown.

### Key files

| File | Purpose |
|---|---|
| `views/pages/portal/my-locator-listing.liquid` | Page entry — fetch / orphan cleanup / bootstrap / tabs |
| `views/partials/portal/listing_profile_fields.liquid` | Profile tab fields |
| `views/partials/portal/listing_location_fields.liquid` | Location tab fields |
| `views/partials/portal/listing_social_fields.liquid` | Social tab fields |
| `forms/portal/listing_profile.liquid` | Profile form — UPDATE + async slug-generation callback |
| `forms/portal/listing_location.liquid` | Location form — UPDATE address fields + lat/lng + geojson |
| `forms/portal/listing_social.liquid` | Social form — UPDATE six social link fields |
| `assets/scripts/locator-portal.js` | `LocatorPortal` IIFE — validateForm, uploadImage, updateVisibility, normalizeUrlFields |

---

## API endpoints

All endpoints are PlatformOS pages with `format: json`.

| Endpoint | Purpose |
|---|---|
| `GET /api/locator/find-a-partner` | Directory search. Branches on params: `lat`+`lng`+`distance` → `get_locations_nearby` (geo-radius via `distance_sphere`); `location` text → `get_locations` (contains-match on city / postcode / address_1); else all enabled locations. Returns `{ html, total, total_pages, current_page }` where `html` is server-rendered card markup. |
| `GET /api/locator/update-visibility` | Toggles the current user's location `status` to `enabled` / `disabled` via `update_listing_status`. Returns `{ ok: true, status }` or error JSON (`unauthorized`, `invalid_status`, `location_not_found`). |
| `GET /api/locator/upload-presign?table=...&property=...` | Calls `get_s3_upload` mutation for the given `table` + `property` and returns the S3 presigned upload payload, wrapped under `s3_upload: { direct_upload_url, form_data }`, for client-side image upload. |

---

## GraphQL queries

### `locations/`

| Query | Purpose |
|---|---|
| `create_my_location.graphql` | `record_create` a location with `uuid`, `status`, `location_name` (used by first-visit bootstrap) |
| `create_location_custom_field.graphql` | `record_create` the join row linking `user_uuid ↔ location_uuid` |
| `delete_my_location_custom_fields.graphql` | `records_delete_all` join rows for a `user_uuid` (orphan cleanup) |
| `get_my_location.graphql` | Fetches the current user's join row + `related_record` to the full location |
| `get_locations.graphql` | Paged list of enabled locations, optional `location` text matches city / postcode / address_1, sorted by `updated_at DESC` |
| `get_locations_nearby.graphql` | Paged geo-radius search via `distance_sphere` on the `geojson` property, requires `status=enabled` |
| `get_location_detail.graphql` | Single location lookup by `slug`, returns all public profile fields + `related_record` category |
| `get_location_slugs.graphql` | All slugs starting with a prefix (per_page 100), used by the slug-generation callback |
| `update_listing_status.graphql` | `record_update` only the `status` field |
| `update_location_slug.graphql` | `record_update` only the `slug` field |

### `categories/`

| Query | Purpose |
|---|---|
| `get_categories.graphql` | All categories sorted by `category_name`, returns `{ id, name, uuid }` |

### `system/`

| Query | Purpose |
|---|---|
| `get_s3_upload.graphql` | `property_upload_presigned_url` mutation, aliased as `s3_upload`, returning `{ direct_upload_url, form_data }` |

---

## Module layout

```
modules/locator/public/
├── assets/
│   ├── scripts/
│   │   ├── locator.js          # Public directory (find-a-partner)
│   │   └── locator-portal.js   # Portal listing forms + image upload + visibility
│   └── styles/
│       └── locator.css         # All locator styles (website + portal)
├── forms/portal/
│   ├── listing_profile.liquid
│   ├── listing_location.liquid
│   └── listing_social.liquid
├── graphql/
│   ├── categories/
│   ├── locations/
│   └── system/
├── migrations/
│   ├── 20260507000007_location_custom_field.liquid
│   └── 20260513070054_constants.liquid
└── views/
    ├── pages/
    │   ├── api/
    │   │   ├── find-a-partner.liquid
    │   │   ├── update-visibility.liquid
    │   │   └── upload-presign.liquid
    │   ├── portal/
    │   │   └── my-locator-listing.liquid
    │   └── website/
    │       └── find-a-partner.liquid    # also serves /find-a-partner/{slug}
    └── partials/
        ├── layout/hero_title.liquid
        ├── portal/
        │   ├── listing_profile_fields.liquid
        │   ├── listing_location_fields.liquid
        │   └── listing_social_fields.liquid
        └── website/find_a_partner/
            ├── card.liquid
            ├── details.liquid           # Partner Profile partial
            ├── filters.liquid
            ├── filters_drawer.liquid
            ├── list.liquid              # Directory layout
            └── results.liquid
```
