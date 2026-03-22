# Delivery saved addresses (structured fields)

## Database

- Table `delivery_saved_locations` has `address` (display) plus optional **`address_line`, `city`, `province`, `postal_code`** — see `migrations/add_delivery_saved_location_address_parts.sql`.

## Behaviour

- **API GET** `/api/v2/delivery-network/saved-locations` returns rows **normalized** from the combined `address` string when structured columns are missing or wrong (e.g. full province name `"Ontario"` in the wrong column).
- **POST/PATCH** runs **`hydrateSavedLocationStructuredFields`** so new/updated rows persist parsed street, city, **2-letter province**, and postal.

## Parsing

- Shared logic: `services/delivery-network/canadianAddressParts.js` (server) and `frontend/lib/canadianAddressParts.js` (dashboard).
- Handles strings like **`539 First Street London Ontario N5V 1Z5`** (no commas): strips postal, full province name, then city vs street.

## Backfilling old rows

The GET response is fixed immediately. To **rewrite** existing DB rows with parsed columns, run (from repo root, with `.env` containing Supabase service role):

```bash
node scripts/backfill-delivery-saved-location-columns.mjs
```

## Admin / business UI

- **Tavari Admin → Last-Mile Delivery** pickup/delivery forms already use separate street, city, province, postal fields.
- **Customer dashboard → Saved addresses** uses the same four fields when adding an address.
