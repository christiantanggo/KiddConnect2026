# Orbix YouTube upload – single source of truth

**Last updated:** When this file was added.  
**Purpose:** So we never again add automatic uploads that burn OAuth. Only these paths may upload to YouTube.

---

## 1. Automatic uploads (scheduled)

| Trigger | File:Line | When it runs |
|--------|-----------|---------------|
| **runPublishJob** | server.js ~785 | setInterval every 5 min. Only actually uploads when: inside posting window, inside an upload slot (e.g. 8am, 11am, 2pm, 5pm, 8pm), and channel under daily cap. |

There is **no** setInterval for `processOneYouTubeUpload` in server.js.  
There is **no** 30s (or any) YouTube upload job.

---

## 2. Manual uploads (user or API only)

| Trigger | File:Line | When |
|--------|-----------|------|
| **POST /renders/:id/upload-to-youtube** | routes/v2/orbix-network.js:682 | User clicks "Force upload" in dashboard. Calls processOneYouTubeUpload({ force: true, renderId, preferredChannelId }). |
| **POST /renders/:id/upload-youtube** (sync) | routes/v2/orbix-network.js:769 | Alternative sync upload endpoint; calls publishVideo directly. Used by? (If nothing, can remove.) |

---

## 3. Code that must NOT upload (verified removed)

- **runOneRenderThenUpload** – does NOT call processOneYouTubeUpload. Only processes one render; leaves READY_FOR_UPLOAD.
- **runRenderByIdThenUpload** – does NOT call processOneYouTubeUpload. Only runs render.
- **POST /jobs/automated-pipeline** – does NOT loop processOneYouTubeUpload. Only runAutomatedPipeline; uploads: 0.
- **POST /jobs/pipeline** – does NOT call runYouTubeUploadJob. Only runRenderJob.
- **scripts/orbix-render-worker.js** – does NOT call processOneYouTubeUpload after render.
- **server.js** – no setInterval for processOneYouTubeUpload or runYouTubeUploadJob. Only runPublishJob runs on a timer.

---

## 4. Never upload the same render twice (no 72x duplicates)

- Before any automatic upload we check: **orbix_publishes** must have NO row for this **render_id**. If there is any row (PENDING, PUBLISHED, FAILED), we skip that render for auto-upload. Only manual Force Upload can retry.
- In **runPublishJob** we insert a **PENDING** row as soon as we attempt upload (before calling YouTube). Then we update to PUBLISHED or FAILED. So even on timeout/crash we have a row and never auto-retry the same render.

## 5. Daily cap

- Count of uploads per channel per day = **orbix_publishes** (publish_status = 'PUBLISHED', posted_at today), not completed renders.
- Both processOneYouTubeUpload (when used) and runPublishJob use **getPublishCountByChannelToday** for the cap.

---

## 6. Two OAuth projects (separate quota for auto vs manual)

YouTube API quota is **per Google Cloud project**. To avoid both auto and manual uploads sharing one project’s 10k units/day:

- **Auto** (scheduled / pipeline): uses **only** the channel's Auto tab (Client ID + Secret + tokens). Never uses Manual tab or env for that channel.
- **Manual** (Force Upload): uses **only** the channel's Manual tab (Client ID + Secret + tokens). Never uses Auto tab or env for that channel.

If you set **YOUTUBE_MANUAL_CLIENT_ID** and **YOUTUBE_MANUAL_CLIENT_SECRET** in Railway/env, then:

1. The “Connect YouTube (manual)” auth URL uses the manual project, so manual tokens are for that project.
2. The callback uses the manual project’s client when exchanging the code for manual.
3. Force Upload uses the manual project’s client + tokens, so it consumes that project’s quota, not the auto project’s.

So: put Project A credentials in the Auto tab and connect; put Project B in the Manual tab. Each tab = one project = its own 10k/day. When using per-channel OAuth, YOUTUBE_REDIRECT_URI in env is optional for upload (a default is used for token refresh).

**If using env-only manual:** In the **manual** Google Cloud project, add the same redirect URI (e.g. `https://api.tavarios.com/api/v2/orbix-network/youtube/callback`) under Credentials → your OAuth 2.0 Client → Authorized redirect URIs. Then set `YOUTUBE_MANUAL_CLIENT_ID` and `YOUTUBE_MANUAL_CLIENT_SECRET` in Railway. Re-connect YouTube for the manual slot (Settings → Connect YouTube for “Force Upload”) so tokens are issued for the manual project.

---

## 7. How to verify (grep)

```bash
# Must show ZERO hits in server.js for processOneYouTubeUpload or youtubeUpload interval
grep -n "processOneYouTubeUpload\|youtubeUpload\|runYouTubeUploadJob" server.js

# All callers of processOneYouTubeUpload (should only be upload-to-youtube route and runYouTubeUploadJob definition)
grep -rn "processOneYouTubeUpload" --include="*.js" .
```

If anyone adds a new automatic upload path, add it to section 1 and document it here. If you see an upload path not listed here, it should be removed.

