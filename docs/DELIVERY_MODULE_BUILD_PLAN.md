# Tavari Last-Mile Delivery Module — Build Plan

This document is the single source of truth for building the delivery module. Do not modify the emergency dispatch module. All delivery work is additive (new routes, services, tables, UI) or new branches in shared files (e.g. VAPI webhook).

**Handoff-ready:** Another AI agent or developer can execute this plan end-to-end using **§9 Execution guide for handoff** together with the rest of the document.

---

## Build approach: copy first, then alter

**Do not change any existing emergency dispatch code.** The delivery module is built by:

1. **Copy** — Copy all emergency dispatch files to create the delivery module (routes, services, frontend). New files only: e.g. `routes/v2/delivery-network.js` (copy of `emergency-network.js`), `services/delivery-network/*` (copy of `services/emergency-network/*`), `frontend/app/dashboard/v2/modules/delivery-dispatch/` (copy of `emergency-dispatch/`), `frontend/app/deliverydispatch/` (copy of `emergencydispatch/`). Do not edit the originals.
2. **Alter the copy** — Rename references (emergency → delivery), add delivery-only DB tables, change domain logic (e.g. providers → brokers, service request → delivery request), and add delivery-specific behavior (approved numbers, shared line, pricing, etc.). All changes happen in the new delivery files (and in new branches in shared files like `vapi.js` and `server.js`).

Emergency dispatch stays untouched. If a bug fix or feature is needed in both modules later, apply it to emergency first, then re-apply or port to the delivery copy.

---

## 1. Locked Decisions

- **Routing:** Shared delivery number(s). One (or a few) numbers for delivery. Resolve **business by caller**: lookup caller in `delivery_approved_numbers` → `business_id` → pass into the single delivery assistant (metadata or server-injected context). If caller not approved, AI runs “Is this for a registered business?” → owner approve/deny.
- **Business identification:** Caller ID matched to approved number; approval flow when not approved: AI asks “Is this for a registered business?”; if yes, caller provides **business phone number** so we can send approval request to that business’s owner (owner: Approve this delivery / Approve all from this number / Deny).
- **Payment:** Existing Stripe. Payment link by **email** by default. When offering link: ask customer if they want it by SMS (“data rates may apply”); if yes, send link by SMS and charge configurable amount per SMS (track and bill).
- **Dispatch:** Multiple broker APIs from day one. Cheapest-first; try 5 min per network, then next; after 10 min total escalate to Tavari operator.
- **Operator:** Tavari-only admin view (not business dashboard). Operators: retry networks, manually assign, cancel, message driver/customer, override pricing.
- **External API:** After MVP. Put a **placeholder in the UI** (e.g. “Partner API” / “External API” in delivery settings) so it’s not forgotten.
- **Chatbot:** Same pattern as emergency dispatch chatbot (same conversational flow and backend, delivery-specific intents and data).
- **Cancellation:** Require **phone** (find business) + **drop-off address** + **delivery date**. If multiple deliveries match, then ask for **reference number**. Do not ask for reference number first; use it only as tiebreaker. Every delivery has a short reference number (stored and shown in dashboard/confirmations). If caller is approved → cancel immediately; if not approved → owner approval required before cancel.
- **Billing:** Integrate with existing Tavari business billing: same Stripe customer, delivery as usage/line items, configurable schedule (e.g. 14-day daily then weekly), spending limits, trusted-account skip trial.
- **Data:** Delivery-only DB. All delivery tables keyed by `business_id`; no reuse of a global business profile for approved numbers or saved locations.

---

## 2. Phases and “Done When”

### Phase 1 — Walking skeleton (routing, intake, one broker, no payment)

- **Scope:** **Step 1 — Copy:** Duplicate emergency dispatch into delivery (copy `routes/v2/emergency-network.js` → `delivery-network.js`, `services/emergency-network/` → `services/delivery-network/`, dashboard module `emergency-dispatch` → `delivery-dispatch`, public `emergencydispatch` → `deliverydispatch`). Do not modify any original emergency files. **Step 2 — Alter the copy:** Rename all emergency→delivery references in the new files; add delivery-only DB (config, approved numbers, saved locations, requests, dispatch tables); Implement shared delivery number + caller→business resolution in VAPI (assistant-request and end-of-call). **AI behavior (all entry points):** conversational prompts, typing delay indicators, structured question flow (same engine as emergency dispatch). Intake: phone, SMS, dashboard form (and chatbot stub if same as emergency). Create delivery request with **required intake fields** (see §5 and §7): pickup info, delivery type (business/residential), delivery business name if applicable, delivery address, recipient name/phone, package description/size/weight, special instructions, priority (Immediate / Same Day / Schedule). Reference number on every request. Integrate **one** dispatch broker (e.g. Shipday); create job and handle assign/timeout; no “cheapest first” yet (single network). No payment flow; no operator UI.
- **Done when:** Call from approved number → business resolved → AI collects pickup/delivery → request created with reference number → job sent to one broker → status updates (e.g. assigned) visible in business dashboard. Unapproved caller gets approval flow (owner approve/deny). Dashboard form creates request. No payment, no operator view.

