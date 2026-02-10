# Where to Find VAPI Call Logs

## Server Console Logs (Primary Location)

The main logs are in your **server console** where you run `npm start`. Look for:

1. **Webhook Events**: 
   ```
   [VAPI Webhook] Received event: call-start
   [VAPI Webhook] Received event: call-end
   ```

2. **Call Details**:
   - Call ID
   - Business ID
   - Caller number
   - Call duration
   - Transcript (if available)

3. **Errors**:
   - Any errors will be logged with `[VAPI Webhook] Error:` prefix

## VAPI Dashboard

1. Go to https://dashboard.vapi.ai
2. Navigate to **Calls** section
3. You'll see all calls with:
   - Call status
   - Duration
   - Transcript
   - Audio recording (if enabled)
   - Error messages

## Common Issues

### AI Says Greeting But Doesn't Respond

This usually means:
1. **Webhook not configured correctly** - Check that `serverUrl` in assistant config points to your server
2. **Webhook not receiving events** - Check server logs for incoming webhook requests
3. **Assistant not listening** - Check VAPI dashboard for call status
4. **Model configuration issue** - Check `maxTokens` and `temperature` settings

### To Debug:

1. **Check server logs** when you make a test call
2. **Check VAPI dashboard** for call status
3. **Verify webhook URL** is accessible (not localhost in production)
4. **Check assistant configuration** in VAPI dashboard

## Logging More Details

To see more detailed logs, the webhook handler logs:
- All incoming events
- Call session creation
- Business lookup
- Minutes checking
- Call summary retrieval

Look for these in your server console output.



















