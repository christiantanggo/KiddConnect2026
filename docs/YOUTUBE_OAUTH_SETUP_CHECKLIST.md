# YouTube OAuth setup – full checklist (do every step, in order)

Use this **every time** you add a new YouTube-connected channel (main app or per-channel). Do not skip steps.

---

## Part 1: Google Cloud (one-time per OAuth client / project)

### 1.1 Create or select project

- Go to [Google Cloud Console](https://console.cloud.google.com/).
- Use one project for the **main** Orbix YouTube app, or a **separate project** per channel (e.g. “orbix-riddles” for the Riddle channel).
- Select that project in the top bar.

### 1.2 Enable YouTube Data API v3 (required – connection will fail without this)

- Left sidebar: **APIs & Services** → **Library**.
- Search: **YouTube Data API v3**.
- Open it → click **Enable**.
- Wait until it shows “API enabled”.

### 1.3 OAuth consent screen and publishing status

- **OAuth consent screen:** Left sidebar: **APIs & Services** → **OAuth consent screen**. If not set up: choose **External** (or Internal for Workspace), fill App name and support email, save.
- **Make the app live (so any Google user can sign in):** Go to **Audience** — [Google Auth Platform → Audience](https://console.developers.google.com/auth/audience) (or in Cloud Console: **APIs & Services** → **OAuth consent screen**, then open the **Audience** tab/section). Set **Publishing status** to **In production** and click **Publish app**. Until you do this, only **Test users** (added on the same Audience page) can sign in; everyone else sees “Access blocked… has not completed the Google verification process”.
- If you leave it in **Testing**, add your Google account(s) as **Test users** on the **Audience** page.

### 1.4 Create OAuth 2.0 Client ID

- Left sidebar: **APIs & Services** → **Credentials**.
- **+ Create Credentials** → **OAuth client ID**.
- Application type: **Web application**.
- Name it (e.g. “Orbix main” or “Orbix Riddle”).
- **Authorized redirect URIs** – add **exactly** one of these (no trailing slash, no typo):
  - **Main app (global env):**  
    `https://api.tavarios.com/api/v2/orbix-network/youtube/callback`
  - **Per-channel (Custom OAuth in app — Riddle, Trick Question, etc.):**  
    `https://api.tavarios.com/api/v2/riddle/youtube/callback`
- For local dev only, you can also add:  
  `http://localhost:5001/api/v2/orbix-network/youtube/callback` or  
  `http://localhost:5001/api/v2/riddle/youtube/callback` as appropriate.
- Click **Create**. Copy the **Client ID** and **Client secret** (you’ll need them below).

---

## Part 2: Backend / env (production)

### 2.1 Main Orbix YouTube (used when a channel has no Custom OAuth)

- In Railway (or your backend env), set:
  - `YOUTUBE_CLIENT_ID` = Client ID from the **main** OAuth client (the one with `/orbix-network/youtube/callback`).
  - `YOUTUBE_CLIENT_SECRET` = that client’s secret.
  - `YOUTUBE_REDIRECT_URI` = `https://api.tavarios.com/api/v2/orbix-network/youtube/callback`
- Redeploy so env is applied.

### 2.2 Per-channel (Riddle, Trick Question, etc.) – Custom OAuth in the app

- In the channel’s Orbix Settings, under **Custom OAuth**, paste the **Client ID** and **Client secret** from the OAuth client that has **`https://api.tavarios.com/api/v2/riddle/youtube/callback`** as its redirect URI.
- Save. That Google Cloud project **must** have YouTube Data API v3 enabled and that redirect URI in the client (Part 1). The path says “riddle” but it is used for all per-channel OAuth (Riddle, Trick Question, etc.).

---

## Part 3: Connect in the app

1. Go to **Orbix Network** → channel → **Settings** → **YouTube**.
2. Optional: click **“Show redirect URI (for Google Cloud)”** and confirm the shown URI matches what you put in Google (step 1.4).
3. Click **“Connect YouTube account”** (or **“Clear YouTube and reconnect”** if you’ve already authorized before and it’s stuck).
4. Complete the Google consent flow.
5. You should land back on settings with “YouTube connected successfully”.

---

## If it still fails

- **redirect_uri_mismatch / invalid_grant:** The redirect URI in Google (Credentials → that OAuth client) must match **character-for-character** what the app uses. Use “Show redirect URI” and copy that exact value into Google.
- **access_denied / “Access blocked… has not completed the Google verification process”:** In Google Cloud, go to **Audience** ([Auth Platform → Audience](https://console.developers.google.com/auth/audience)). Either set **Publishing status** to **In production** and click **Publish app**, or add your Google account as a **Test user**.
- **Nothing happens / 401:** You must be logged in; session cookie is sent to the API. Try in an incognito window logged into the app.
- **Backend logs:** In Railway, search for `[Orbix auth-url]` and `[YouTube Callback]` or `[Riddle YouTube Callback]` to see which redirect_uri is used and any token error.

---

## Quick reference: which redirect URI for which channel

| Channel setup | Redirect URI in Google |
|---------------|------------------------|
| No Custom OAuth (uses global env) | `https://api.tavarios.com/api/v2/orbix-network/youtube/callback` |
| Custom OAuth (Riddle, Trick Question, etc.) | `https://api.tavarios.com/api/v2/riddle/youtube/callback` |

The OAuth client in Google (Client ID/Secret) and the redirect URI must all belong to the **same** client; and that client’s project must have **YouTube Data API v3** enabled.