### Phase 2 — Payment, operator, cancellation

- **Scope:** Payment link for **individual** requests (no business account): Stripe Payment Link (or Checkout); email by default; optional SMS with per-SMS charge. Dispatch only after payment for individuals. Tavari **operator view** (admin): list escalated deliveries; retry networks, manual assign, cancel, message driver/customer, override pricing. **Cancellation:** AI collects phone + address + date; if multiple matches, ask reference number; cancel delivery and update status.
- **Done when:** Individual can receive payment link (email or SMS), pay, then dispatch runs. Operator can see escalated deliveries and perform actions. Caller can cancel via AI (phone + address + date, reference when needed).

### Phase 3 — Pricing, notifications, tracking, reporting

- **Scope:** **Pricing engine:** quote before dispatch; support pricing models: flat rate, distance×rate (MVP e.g. $2.20/km), margin over driver API cost (default per spec); configurable **globally and per business**. Minimum delivery price (enable/disable, set amount); optional platform/dispatch fee (e.g. $3 on $18); **pricing disclaimer:** “Final cost may vary up to ±5% depending on courier network cost”; **surge:** AI may inform “Delivery costs are currently elevated. You may proceed or try again later.” **Notifications:** configurable events (driver assigned, arriving, completed, delayed, failed) via dashboard / email (default) / SMS (optional, paid). **Tracking:** in business dashboard; status from broker. **Delivery confirmation (proof):** every delivery requires proof; support photo confirmation and/or signature confirmation (from broker); show in dashboard. **Failed delivery:** configurable policy (full charge / driver cost only / no charge); scenarios: recipient unavailable, incorrect address, business closed. **Multi-package:** multiple packages to same address allowed; pricing behavior per courier network. **Business dashboard:** active deliveries, delivery history, tracking, **invoices**, performance reports. **Reporting:** business (delivery volume, average delivery time, failure rates); Tavari admin (delivery performance, courier network reliability, revenue, operational analytics).
- **Done when:** Customer sees price before confirming. Notifications and tracking work. Proof (photo/signature) visible where broker provides it. Basic reports and invoices available for business and admin.

### Phase 4 — Multi-broker, limits, polish, placeholder API

- **Scope:** **Multi-broker:** configurable list of networks with cost/priority order; cheapest-first; 5 min per network, 10 min then escalate. **Delivery preferences (per-business):** businesses can configure e.g. prefer DoorDash only, disable Uber; admin can enforce these preferences. **Spending limits:** per-business daily/weekly; on exceed: charge card or hold account; notify operator and business. **Billing:** 14-day daily then weekly; trusted-account skip trial; delivery line items on existing Stripe customer. **Saved locations:** default pickup, multiple named pickups, frequent delivery addresses (e.g. “Sunny Side Retirement Center”); AI retrieves stored data when business identified; **pickup flow:** if business caller, ask “Is the pickup from your default location?” — if yes confirm stored data; if no collect business name, pickup address, pickup contact, callback number; AI confirms stored address before scheduling. **Package rules:** prohibited items list (admin-configurable); size/weight limits (enforce for gig networks; reject oversized); AI confirmation “Please confirm the package does not contain prohibited items”; liability on business if falsely declared. **External API:** UI placeholder only (e.g. “Partner API — coming soon” in delivery settings).
- **Done when:** Multiple brokers configurable; cheapest-first dispatch and escalation work. Per-business network preferences and admin override in place. Limits and billing integrated. Saved locations and pickup flow working. Package rules and AI confirmation in place. External API is placeholder only.

---

## 3. Don’t Touch / Out of Scope

- **Copy first, then alter:** Work only in the new delivery copies; never edit emergency dispatch originals.
- **Do not modify:**
  - `routes/v2/emergency-network.js`
  - `services/emergency-network/*` (any file)
  - `frontend/app/dashboard/v2/modules/emergency-dispatch/*`
  - `frontend/app/emergencydispatch/*`
  - Emergency migrations or emergency tables (e.g. `emergency_network_config`, `emergency_service_requests`, `emergency_providers`, `emergency_dispatch_log`, `emergency_dispatch_calls`)
- **Allowed:** Add **new** delivery code only. In shared files (e.g. `routes/vapi.js`, `server.js`), only **add** branches (e.g. `if (assistantId === deliveryAssistantId)` or delivery number check in assistant-request); do not change existing emergency or main-phone-agent logic.
- **Multi-tenant:** One delivery assistant; business_id from caller (approved numbers) or from approval flow. Do not change how the main Tavari AI phone agent resolves business by destination number for existing businesses.

