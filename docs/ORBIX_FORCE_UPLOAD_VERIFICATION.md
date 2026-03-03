# Orbix Force Upload — Verification Checklist

This doc traces the full path from "Force Upload" in the UI to YouTube so you can verify it works.

---

## 1. Frontend sends `channel_id`

- **VideoDetailModal.jsx**: `uploadRenderToYoutube(item.render_id, apiParams())`
- **OrbixChannelContext**: `apiParams()` = `{ channel_id: currentChannelId }` when a channel is selected
- **api.js**: `POST /v2/orbix-network/renders/:id/upload-to-youtube` with `params` → query string `?channel_id=...`

**Check**: Force Upload is only available when a channel is selected; otherwise `channel_id` is missing and API returns 400.

---

## 2. Backend route (upload-to-youtube)

- **Route**: `POST /renders/:id/upload-to-youtube`
- **requireChannelId(req)**: reads `req.query.channel_id || req.body?.channel_id`, validates against `orbix_channels`, returns `channelId`
- **Render fetch**: `orbix_renders` + `orbix_stories!left(id, channel_id)` by `id` and `business_id` (no filter on story channel)
- **Channel check**: If story has a `channel_id` and it’s not the requested channel → 404. Otherwise allow (same channel or legacy).
- **Then**: If status isn’t `READY_FOR_UPLOAD`, await update to `READY_FOR_UPLOAD`
- **Then**: `processOneYouTubeUpload({ force: true, renderId: id, preferredChannelId: channelId })` (not awaited)

**Check**: Legacy renders (story `channel_id` null) are allowed and get the current UI channel as `preferredChannelId`.

---

## 3. processOneYouTubeUpload (orbix-network-jobs.js)

- **Options**: `force`, `renderId: targetRenderId`, `preferredChannelId`
- **When targetRenderId is set**: Fetch render with `render_status = 'READY_FOR_UPLOAD'`, `output_url` not null, `id = targetRenderId`. If not found, return `{ processed: false }`.
- **Then**: `_uploadRender(ready, force, preferredChannelId)` — `preferredChannelId` is passed through.

**Check**: Update to `READY_FOR_UPLOAD` is awaited in the route before this runs, so the fetch finds the render.

---

## 4. _uploadRender

- **force === true**: Skips auto-upload-enabled check
- **Claim**: Update render to `PROCESSING` where `render_status = 'READY_FOR_UPLOAD'` (atomic)
- **step8Options**: `preferredChannelId ? { preferredChannelId } : {}`
- **step8YouTubeUpload(claimedRender.id, claimedRender, videoUrl, step8Options)**

**Check**: `preferredChannelId` is in `step8Options` when coming from Force Upload.

---

## 5. step8YouTubeUpload (render-steps.js)

- Load render row (metadata, story_id)
- **orbixChannelId**: From `orbix_stories.channel_id` when `render.story_id` is set; else `null`
- **Legacy**: If `orbixChannelId == null && step8Options.preferredChannelId` → `orbixChannelId = step8Options.preferredChannelId`
- **publishVideo(businessId, renderId, step6VideoPath, metadata, { orbixChannelId })**

**Check**: For legacy renders, `orbixChannelId` is the channel from the request, so the correct channel’s YouTube is used.

---

## 6. publishVideo (youtube-publisher.js)

- **options.orbixChannelId** → passed to **getYouTubeClient(businessId, orbixChannelId)**

**Check**: Per-channel upload uses the same channel ID as the UI.

---

## 7. getYouTubeClient

- **byChannel[orbixChannelId]?.access_token** → use per-channel YouTube
- Else **settings.youtube?.access_token** → legacy
- Else → throw SKIP (clear message + SKIP_REASON log)
- **resolveOAuthCredentials(yt, env YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET)** → channel can have its own client_id/secret on `yt`

**Check**: For upload to work you need either:
- Env: `YOUTUBE_REDIRECT_URI`, `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, and (legacy or per-channel) tokens in module settings, or
- Per-channel: YouTube connected for that channel in Settings (and env redirect + global or channel-specific client id/secret).

---

## If upload is still skipped

Logs to look for:

1. **`[YouTube Publisher] SKIP_REASON: Missing YOUTUBE_REDIRECT_URI in .env`** → set in .env / Railway
2. **`[YouTube Publisher] SKIP_REASON: No OAuth client_id/secret (...)`** → set env or channel custom OAuth in Settings
3. **`[Orbix YouTube] Upload skipped for render id=... — reason: ...`** → reason is the exact skip cause
4. **`[Orbix Step 8] SKIP_REASON: ...`** → same reason + hint to check .env and channel YouTube connection

Ensure the channel you’re on in the UI has YouTube connected (Orbix Network → Settings → that channel → YouTube tab → Connect).
