# Shipday on-demand (third-party) delivery

This app follows Shipday’s documented on-demand flow: **create order → get estimates → assign** using their REST API.

## Official references

- [On-demand delivery overview](https://docs.shipday.com/reference/on-demand-delivery) (product / plan notes)
- [GET `/on-demand/services`](https://docs.shipday.com/reference/services) — enabled third-party providers
- [GET `/on-demand/estimate/{orderId}`](https://docs.shipday.com/reference/estimate) — fee estimates
- [POST `/on-demand/assign`](https://docs.shipday.com/reference/assign) — assign driver (`name`, `orderId`, optional `estimateReference`, `tip`, `contactlessDelivery`, `podTypes`)
- [PUT `/orders/assign/{orderId}/{carrierId}`](https://docs.shipday.com/reference/assign-order) — **own fleet** (not on-demand)

## Implementation in this repo

| Step | Code |
|------|------|
| Estimates + enabled services | `services/delivery-network/shipdayOnDemand.js` — `collectOnDemandEstimates`, `fetchEnabledOnDemandServiceNames`, `normalizeEstimateList` |
| Assign body (matches docs) | `buildOnDemandAssignBody()` in `shipdayOnDemand.js` |
| Dispatch | `services/delivery-network/dispatch.js` — calls `collectOnDemandEstimates`, then `buildOnDemandAssignBody`, then `POST …/on-demand/assign`; falls back to fleet `PUT …/orders/assign/…` when needed |
| Quotes | `services/delivery-network/shipdayQuote.js` — uses `collectOnDemandEstimates` |

## Admin settings

**Last-Mile Delivery → Shipday → On-demand:** enable on-demand, choose provider or “Cheapest”, optional **contactless** and **tip** (stored on `brokers.shipday` and passed into `buildOnDemandAssignBody`).

## Environment (optional)

- `SHIPDAY_ON_DEMAND_BASE_URL` — override on-demand API base if Shipday documents a different host/path.
- `SHIPDAY_ESTIMATE_STAGGER_MS` — delay between estimate calls to reduce HTTP 429.
- `SHIPDAY_POST_ESTIMATE_DELAY_MS` — pause after collecting estimates before `POST /assign`.
- `SHIPDAY_ASSIGN_MAX_RETRIES`, `SHIPDAY_ASSIGN_RETRY_BASE_MS` — retry policy for `POST /assign`.