---

## 4. Naming and Structure

| Layer        | Convention |
|-------------|------------|
| Tables      | Prefix `delivery_` (e.g. `delivery_network_config`, `delivery_approved_numbers`, `delivery_requests`) |
| API routes  | Mount at `/api/v2/delivery-network/` |
| Backend     | Route file: `routes/v2/delivery-network.js`; services: `services/delivery-network/*.js` |
| Frontend    | Dashboard: `frontend/app/dashboard/v2/modules/delivery-dispatch/`; public: `frontend/app/deliverydispatch/` |
| API client  | `deliveryNetworkAPI` in `frontend/lib/api.js`, base path `/v2/delivery-network` |
| Module key  | `delivery-dispatch` in `modules` table; dashboard route `/dashboard/v2/modules/delivery-dispatch` |
| Config      | Global: shared delivery phone number(s), delivery VAPI assistant id. Per-business: in delivery tables keyed by `business_id`. |

---

## 5. Entities and Tables (Delivery-Only DB)

- **delivery_network_config (global)** — Shared delivery line number(s), delivery VAPI assistant id, webhook URL. Single row or keyed rows (e.g. `settings`).
- **delivery_business_config (per-business)** — Business-level settings: notification preferences (events: driver assigned, arriving, completed, delayed, failed; methods: dashboard, email, SMS); pricing model (flat / distance×rate / margin over driver API); failed-delivery policy (full charge / driver cost only / no charge); billing schedule; spending limits (daily, weekly); **delivery preferences** (e.g. prefer/disable specific networks — admin can enforce). Key: `business_id`.
- **delivery_approved_numbers** — Approved caller numbers per business. Columns: `business_id`, `phone_number` (E.164), optional label. Used to resolve business from caller.
- **delivery_approval_requests** — Pending approvals when caller not approved: AI collects **business phone number** from caller (to resolve business and notify owner); then business_id, caller phone, status (pending/approved/denied). Owner actions: **Approve this delivery** (approve once), **Approve all deliveries from this number** (add caller to delivery_approved_numbers + approve), **Deny** (reject; notify caller). created/updated.
- **delivery_saved_locations** — Per-business: default pickup, named pickups, frequent delivery addresses. Columns: `business_id`, type (default_pickup / named_pickup / frequent_delivery), name, address, contact, etc.
- **delivery_requests** — Main request record. **Required intake fields (from spec):** pickup (address, contact person/location, callback number; or location_id to saved location); delivery_type (business | residential); delivery_business_name (if applicable); delivery_address; recipient_name; recipient_phone; package_description; package_size; package_weight; special_instructions; priority (Immediate | Same Day | Schedule). Plus: business_id, caller_phone, callback_phone, reference_number (short, unique), status, intake_channel (phone/sms/form/chat/api), payment_status (for individuals: pending_payment/paid), stripe_payment_link_id (if applicable), amount_quoted, created_at, updated_at. Index by business_id, status, created_at, reference_number, (caller_phone, delivery_address, delivery_date) for cancellation lookup.
- **delivery_dispatch_log** — Per-request broker attempts (analogous to emergency_dispatch_log). Columns: `delivery_request_id`, broker/network id, attempt_order, result (accepted/declined/no_driver/timeout/error), attempted_at, broker_job_id, cost_quote.
- **delivery_dispatch_calls** — Optional: if we make outbound calls to drivers (like emergency to providers). If broker is API-only (e.g. Shipday), this may be omitted or used for operator-initiated calls. Columns: delivery_request_id, dispatch_log_id, vapi_call_id, etc.
- **delivery_activity** — Audit/activity log per request (status changes, operator actions, messages). Optional for MVP.
- **delivery_notification_log** — Sent notifications (driver assigned, arriving, completed, etc.) for idempotency and reporting. Optional for MVP.
- **modules** — Insert row for `delivery-dispatch` (name, description, category, etc.) so it appears in dashboard module list.

All tables keyed by `business_id` where applicable; global config is the exception.

---

## 6. Placeholder / Defer List

- **External API:** UI placeholder only. E.g. in delivery module settings: “Partner API — Coming soon” or “External API (for partner applications) — After MVP.” Do not implement API until after MVP.
- **Multi-stop deliveries:** Spec says “Pickup → multiple drop-off addresses”; implementation depends on broker API. Defer to post-MVP or Phase 4 if broker supports it.
- **Tavari drivers vs gig drivers:** Admin setting “Tavari drivers first / gig drivers first” is future; MVP is gig drivers only. Config field can exist; behavior can be “gig only” for MVP.
- **Full reporting (31-point spec):** Phase 3 covers basic reporting; advanced operational analytics can be post-MVP.
- **Prohibited items / size limits:** Config and AI confirmation in Phase 4; enforcement (reject at intake) can be simple (max weight/size in config, reject if over).

