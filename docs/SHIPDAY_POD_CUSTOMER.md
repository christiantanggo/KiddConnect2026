# Proof of delivery (customer dashboard)

- **Where:** Last-Mile Delivery → **My deliveries** → tap a row. Side panel shows **Proof of delivery** with **Refresh** (pulls from Shipday).
- **Before completion:** Message explains POD appears after the delivery is complete.
- **Complete, no POD yet:** Message + **Refresh** (driver may still be uploading; Shipday has no separate sandbox—use trial account per [Shipday API](https://docs.shipday.com/reference/shipday-api)).
- **Data stored:** `delivery_requests.pod_signature_url`, `pod_photo_urls` (JSON array), `pod_captured_at`. Sync merges:
  - `proofOfDelivery` (signature + `imageUrls`) from the order object
  - `assignedCarrier.carrierPhoto` (driver POD image), per Shipday support

**API**

- `GET /api/v2/delivery-network/requests` — includes POD fields when migration is applied.
- `POST /api/v2/delivery-network/requests/:id/sync-pod` — authenticated customer (same business as request); runs `syncProofOfDeliveryFromShipday`.

**Migration:** `migrations/add_delivery_proof_of_delivery.sql`
