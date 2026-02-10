# YouTube auto-posting setup (Orbix Network)

Completed renders are automatically published to YouTube when a channel is connected (Step 8 in the pipeline). This guide covers environment variables and Google Cloud setup.

## 1. Environment variables

Set these on your server (e.g. Railway, Vercel, or `.env`):

```bash
YOUTUBE_CLIENT_ID=your_google_oauth_client_id
YOUTUBE_CLIENT_SECRET=your_google_oauth_client_secret
YOUTUBE_REDIRECT_URI=https://your-domain.com/api/v2/orbix-network/youtube/callback
```

- **YOUTUBE_REDIRECT_URI** must match **exactly** the redirect URI configured in the Google Cloud Console (see below). Use `https` in production. For local dev use your API base URL (e.g. `http://localhost:5000/api/v2/orbix-network/youtube/callback`) and add that same URI in the Console.

## 2. Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project.
3. **Enable YouTube Data API v3**
   - APIs & Services → Library → search “YouTube Data API v3” → Enable.
4. **OAuth consent screen**
   - APIs & Services → OAuth consent screen.
   - Choose External (or Internal for workspace-only).
   - Fill App name, User support email, Developer contact.
   - Scopes: add `https://www.googleapis.com/auth/youtube.upload` and `https://www.googleapis.com/auth/youtube.readonly`.
   - Save.
5. **Credentials**
   - APIs & Services → Credentials → Create Credentials → OAuth client ID.
   - Application type: **Web application**.
   - Name: e.g. “Orbix YouTube”.
   - **Authorized redirect URIs**: add exactly:
     - Production: `https://your-domain.com/api/v2/orbix-network/youtube/callback`
     - Local: `http://localhost:YOUR_API_PORT/api/v2/orbix-network/youtube/callback` (if you test locally; use the port where your API runs).
   - Create and copy the **Client ID** and **Client secret** into `YOUTUBE_CLIENT_ID` and `YOUTUBE_CLIENT_SECRET`.

## 3. Connect YouTube in the app

1. Open **Orbix Network** in the dashboard.
2. Go to **Settings** (or complete **Setup** step 1).
3. Under **YouTube auto-posting**, click **Connect YouTube account**.
4. Sign in with Google and allow the requested YouTube permissions.
5. After redirect, the settings page will show “YouTube connected” and the channel name.

Once connected, every completed render (after Step 7) will run **Step 8: YouTube upload** and publish the video to your channel. Visibility (public/unlisted/private) is controlled by **Publishing Preferences → YouTube Visibility** in the same settings.

## 4. Troubleshooting

- **“YouTube OAuth not configured”**  
  Ensure `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, and `YOUTUBE_REDIRECT_URI` are set and the server was restarted after changing env.

- **Redirect URI mismatch**  
  The URI in `YOUTUBE_REDIRECT_URI` must match one of the “Authorized redirect URIs” in the OAuth client (including scheme and path). No trailing slash.

- **“YouTube not connected” when a render finishes**  
  Connect YouTube in Orbix Network → Settings (or Setup step 1). Ensure you’re in the correct organization/channel so the right business is selected.

- **Upload fails with 401 / token errors**  
  Tokens are refreshed automatically. If it persists, disconnect YouTube in Settings and connect again to get new tokens.