---

## 7. Product Spec Checklist (ChatGPT 31-Point Spec)

| # | Spec item | Where covered | Notes |
|---|-----------|---------------|--------|
| 1 | Entry points: AI phone, SMS, chatbot, dashboard form, external API; conversational prompts, typing delay, structured flow | Phase 1 (phone, SMS, form, chatbot stub); Phase 4 (API placeholder). AI behavior in Phase 1 scope. | |
| 2 | Authorization: approved numbers; if not → “registered business?” → caller gives business phone → approval to owner; Approve / Approve all from number / Deny | §1 Locked; §5 delivery_approved_numbers, delivery_approval_requests | |
| 3 | Individual requests: no account; AI collects info; payment link; dispatch only after payment | Phase 2; §1 Payment | |
| 4 | Pickup flow: if business → retrieve stored; “default location?”; yes confirm / no collect (name, address, contact, callback) | Phase 4 Saved locations + pickup flow | |
| 5 | Delivery info (required): type, business name if applicable, address, recipient name/phone, package desc/size/weight, special instructions | §5 delivery_requests; Phase 1 required intake fields | |
| 6 | Saved locations: default pickup, named pickups, frequent addresses; AI confirms before scheduling | Phase 4; §5 delivery_saved_locations | |
| 7 | Priority: Immediate / Same Day / Schedule | §5 delivery_requests; Phase 1 | |
| 8 | Cancellation: phone + drop-off; approved = immediate, not = owner approval; + date + reference when multiple | §1 Cancellation; Phase 2 | |
| 9 | Dispatch: multiple networks, Shipday or similar; cheapest first; 5 min try, then others by cost; 10 min → escalate | Phase 1 (one broker), Phase 4 (multi); §1 Dispatch | |
| 10 | Operator: retry, manual assign, cancel, message driver/customer, override pricing | Phase 2; §1 Operator | |
| 11 | Driver pool: MVP gig only; future admin setting Tavari first / gig first | §6 Placeholder | |
| 12 | Tracking: business dashboard; email default, SMS optional paid | Phase 3 | |
| 13 | Notifications: events (assigned, arriving, completed, delayed, failed); methods dashboard/email/SMS | Phase 3; §5 delivery_business_config | |
| 14 | Failed delivery: configurable charge (full / driver only / none); scenarios (unavailable, wrong address, closed) | Phase 3 | |
| 15 | Pricing: before dispatch; customer sees; ±5% disclaimer | Phase 3 | |
| 16 | Pricing models: flat, distance×rate, margin over driver API; default margin over; global + per business | Phase 3 | |
| 17 | Distance pricing MVP: e.g. $2.20/km | Phase 3 | |
| 18 | Minimum delivery price: enable/disable, set minimum | Phase 3 | |
| 19 | Platform/dispatch fee: optional (e.g. $3) | Phase 3 | |
| 20 | Surge: AI inform “costs elevated, proceed or try later” | Phase 3 | |
| 21 | Package rules: prohibited list; AI confirm; liability business | Phase 4 | |
| 22 | Package size limits: enforce; reject oversized | Phase 4 | |
| 23 | Multi-package: multiple packages same address; pricing per courier | Phase 3 | |
| 24 | Multi-stop: pickup → multiple drop-offs | §6 Defer (broker-dependent) | |
| 25 | Delivery confirmation: photo and/or signature proof; every delivery requires proof | Phase 3 (from broker; show in dashboard) | |
| 26 | Business dashboard: active, history, tracking, invoices, performance reports | Phase 1/3 | |
| 27 | Reporting: business volume, avg time, failure rates | Phase 3 | |
| 28 | Tavari internal reports: admin performance, reliability, revenue, analytics | Phase 3 | |
| 29 | Billing: 14-day daily then weekly; configurable; trusted skip trial | Phase 4; §1 Billing | |
| 30 | Spending limits: daily/weekly; exceed → charge or hold; notify operator + business | Phase 4 | |
| 31 | Delivery preferences: business prefer/disable networks (e.g. DoorDash only); admin can enforce | Phase 4; §5 delivery_business_config | |

---

## Quick Reference: VAPI Hooks for Delivery

