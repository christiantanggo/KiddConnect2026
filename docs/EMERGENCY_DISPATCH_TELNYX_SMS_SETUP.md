# Emergency Dispatch: Telnyx SMS Intake Setup

This guide explains how to get **SMS intake** working for Emergency Dispatch using Telnyx. When someone texts your emergency number, a service request is created and dispatch (calling providers) starts automatically.

## Overview

1. **Telnyx** delivers inbound SMS to your backend via a webhook.
2. Your backend receives all inbound SMS at the **same** webhook used for bulk SMS (opt-out, etc.).
3. If the **destination** number is one of your **Emergency phone numbers** (configured in the dashboard), the app creates an emergency service request and starts dispatch. Other numbers continue to use the normal flow (opt-out, business lookup, etc.).

## Prerequisites

- A Telnyx account with at least one phone number.
- The number you want to use for emergency SMS must be able to receive SMS (e.g. a number on a **Messaging Profile** that supports inbound SMS).

---

## Step 1: Configure the Telnyx webhook (inbound SMS)

Inbound SMS are received at:

```
https://api.tavarios.com/api/bulk-sms/webhook
```

(Use your real backend URL if different, e.g. `https://your-app.railway.app/api/bulk-sms/webhook`.)

### In Telnyx Portal

1. Go to [Telnyx Portal](https://portal.telnyx.com) → **Messaging** → **Messaging Profiles**.
2. Open the **Messaging Profile** that has (or will have) your emergency phone number(s).
3. In **Inbound Settings**, set **Webhook URL** to:
   ```
   https://api.tavarios.com/api/bulk-sms/webhook
   ```
4. Save the profile.

All numbers assigned to this profile will send their inbound SMS to this URL. If you use one profile for both regular SMS and emergency, that’s fine: the app decides what to do based on the **destination** number of each message.

---

## Step 2: Assign your emergency number to that profile

1. In Telnyx: **Phone Numbers** → select the number you want for emergency dispatch.
2. Ensure its **Messaging** setting uses the profile you configured in Step 1 (so it can receive SMS and send them to your webhook).
3. Note the number in E.164 format (e.g. `+15551234567`).

---

## Step 3: Add the number in the Emergency Dispatch dashboard

1. In your app: go to **Emergency Dispatch** → **Settings** → **Communication Settings** (or the tab where **Emergency phone numbers** are configured).
2. Add the same number (e.g. `+1 555-123-4567` or `+15551234567`) to **Emergency phone numbers**.
3. Save.

The app compares the **destination** of each inbound SMS to this list (normalized to E.164). If it matches, the message is treated as an emergency SMS and a service request is created and dispatched.

---

## Step 4: Environment variable (for sending SMS)

The backend needs `TELNYX_API_KEY` to **send** SMS (e.g. provider notifications, customer callback, opt-out confirmations). Receiving SMS only needs the webhook; no API key is required for that.

- In your backend env (e.g. Railway): set `TELNYX_API_KEY` to your Telnyx API key (from **Telnyx Portal** → **Auth** → **API Keys**).

---

## Step 5: Verify

1. Send an SMS **to** your emergency number from your mobile (e.g. “Need a plumber asap”).
2. Check backend logs for something like:
   ```
   [BulkSMS Webhook] Emergency Network: service request created from SMS from +1... dispatch started
   ```
3. In the dashboard: **Emergency Dispatch** → **Recent messages**. You should see a new request with **intake_channel** = `sms` and dispatch running (providers contacted).

---

## Flow summary

| Step | Where | What |
|------|--------|------|
| 1 | Telnyx | Inbound SMS to your number → Telnyx sends POST to your webhook URL. |
| 2 | Your backend | `POST /api/bulk-sms/webhook` receives the event. |
| 3 | Your backend | If `to` number is in **Emergency phone numbers** → create service request + `startDispatch(request.id)`. |
| 4 | Dashboard | Request appears under **Recent messages**; providers are called as with form/phone intake. |

---

## Same number for voice and SMS

If the emergency number is used for **both** voice (VAPI) and SMS:

- **Voice**: Telnyx (or your carrier) forwards the call to VAPI; VAPI webhook handles the call and creates the request.
- **SMS**: Telnyx sends inbound SMS to the **Messaging Profile** webhook → `https://api.tavarios.com/api/bulk-sms/webhook`.

So the number can be:

- In **Telnyx** for voice (call forwarding to VAPI) and for SMS (messaging profile with webhook).
- In **Emergency phone numbers** in the dashboard (so both voice and SMS intake are treated as emergency and dispatch runs).

Ensure the number is on a **Messaging Profile** that has the webhook URL set; otherwise inbound SMS will not reach your app.

---

## Troubleshooting

- **SMS not creating a request**
  - Confirm the **destination** number of the SMS (the “to” number) is exactly one of the numbers in **Emergency phone numbers** (format is normalized; +1/space/dash variations are fine).
  - Check backend logs for `[BulkSMS Webhook]` and `Emergency Network` to see if the webhook is hit and whether the number is treated as emergency.

- **Webhook not receiving SMS**
  - In Telnyx: Messaging → Messaging Profiles → your profile → **Webhook URL** must be the URL above and the profile must be the one used by your number for messaging.
  - Test the URL in a browser: `GET https://api.tavarios.com/api/bulk-sms/webhook` (or your backend) should return 200 (description of the endpoint).

- **Request created but no provider calls**
  - Ensure you have at least one **Emergency Service** (provider) in the directory for the relevant trade (SMS requests default to “Other”; you can assign providers in the dashboard).
  - Check logs for `startDispatch` or dispatch errors.

---

## Reference

- **Webhook URL**: `https://api.tavarios.com/api/bulk-sms/webhook` (or your backend base URL + `/api/bulk-sms/webhook`).
- **Emergency numbers**: Configured in **Emergency Dispatch** → **Settings** → **Emergency phone numbers**.
- **Telnyx webhook docs**: [Telnyx Messaging Webhooks](https://developers.telnyx.com/docs/messaging).
- **Existing Telnyx webhook guide** (opt-out, same URL): `TELNYX_WEBHOOK_SETUP.md`.
