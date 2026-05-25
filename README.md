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

Slugs are auto-generated by the listing form's `async_callback_actions` when the listing is saved — see [My Locator Listing → Slug generation (async callback)](#slug-generation-async-callback) below. URL pattern: **`/find-a-partner/{kebab-cased-location-name}`**, with URL-unfriendly punctuation (`.`, `,`, `&`, etc.) stripped from the name before kebab-casing, deduped with `-2`/`-3` suffixes (up to `-100`).

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

1. **Fetch user + CRM.** `get_my_user_with_crm` returns the current user joined down through `crm_contact → crm_company → crm_address` in a single round trip, so the bootstrap step below can pre-fill the listing with the user's existing company details. Falls back gracefully when any link in the chain is missing.
2. **Fetch existing listing.** `get_my_location` for `user.external_id`.
3. **Orphan cleanup.** If the join row exists but its joined location is gone (admin deleted the location from the front-end admin UI without removing the join row), call `delete_my_location_custom_fields` to wipe all of the user's join rows, then fall through to step 4.
4. **First-visit bootstrap.** If the user has no join row, delegate to the official module-locator service:

   ```liquid
   {% function created_location = "locator/controller/locations/create", params: params %}
   ```

   `locator/controller/locations/create` is the same function the admin "Add location" UI calls. It generates the UUID, validates against the `modules/insites_locator/add_location` form (presence rules + slug uniqueness), runs any platform-level callbacks, and **writes the `location_custom_field` join row in the same call** via the `custom_field.user_uuid` param we pass in.

   The `params` hash seeds the new location from CRM data:
   - `location_name` — falls back through `crm_company.company_name → crm_company.uuid → user.external_id` so the required-field constraint is always satisfied.
   - `email`, `phone_number`, `phone_country_code`, `website` — from `crm_company`.
   - `address_1`, `address_2`, `suburb`, `state`, `postcode`, `country`, `latitude`, `longitude`, etc. — from `crm_company.crm_address` (the default address).
   - All six social links — from `crm_company`.
   - `status: 'disabled'` — listing stays hidden until the user toggles visibility on.

   Without this bootstrap the listing forms would submit in CREATE mode but the join row would never be created — the next page load would still return nil and the save would appear to have vanished.

   **Company Name placeholder for the uuid-fallback case.** When `location_name` ends up seeded with a uuid (no CRM company_name), `listing_profile_fields.liquid` detects the uuid shape (36 chars, 5 segments split on `-`) and renders the Company Name input with an empty `value=` so the user sees just the placeholder, not the uuid. The DB value stays as the uuid until the user enters a real name and saves.
5. **Categories.** `get_categories` for the Partner Type dropdown.
6. **Render.** Page header (with visibility toggle + hidden-listing info banner), then a single `<ins-tab>` whose tab items inject their fields into one shared `<form>` — see [Unified form](#unified-form) below.

### Visibility toggle

The `<ins-toggle-switch id="locator-visibility">` in the page header drives public visibility:

- `checked` when `location.status == 'enabled'`
- On `insToggle`, `LocatorPortal.updateVisibility(status)` calls `GET /api/locator/update-visibility?status=enabled|disabled`, which runs `update_listing_status.graphql` and returns `{ ok: true, status }`.
- The hidden-listing banner (`#locator-visibility-banner`) hides when visibility is on and shows when off.

### Preview my listing

An outlined **"Preview my listing"** button (`#locator-preview-link`) sits beside the visibility toggle in the page header and opens `/find-a-partner/{slug}` in a new tab.

- **Server-side gate** — the link is only rendered when `location.slug != blank`. A brand-new user's slug is generated by the async callback *after* their first save, so on first visit there's no slug yet and the button is omitted entirely (avoids a broken `/find-a-partner/` URL).
- **Visibility coupling** — initially rendered with the `hide` class unless `location.status == 'enabled'`, so a hidden listing doesn't get a preview link (the public profile page wouldn't resolve it). `LocatorPortal.init` wires the visibility toggle's `insToggle` handler to add/remove `hide` on the link in lockstep, so flipping the toggle on reveals the button without a page reload.

### Unified form

A single `<form>` (`forms/locator_listing.liquid`) wraps the entire `<ins-tab>` UI. Tabs are visual chrome only — each `<ins-tab-item>` includes a field partial whose inputs are children of the shared form. One submit button below the tabs sends everything in one POST.

This replaces an earlier three-form-per-tab structure (one form per tab). The old shape meant edits in one tab were discarded the moment the user clicked save on a different tab.

The form declares **every field** from all three tabs and all the validation rules in its YAML frontmatter, plus the slug-generation `async_callback_actions` that runs after each save. `flash_notice: Success-Listing` / `flash_alert: Error-Listing` drive a pair of notyf scripts on the page.

#### Profile tab

