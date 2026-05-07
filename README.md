# Insites Add-On — Locator v1.1.0

## Find a Partner Page

The Find a Partner page (`/find-a-partner`) is a public-facing directory that lets visitors search for nearby Insites partners using a location search, distance filter, category filter, and an interactive Google Map.

---

### How it works

#### Initial page load

1. The server renders up to **100 location cards** from the database via `get_locations.graphql`.
2. All 100 cards are written into the HTML DOM so the map can pin all of them immediately.
3. The list panel shows **10 cards at a time** — the rest are hidden via the `.is-page-hidden` CSS class. Pagination buttons appear below the list when there are more than 10 results.
4. Clicking a pagination button shows the next/previous 10 cards in the list and smoothly scrolls the browser to the top of the list. Map pins are unaffected — all 100 remain visible.

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
10. The URL is updated via `history.pushState` so the search is shareable and supports the browser back button.

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

#### Clear filters

Clicking **Clear filters** resets the location input, category selections, and distance, then reloads all results via AJAX without a full page refresh.

---

### Configuration

#### Default country for geocoding (fallback path only)

This only applies when a user types a postcode without selecting from the Places Autocomplete dropdown. When the geocoder fallback runs and the input is a postcode (digits only), the country name is appended to the query (e.g. `"5000"` becomes `"5000, Australia"`) to avoid ambiguous results.

The country is read from the CMS — **IIA → CMS → Globals → Locations → Location 1 → Country** (`loc_1_country`). If the field is empty or not set, it defaults to `Australia`.

When the user selects from the autocomplete dropdown, the lat/lng comes directly from the Places API and this country value is not used.

---

### Key files

| File | Purpose |
|---|---|
| `modules/locator/public/views/pages/website/find-a-partner.liquid` | Page entry point |
| `modules/locator/public/views/partials/website/find_a_partner/filters.liquid` | Search bar and controls bar |
| `modules/locator/public/views/partials/website/find_a_partner/filters_drawer.liquid` | Filters side drawer |
| `modules/locator/public/views/partials/website/find_a_partner/results.liquid` | Card list, map panel, Google Maps script |
| `modules/locator/public/views/pages/api/find-a-partner.liquid` | AJAX JSON endpoint |
| `modules/locator/public/graphql/locations/get_locations.graphql` | Initial SSR query (up to 100 results) |
| `modules/locator/public/graphql/locations/get_locations_nearby.graphql` | Geo-distance search query |
| `modules/locator/public/assets/scripts/locator.js` | All client-side logic |
| `modules/locator/public/assets/styles/locator.css` | All locator styles |
