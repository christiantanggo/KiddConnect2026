# Deploy frontend to Vercel (so you can work without local crashes)

## Option A: Connect GitHub to Vercel (recommended)

1. Go to [vercel.com](https://vercel.com) and sign in (GitHub).
2. **Add New Project** → Import your repo (e.g. `Tavari-Communications-App`).
3. Vercel will detect the config. Confirm:
   - **Root Directory:** `frontend` (set to `frontend`).
   - **Framework:** Next.js.
4. **Environment Variables:** Add:
   - `NEXT_PUBLIC_API_URL` = your backend URL (e.g. `https://api.kiddconnect.com` or your Railway URL).
5. Click **Deploy**. Future pushes to `main` will auto-deploy.

## Option B: Deploy from your machine (CLI)

From the **project root** (where `vercel.json` is):

```bash
npx vercel login
npx vercel link
npx vercel env add NEXT_PUBLIC_API_URL production
```
When prompted for the value, enter your backend URL (e.g. `https://api.kiddconnect.com`).

Then:

```bash
npx vercel --prod
```

---

**Note:** Only the **frontend** (Next.js) runs on Vercel. The **backend** (Express/API) must stay on Railway or another host; set `NEXT_PUBLIC_API_URL` to that URL so the site can call the API.

---

## If deployment doesn't work

- **Using GitHub Action (`.github/workflows/deploy-frontend.yml`):**  
  The workflow needs repo secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.  
  Get them from [Vercel Dashboard](https://vercel.com) → your project → Settings → General (Org ID, Project ID) and create a token at [vercel.com/account/tokens](https://vercel.com/account/tokens). Add all three under repo **Settings → Secrets and variables → Actions**. Then run the workflow again (Actions tab → "Deploy Frontend to Vercel" → "Run workflow").

- **Using Vercel Git (Option A):**  
  In the Vercel project, **Settings → General** must have **Root Directory** set to `frontend` (and "Include source files outside of the Root Directory" off). Add env var `NEXT_PUBLIC_API_URL` for production. Redeploy from the Vercel dashboard or push to `main` again.