`views/partials/portal/listing_profile_fields.liquid`:
- Logo `<ins-image-picker>` (120×120) and banner picker (1440×600) — both upload to S3 via the presigned-URL flow (see [Image upload flow](#image-upload-flow) below)
- Company Name, Email, `<ins-input-tel>` (with hidden mirror inputs for `phone_number` + `phone_country_code`), Website
- Partner Type `<ins-input-select>` sourced from `categories`
- Partner Tier (readonly, not yet wired)
- Short Description `<ins-textarea>` (150-char counter)
- About Company `<ins-editor>` (HTML, not markdown — matches the admin)

#### Location tab

`views/partials/portal/listing_location_fields.liquid`:
- A Google Places `address-lookup` search input (prefix `listing` so app-portal's `address-lookup.js` auto-fills `listing_address_1`, `listing_suburb`, etc.)
- Hidden `latitude`, `longitude`, and `geojson` inputs (built client-side from lat/lng before submit — see [`validateForm`](#client-side-validateform) below)
- Address 1, Address 2, Suburb, State, Postcode, Country

#### Social tab

`views/partials/portal/listing_social_fields.liquid` — six URL inputs: Facebook, X, YouTube, LinkedIn, Instagram, Snapchat. The first five use the `url-field` attribute and are normalised to `https://` on submit; Snapchat is plain text (since it's a username, not a URL).

#### Slug generation (async callback)

After every successful save, the form's `async_callback_actions` runs server-side to keep `location.slug` in sync with `location_name`:

1. Hand-strip URL-unfriendly punctuation from `location_name` (`. , ' " ! ? # & @ $ % * + = : ; ( ) [ ] { } < > | ~ ^ \` / \\`), then lowercase, then map spaces / underscores to `-`, then collapse any double-dashes. Liquid has no regex so the strip is a chain of `| replace:` calls — see [`forms/locator_listing.liquid`](modules/locator/public/forms/locator_listing.liquid). Without this step, names like `"Acme Co."` produced slugs like `acme-co.` and the public profile URL hit a 404.
2. Query `get_location_slugs.graphql` for any slugs starting with that base.
3. Dedupe against the in-memory haystack (skipping `form.id` so the record's own slug doesn't collide with itself), trying `base`, `base-2`, … `base-100`.
4. `update_location_slug.graphql` writes the resolved slug back to the record.

The resulting slug is what the public Partner Profile page (`/find-a-partner/{slug}`) resolves on.

### Tab error state + active-tab persistence

Both behaviours live in `locator-portal.js` so the field-to-tab mapping has one source of truth — there is no hard-coded field list in Liquid.

**`markInvalidTabs(formElem)`** — walks each `<ins-tab-item>` and sets `item.hasError = true` if it contains any field with `.is-invalid`. Setting the prop triggers the component's `insTabError` event; the parent `<ins-tab>` listens for that and toggles the `.has-error` class on the matching header (see [ins-tab.tsx:checkForErrors](../insites-components-v2/components/src/components/ins-tab/ins-tab.tsx)). If the currently-active tab is clean but errors live elsewhere, calls `tabEl.activateTab(N)` to surface the first errored tab.

It runs from two places:
- **On submit** — after `App.validation.validateForm` has applied `.is-invalid` to empty/invalid required fields, so client-side validation immediately lights up the offending tab(s).
- **On page load** (300ms after `init`, to let the components hydrate) — picks up server-rendered errors. When PlatformOS re-renders the form after a YAML-rule failure, each errored field carries `<ins-input has-error>`, and the component itself emits `.is-invalid` in light DOM — the same signal client-side validation produces, so the same handler works for both cases.

**`rememberActiveTab` / `restoreActiveTab`** — persist which tab the user was on across the save → redirect round trip via `sessionStorage['locatorActiveTab']`:
- `validateForm` calls `rememberActiveTab` immediately before `formElem.submit()`.
- `init` calls `restoreActiveTab` on page load, which reads the stored label, clears the entry (one-shot), and calls `tabEl.activateTab(N)` to put the user back where they were. Runs *before* `markInvalidTabs`, so if there are errors the error-driven tab switch wins — correct precedence (errors > convenience).

### Client-side `validateForm`

`LocatorPortal.validateForm` (in `locator-portal.js`) is the form's `html-onsubmit` handler. Before delegating to `App.validation.validateForm`, it:

1. Bridges `<ins-input-tel>` to its two hidden inputs by calling `getValues()` and writing `phone_number` and `country_code` into them.
2. Builds the `geojson` Point string from the hidden `latitude` and `longitude` inputs.
3. Encodes literal spaces (`' '` → `%20`) in the hidden upload URL inputs (`#locator-logo-url` / `#locator-banner-url`). This rescues legacy records whose image URLs were saved with raw spaces — without it, re-saving such a record would forward an invalid URL to PlatformOS and fail validation.
4. Normalises bare URLs by prepending `https://` to any `[url-field]` input that lacks a protocol.
5. Runs `App.validation.validateForm`. If invalid, calls `markInvalidTabs` (so the tab headers light up and the first errored tab is surfaced) and returns false.
6. If valid: calls `markInvalidTabs` (clears any lingering error indicators from a prior failed submit) + `rememberActiveTab` (sessionStorage), then disables all `<ins-button>`s, sets the submit button to `loading=true`, and submits.

### Image upload flow

Logo and banner images use the `<ins-image-picker>` component, but the picker only holds a base64 data URL — it does not upload. `LocatorPortal.uploadImage` (bound to the picker's `insValueChange` event) handles the upload:

1. `GET /api/locator/upload-presign?table=modules/insites_locator/location&property={field}` (where `{field}` is `location_image` for the logo or `image_1` for the banner) returns `{ s3_upload: { direct_upload_url, form_data } }` from the `get_s3_upload.graphql` mutation.
   - **Note** — the request must override the `Accept` header to `application/json` because PlatformOS `format: json` pages only match a single content type (see CLAUDE.md for the full quirk).
2. `base64ToBlob` converts the picker's data URL to a Blob.
3. **Sanitise the filename** — collapse any whitespace runs to `-` before sending. PlatformOS rejects URLs with literal spaces ("not a valid URL"), so a file picked as `"green 2.jpeg"` is uploaded to S3 as `green-2.jpeg`. Cleaner than relying on percent-encoding and avoids the need to URL-encode anywhere downstream.
4. `POST` the blob to S3 as `multipart/form-data` (`form_data` fields + the `file` blob).
5. Parse the returned XML (`<Location>`) and write the URL **verbatim** (without URL-decoding) into the hidden form input for the field (`#locator-logo-url` or `#locator-banner-url`). S3 returns an already-valid percent-encoded URL; decoding it would re-introduce literal spaces and trip the same validator.

On failure, the picker is cleared and a notyf error is shown. For legacy records whose URLs were saved with raw spaces before the sanitisation step landed, `validateForm` re-encodes spaces in the hidden URL inputs at submit time — see [Client-side `validateForm`](#client-side-validateform).

### Key files

| File | Purpose |
|---|---|
| `views/pages/portal/my-locator-listing.liquid` | Page entry — CRM fetch / location fetch / orphan cleanup / first-visit bootstrap / one `include_form` call |
| `forms/locator_listing.liquid` | The single unified form — declares every field, all validation rules, the slug-generation `async_callback_actions`, and the `<ins-tab>` markup that wraps the three field partials |
| `views/partials/portal/listing_profile_fields.liquid` | Profile tab fields (no submit button) |
| `views/partials/portal/listing_location_fields.liquid` | Location tab fields (no submit button) |
| `views/partials/portal/listing_social_fields.liquid` | Social tab fields (no submit button) |
| `graphql/account/get_my_user_with_crm.graphql` | Joins current user → `crm_contact` → `crm_company` → `crm_address` in one query for first-visit prefill |
| `assets/scripts/locator-portal.js` | `LocatorPortal` IIFE — validateForm, uploadImage (filename sanitisation), updateVisibility, normalizeUrlFields, normalizeUploadUrls, markInvalidTabs, rememberActiveTab / restoreActiveTab |

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

### `account/`

| Query | Purpose |
|---|---|
| `get_my_user_with_crm.graphql` | Joins `current_user → crm_contact → crm_company → crm_address` in one round trip. Used by the first-visit bootstrap to pre-fill the new location with the user's existing company name, address, contact, and social links. |

### `locations/`

| Query | Purpose |
|---|---|
| `delete_my_location_custom_fields.graphql` | `records_delete_all` join rows for a `user_uuid` (orphan cleanup) |
| `get_my_location.graphql` | Fetches the current user's join row + `related_record` to the full location |
| `get_locations.graphql` | Paged list of enabled locations, optional `location` text matches city / postcode / address_1, sorted by `updated_at DESC` |
| `get_locations_nearby.graphql` | Paged geo-radius search via `distance_sphere` on the `geojson` property, requires `status=enabled` |
| `get_location_detail.graphql` | Single location lookup by `slug`, returns all public profile fields + `related_record` category |
| `get_location_slugs.graphql` | All slugs starting with a prefix (per_page 100), used by the slug-generation callback |
| `update_listing_status.graphql` | `record_update` only the `status` field |
| `update_location_slug.graphql` | `record_update` only the `slug` field |

> **Location creation** is delegated to the official module-locator function `locator/controller/locations/create` (`{% function ... %}` tag in the page). It wraps the `modules/insites_locator/locations/add_location` mutation with form-name validation and writes the `location_custom_field` join row in the same call. No addon-side `create_my_location.graphql` exists.

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
│   │   └── locator-portal.js   # Portal listing form: validation, image upload, visibility, tab error + persistence
│   └── styles/
│       └── locator.css         # All locator styles (website + portal)
├── forms/
│   └── locator_listing.liquid  # Single unified form — all fields, validation, slug callback, tabs, submit button
├── graphql/
│   ├── account/
│   │   └── get_my_user_with_crm.graphql
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
        │   ├── listing_profile_fields.liquid    # field markup only — no <form> wrapper, no submit button
        │   ├── listing_location_fields.liquid
        │   └── listing_social_fields.liquid
        └── website/find_a_partner/
            ├── card.liquid
            ├── details.liquid           # Partner Profile partial
            ├── filters.liquid
            ├── list.liquid              # Directory layout
            └── results.liquid
```
