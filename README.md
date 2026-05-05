# Insites Add-On — Locator v1.1.0

## Default Country for Geocoding

When a user enters a postcode (numbers only) in the Find a Partner search bar, the locator appends a country name to the geocoder query to ensure accurate results (e.g. `"5000"` becomes `"5000, Australia"`).

The country defaults to **Australia** but can be overridden per instance via the CMS:

**IIA → CMS → Globals → Locations → Location 1 → Country**

The value stored in `loc_1_country` is used automatically. If the field is empty or not set, the geocoder falls back to `Australia`.