- **assistant-request:** If `destinationNumber` is a configured delivery line number, lookup `callerNumber` in `delivery_approved_numbers` → get `business_id`. Return single delivery assistant; inject `business_id` (e.g. in metadata or server-side context). If caller not approved, still return assistant; AI will run approval flow (no or pending business_id).
- **end-of-call-report:** If `assistantId === deliveryAssistantId`, parse transcript/summary into delivery fields, resolve business_id (from metadata or approval), create `delivery_requests` row with reference number, send notifications, then start dispatch (or enqueue payment for individuals).
- **Outbound / broker:** No outbound “call provider” like emergency unless a broker uses callbacks; primary flow is create job via broker API, then handle webhooks for status (assigned, completed, failed). Operator actions (retry, assign, cancel) call broker API or internal APIs.

Use this document at the start of each build session to stay on plan and avoid touching emergency code.

---

## 8. Conflicts and Resolutions (Plan vs Plan, and Plan vs System)

Resolve these before or during build so features work together and the delivery module fits the existing system.

### 8.1 Within the plan (feature vs feature)

| Conflict | Resolution |
|----------|------------|
| **Individual requests have no business** — Plan says “all delivery tables keyed by business_id” but individuals (no account) have no business. | **Resolution:** Allow `business_id` NULL on `delivery_requests` for individual (no-account) requests. All other delivery tables (approved numbers, saved locations, business config) remain per-business only. |
| **Cancellation: business vs individual** — Plan says “phone (find business)” for cancellation; individuals have no business. | **Resolution:** Two paths: (1) **Business caller:** identify business by caller phone (approved numbers) → lookup by business_id + delivery_address + delivery_date; (2) **Individual:** lookup by callback_phone + delivery_address + delivery_date (no business_id). If multiple matches in either path, ask for reference number. |
| **Caller approved for more than one business** — Same phone in `delivery_approved_numbers` for two businesses (edge case). | **Resolution:** Treat as single business: take the first match (e.g. lowest business_id or most recently added). Optionally enforce uniqueness (one phone per business, same phone cannot be in two businesses); document in config that a number should only be approved for one business. |
| **Pricing: “default margin over driver API” vs “MVP distance×rate”** — Spec default is margin over API cost; Phase 3 ships distance×rate first. | **Resolution:** No conflict. Support both models in config; default config value = “margin over driver API”. MVP can implement distance×rate first for simplicity, then add margin-over-API; or implement both in Phase 3. |

### 8.2 Plan vs existing system

| Conflict | Resolution |
|----------|------------|
| **Global delivery config: who can edit?** — Emergency has one global config; any authenticated business with the module can edit it. Delivery has global (line numbers, assistant id) + per-business (approved numbers, etc.). | **Resolution:** Split config in the delivery copy: (1) **Global** `delivery_network_config` (delivery line numbers, delivery VAPI assistant id): read by any authenticated user with delivery module; write via **admin-only** route (e.g. under existing admin or a “delivery system settings” screen) or by a dedicated role. (2) **Per-business** `delivery_business_config` and related tables: read/write with existing `authenticate` + `requireBusinessContext` (scoped to `req.active_business_id`). |
| **VAPI assistant-request: order of checks** — Today: emergency destination → then business-by-destination. Delivery needs: delivery destination → caller→business. | **Resolution:** In `routes/vapi.js` **add** a branch after the emergency block: if `destinationNumber` is a delivery line number (from `delivery_network_config`), lookup `callerNumber` in `delivery_approved_numbers` → get `business_id`, return delivery assistant with `business_id` injected. Do not change emergency or main-phone-agent logic. **Rule:** Delivery line numbers and emergency line numbers must be **disjoint** (no number in both). |
| **Module activation and routing** — Delivery module must be activatable and open the delivery dashboard. | **Resolution:** (1) In `routes/v2/modules.js`: add `'delivery-dispatch'` to `FREE_MODULES`; add `'delivery-dispatch': '/dashboard/v2/modules/delivery-dispatch'` to `moduleDashboards`. (2) In `frontend/app/dashboard/v2/settings/modules/page.jsx`: add `'delivery-dispatch'` to the paths map(s) for settings and dashboard. (3) Insert `delivery-dispatch` row in `modules` table (migration or seed). |
| **Server mount and health** — New route must be mounted and listed. | **Resolution:** In `server.js`: add `app.use("/api/v2/delivery-network", deliveryNetworkRoutes)` (same pattern as emergency-network). In the v2 health check `routes` object, add `deliveryNetwork: "/api/v2/delivery-network"`. |
| **Operator view: auth** — Plan says Tavari-only admin view. | **Resolution:** Operator UI and API (list escalated deliveries, retry, assign, cancel, message, override) must live behind **admin authentication** (e.g. existing admin middleware used in `routes/v2/admin.js` or equivalent). Do not expose operator actions to regular business users. |
| **Public intake (form/chat)** — Emergency has public `POST /request` and public `/public/intake/chat` (no auth). | **Resolution:** In the delivery copy, keep public intake endpoints (form, chat) **before** `router.use(authenticate)`. For form/chat, accept either business-scoped request (if session/token identifies business) or individual request (no business_id); create `delivery_requests` with or without `business_id` accordingly. |
| **Emergency dashboard uses single global config** — All businesses with the module see the same emergency config. Delivery dashboard must show per-business data (approved numbers, requests) and read-only or admin-only global config. | **Resolution:** When altering the copy: (1) All “my approved numbers”, “my saved locations”, “my requests” use `req.active_business_id` and delivery tables keyed by `business_id`. (2) “Delivery line number(s)” and “Delivery assistant” are read from global `delivery_network_config`; update only via admin or explicit “system settings” flow. (3) Requests list filtered by `business_id = req.active_business_id` (and optionally show “all” for admin). |

