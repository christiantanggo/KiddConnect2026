# Phone Assistant "Could Not Be Reached" – Troubleshooting

When callers hear that the number "could not be reached" (or similar), the call is failing before or as VAPI tries to connect. Use these checks in order.

## 1. Verify phone number is linked to the assistant in VAPI

**Most common cause:** The VAPI phone number has no assistant linked, so incoming calls are not answered.

- **Quick check (API):**  
  `GET https://<your-backend>/api/vapi/webhook/phone-check`  
  Response should show the phone number and that it is linked to an assistant. If it says "Phone number is NOT linked to assistant", fix that first.

- **Fix:** Link the assistant to the number:
  - Use your app’s “Assign phone number” / provisioning flow so the backend calls `linkAssistantToNumber(assistantId, phoneNumberId)`.
  - Or use the VAPI dashboard: Phone Numbers → select the number → set **Assistant** to the correct assistant.
  - Or call your backend endpoint that links assistant to number (e.g. `POST /api/business/phone-numbers/link` or admin equivalent).

## 2. Verify webhook URL is correct and reachable

VAPI must be able to reach your server. If the webhook URL is wrong or the server is down, calls can fail.

- **Expected webhook URL:**  
  `https://<BACKEND_URL>/api/vapi/webhook`  
  where `BACKEND_URL` is your real public backend (e.g. `api.tavarios.com` or your Railway domain).

- **Checks:**
  - `GET https://<your-backend>/api/vapi/webhook`  
    Should return JSON with `status: "✅ Webhook endpoint is accessible"` and the same `webhookUrl` you expect.
  - `GET https://<your-backend>/api/vapi/webhook/env-check`  
    Confirms env vars (e.g. `BACKEND_URL`, `VAPI_API_KEY`) are set. If they show "NOT SET", set them and **restart the server**.

- **Environment:**  
  In Railway (or your host), set `BACKEND_URL` (or the fallback your app uses, e.g. `RAILWAY_PUBLIC_DOMAIN`) to the **public** URL of the backend (with `https://`). Restart after changing.

## 3. Verify assistant webhook config in VAPI

The assistant in VAPI must have the same webhook URL and `serverMessages` so events (and, if used, `assistant-request`) work.

- **Detailed check:**  
  `GET https://<your-backend>/api/vapi/webhook/diagnostic`  
  Look for assistants with status "✅ Correctly configured". If you see "webhook URL mismatch" or "serverMessages missing", fix in VAPI or via your rebuild endpoint.

- **Fix:**  
  Rebuild/update the assistant so `serverUrl` is your `https://<BACKEND_URL>/api/vapi/webhook` and `serverMessages` includes at least `status-update` and `end-of-call-report`. Your app may expose something like `POST /api/diagnostics/rebuild-assistant` for this.

## 4. Run full VAPI setup verification

From the project root (with `.env` or env vars set):

```bash
node scripts/verify-vapi-setup.js
```

This checks assistants, phone numbers, and that numbers are linked to assistants. Fix any reported issues.

## 5. Check server logs when you call

When you place a test call, the backend should log something like:

- `INBOUND WEBHOOK HIT`
- `Event Type: status-update` or `call-start`

If you see **no** webhook logs when the call is placed, VAPI is not reaching your server (wrong URL, server down, or firewall). If you see webhook logs but the caller still gets "could not be reached", the problem may be on VAPI’s side (e.g. number not linked, or timeout); check the VAPI dashboard **Calls** and logs there.

## 6. assistant-request (dynamic assistant selection)

If the **phone number** in VAPI has **Assistant** set to “None” (or `assistantId: null`) and a **Server URL** set, VAPI sends an `assistant-request` to your webhook. Your server must respond with an assistant config (and within ~7.5 seconds) or the call can fail.

- The webhook now handles `assistant-request`: it resolves the assistant (e.g. by called phone number) and returns the assistant config.
- Ensure your backend is fast and reachable so this response is sent in time.

## Summary checklist

- [ ] Phone number in VAPI is **linked** to the correct assistant.
- [ ] `BACKEND_URL` (or equivalent) is set to the **public** backend URL and server was restarted.
- [ ] `GET /api/vapi/webhook` returns 200 and the correct `webhookUrl`.
- [ ] Assistant in VAPI has `serverUrl` = that webhook URL and `serverMessages` set.
- [ ] Test call produces webhook logs on your server; if not, fix URL/reachability first.