### 8.3 Summary of system touchpoints (no changes to emergency code)

| File / area | Change |
|-------------|--------|
| `routes/vapi.js` | **Add** branch: if destination is delivery line → caller→business lookup → return delivery assistant with business_id. **Add** branch: end-of-call-report for delivery assistantId → create delivery request, start dispatch or payment flow. |
| `server.js` | **Add** mount for delivery-network routes; **add** deliveryNetwork to v2 health routes list. |
| `routes/v2/modules.js` | **Add** `'delivery-dispatch'` to FREE_MODULES; **add** delivery-dispatch to moduleDashboards. |
| `frontend/app/dashboard/v2/settings/modules/page.jsx` | **Add** delivery-dispatch to paths (settings and dashboard). |
| `frontend/lib/api.js` | **Add** deliveryNetworkAPI (same shape as emergencyNetworkAPI, base path `/v2/delivery-network`). |
| New files only | All delivery logic: `routes/v2/delivery-network.js`, `services/delivery-network/*`, `frontend/.../delivery-dispatch/*`, `frontend/app/deliverydispatch/*`, migrations for `delivery_*` tables. |
| DB | New migrations only; no changes to existing emergency or business tables. |
| Admin (if operator under existing admin) | **Add** operator routes or page under existing admin auth (e.g. in `routes/v2/admin.js` or new admin sub-route). |

All other delivery behavior stays in the copied-and-altered delivery module (new files and new branches above). Emergency dispatch code and tables are not modified.

---

## 9. Execution guide for handoff

Use this section to execute the plan from scratch. Work in order; each step assumes the previous ones are done.

### 9.1 Exact files to copy (do not modify originals)

| Source | Destination |
|--------|-------------|
| `routes/v2/emergency-network.js` | `routes/v2/delivery-network.js` |
| `services/emergency-network/config.js` | `services/delivery-network/config.js` |
| `services/emergency-network/intake.js` | `services/delivery-network/intake.js` |
| `services/emergency-network/dispatch.js` | `services/delivery-network/dispatch.js` |
| `services/emergency-network/create-vapi-assistant.js` | `services/delivery-network/create-vapi-assistant.js` |
| `services/emergency-network/sms-intake.js` | `services/delivery-network/sms-intake.js` |
| `services/emergency-network/billing.js` | `services/delivery-network/billing.js` |
| `services/emergency-network/callback-lookup.js` | `services/delivery-network/callback-lookup.js` |
| `services/emergency-network/activity.js` | `services/delivery-network/activity.js` |
| `frontend/app/dashboard/v2/modules/emergency-dispatch/page.jsx` | `frontend/app/dashboard/v2/modules/delivery-dispatch/page.jsx` |
| `frontend/app/emergencydispatch/page.jsx` | `frontend/app/deliverydispatch/page.jsx` |
| `frontend/app/emergencydispatch/layout.jsx` | `frontend/app/deliverydispatch/layout.jsx` |

After copying, **alter only the destination files** (and add new branches in shared files per §8.3). Rename every reference from emergency → delivery (table names, function names, route paths, API base path, module key, log prefixes). Use §4 Naming and §5 Entities for table and column names.

### 9.2 Recommended implementation order

**Phase 1 (walking skeleton)**  
1. Copy all files in §9.1.  
2. Create and run **one initial migration** that creates all `delivery_*` tables and inserts the `delivery-dispatch` row into `modules`. Base table definitions on §5; allow `delivery_requests.business_id` NULL for individuals.  
3. Alter the new route file: change imports to delivery-network services; scope config/requests to per-business where needed (see §8.2); keep public routes (form, chat) before `router.use(authenticate)`; split global vs per-business config per §8.2.  
4. Alter each file in `services/delivery-network/`: rename emergency → delivery, swap table names to `delivery_*`, change domain (e.g. service request → delivery request, providers → broker/dispatch). Implement caller→business lookup in config (e.g. `getBusinessIdByCallerPhone(callerNumber)` reading `delivery_approved_numbers`).  
5. **VAPI:** In `routes/vapi.js`, in **handleAssistantRequest**: after the block that checks `isEmergency && emergencyId` (and returns the emergency assistant), **add** a block: if destination is a delivery line number (from delivery config), lookup caller in `delivery_approved_numbers` → get `business_id`, fetch delivery assistant, inject `business_id` (e.g. in metadata or system message), return assistant. In the **end-of-call-report** handler: after the existing emergency end-of-call block, **add**: if `assistantId === deliveryAssistantId`, parse transcript into delivery fields, resolve business_id (from call metadata or approval), create `delivery_requests` row (with reference number), then call delivery dispatch start (or enqueue payment for individuals in Phase 2).  
6. **Server and module wiring:** In `server.js`, mount delivery-network routes and add `deliveryNetwork` to the v2 health routes object. In `routes/v2/modules.js`, add `'delivery-dispatch'` to `FREE_MODULES` and to `moduleDashboards`. In `frontend/app/dashboard/v2/settings/modules/page.jsx`, add `'delivery-dispatch'` to the path maps for settings and dashboard.  
7. **Frontend:** In `frontend/lib/api.js`, add `deliveryNetworkAPI` (same methods as emergencyNetworkAPI, base path `/v2/delivery-network`). Alter the copied dashboard page and public page to use `deliveryNetworkAPI`, delivery wording, and delivery intake fields (§5, §7).  
8. **Dispatch (Phase 1):** Implement one broker (e.g. Shipday). Add a delivery dispatch service that: given a `delivery_request_id`, creates a job via the broker API (use env e.g. `DELIVERY_SHIPDAY_API_KEY` or similar); if the key is missing, stub with a no-op or mock “accepted” so the rest of the flow runs. Handle broker webhooks for status (e.g. assigned, completed) and update `delivery_requests` / `delivery_dispatch_log`.  
9. **Reference number:** Generate a short unique reference per request (e.g. 6–8 alphanumeric, or `DR-` + 6 chars), store in `delivery_requests.reference_number`, show in dashboard and in confirmation messages.  
10. Verify Phase 1 “Done when”: call from approved number → business resolved → request created with reference → job to broker → status in dashboard; unapproved caller gets approval flow; dashboard form creates request.

**Phase 2**  
Implement payment link for individuals (Stripe; email default, optional SMS with per-SMS charge), operator view (admin-only routes and UI), and cancellation (phone + address + date, reference when multiple; business vs individual paths per §8.1).

**Phase 3**  
Implement pricing engine, notifications, tracking, delivery confirmation (from broker), failed-delivery policy, multi-package, reports and invoices.

**Phase 4**  
Implement multi-broker (cheapest-first), delivery preferences, spending limits, billing schedule, saved locations and pickup flow, package rules, external API placeholder.

### 9.3 Key implementation details (avoid ambiguity)

- **Individual vs business at intake:** A request is **individual** when `business_id` is NULL (e.g. form/chat with no business context, or after approval flow denies). A request is **business** when the caller is approved (caller→business_id) or approval flow approved. For individuals, send payment link and dispatch only after payment (Phase 2).  
- **VAPI insertion points:** In `vapi.js`, search for `isEmergencyNumber` / `getEmergencyAssistantId` for the assistant-request flow; add the delivery branch **immediately after** the emergency block (before `let assistantId = existingAssistantId`). For end-of-call, search for `emergencyAssistantId` / end-of-call handling for emergency and add the delivery block **after** the emergency block.  
- **Global config write:** Global `delivery_network_config` (line numbers, assistant id) is written only via an admin-only endpoint or UI (e.g. under existing admin routes). Per-business config and approved numbers are written by authenticated business users via the delivery dashboard.  
- **Operator view:** New routes and UI for “escalated deliveries” and operator actions (retry, assign, cancel, message, override) must use the same admin auth as `routes/v2/admin.js` (or equivalent). Do not expose these to non-admin users. **Operator UI location:** Add the operator page under the existing admin area—e.g. frontend route `/dashboard/v2/admin/delivery-operator` (or `/admin/delivery-operator` if the app uses a different admin prefix), with backend routes under the same admin middleware (e.g. in `routes/v2/admin.js` or a sub-route loaded by it). One place for operators to list escalated deliveries and perform actions.  
- **Chatbot:** Reuse the same pattern as emergency: public intake endpoint (e.g. `POST /api/v2/delivery-network/public/intake/chat`), same conversational flow; frontend chat component on the delivery public page posts to that endpoint and uses delivery intake fields.

### 9.4 Environment variables (optional / as needed)

- Broker (Phase 1): e.g. `DELIVERY_SHIPDAY_API_KEY`, `DELIVERY_SHIPDAY_BASE_URL` (or read from DB per network).  
- No other delivery-specific env vars are required for MVP; global config (line numbers, assistant id) can live in `delivery_network_config` in the DB.

### 9.5 Broker integration contract (Phase 1 and multi-broker)

The delivery dispatch service talks to one or more brokers (e.g. Shipday) via HTTP. This contract defines what the implementation must do; broker-specific docs supply exact endpoints and payloads.

**Outbound (we call broker):**
- **Create delivery job** — Given a `delivery_request` (pickup address, delivery address, recipient, package info, etc.), POST to the broker’s “create delivery” or “create order” endpoint. Request body must include at least: pickup location, drop-off location, contact/phone, and any broker-required fields. Response must provide a **broker job id** (or order id) so we can track the job. Store this in `delivery_dispatch_log.broker_job_id` (or equivalent).
- **Cancel / update** — If the broker supports cancel or update, implement calls as needed for operator actions and cancellation.

**Inbound (broker calls us):**
- **Webhook URL** — Brokers send status updates to our backend. Use a dedicated route, e.g. `POST /api/v2/delivery-network/webhooks/:brokerId` (e.g. `webhooks/shipday`), so we can support multiple brokers. Do not put this behind business auth; use a shared secret, signature, or query token to verify the request is from the broker.
- **Payload** — We must receive at least: broker job id (or our delivery_request id if they echo it), and status (e.g. `assigned`, `picked_up`, `completed`, `failed`, `cancelled`). Map these to `delivery_requests.status` and optionally `delivery_dispatch_log.result`. If the broker sends proof (photo/signature URL), store or link it for the dashboard.
- **Idempotency** — Process each webhook event once (e.g. by broker event id or job id + status + timestamp).

Implementing one broker (e.g. Shipday) in Phase 1 means: implement create-job and one webhook handler for that broker; stub create-job if the API key is missing so the rest of the flow runs. In Phase 4, add more brokers and cheapest-first logic.

### 9.6 How to validate

**Phase 1**  
1. Run backend (e.g. `node server.js` or project start command) and frontend (e.g. `cd frontend && npm run dev`).  
2. Run the delivery migration; ensure no errors and `delivery_*` tables exist.  
3. In the app, sign in as a business user, activate the delivery-dispatch module (if gated), and open the delivery dashboard. Add at least one approved number (your test phone) for that business.  
4. Set global delivery config (via admin or DB): add a delivery line number and create/link the delivery VAPI assistant. Ensure that number is not used as an emergency number.  
5. Call the delivery line from the approved number (or use a stub that simulates assistant-request/end-of-call). Confirm a delivery request is created with a reference number and that the dashboard shows it. If dispatch is stubbed, confirm the request reaches “dispatched” or equivalent.  
6. Submit the public delivery form (or chat) with required fields. Confirm a request is created and appears in the dashboard (for the business you’re scoped to, or as individual if no business).  
7. Call from a number that is **not** approved. Confirm the AI/flow asks “Is this for a registered business?” and that an approval request can be created and shown to the business owner.

**Phase 2 (optional quick check)**  
8. As an individual (no business), create a request via form/chat; confirm a payment link is sent (email or SMS) and that after payment (or stub) dispatch runs.  
9. As admin, open the operator view at the chosen path (e.g. `/dashboard/v2/admin/delivery-operator`). Confirm escalated (or test) deliveries are listed and that operator actions (e.g. retry, cancel) are available and behind admin auth.  
10. Test cancellation via AI (phone + address + date; use reference number when multiple matches). Confirm the correct delivery is cancelled and status updated.

### 9.7 Checklist for another agent

- [ ] Copy every file in §9.1; do not modify any original emergency file.  
- [ ] Create migration for all `delivery_*` tables and `modules` row; run it.  
- [ ] Alter only the new delivery files and add only new branches in `vapi.js`, `server.js`, `modules.js`, frontend module settings, `api.js`.  
- [ ] Implement caller→business resolution (delivery line number + `delivery_approved_numbers`).  
- [ ] Implement delivery assistant-request and end-of-call-report branches in `vapi.js`.  
- [ ] Wire server mount, modules (FREE_MODULES, moduleDashboards), frontend paths, and deliveryNetworkAPI.  
- [ ] Scope dashboard data by `req.active_business_id`; global config read-only for businesses, write admin-only.  
- [ ] Add reference number to every delivery request; support business_id NULL for individuals.  
- [ ] Implement Phase 1 broker integration (one broker or stub); then Phase 2 (payment, operator, cancellation), Phase 3 (pricing, notifications, tracking, reporting), Phase 4 (multi-broker, limits, saved locations, package rules, API placeholder).  
- [ ] Resolve all items in §8 before considering the build complete.
- [ ] Implement broker per §9.5 (create job, webhook URL, status mapping); validate per §9.6.
