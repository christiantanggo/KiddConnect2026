# Deploy Sales Page to Vercel

Quick guide to deploy the sales page to Vercel.

## Current Status

✅ Sales page created at `/sales`  
✅ ClickBank payment link support added (ready for when you get the link)  
⏳ Waiting for ClickBank payment link from ClickBank support

## Deployment Steps

### Step 1: Deploy to Vercel

From the project root directory:

```bash
# Make sure you're logged in
vercel login

# Deploy to production
vercel --prod
```

Or if you haven't linked the project yet:

```bash
# Link project (first time only)
vercel link

# Follow prompts:
# - Create new project? Yes
# - Project name: tavari-frontend
# - Directory: ./frontend
# - Override settings? Yes

# Deploy
vercel --prod
```

### Step 2: Set Environment Variables

Go to [Vercel Dashboard](https://vercel.com/dashboard) → Your Project → Settings → Environment Variables

**Required:**
- `NEXT_PUBLIC_API_URL` = `https://api.tavarios.com`

**Optional (add when you get ClickBank link):**
- `NEXT_PUBLIC_CLICKBANK_PAYLINK` = `[your-clickbank-payment-link]`

### Step 3: Verify Deployment

1. Visit your Vercel deployment URL (e.g., `https://tavari-frontend.vercel.app`)
2. Test the sales page: `https://your-vercel-url.vercel.app/sales`
3. Verify:
   - ✅ Page loads correctly
   - ✅ "Get Started Now" button works (links to `/signup`)
   - ✅ "Try Free Demo" button works
   - ⏳ "Buy Now" button will appear once ClickBank link is added

### Step 4: Configure Custom Domain (if needed)

1. Vercel Dashboard → Your Project → Settings → Domains
2. Add domain: `tavarios.com` and `www.tavarios.com`
3. Follow DNS instructions from Vercel
4. Update DNS records in your domain provider (Porkbun)

## Adding ClickBank Payment Link (After You Get It)

Once ClickBank support provides your payment link:

### Option 1: Via Vercel Dashboard (Recommended)

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Click **"Add New"**
3. Name: `NEXT_PUBLIC_CLICKBANK_PAYLINK`
4. Value: `[paste your ClickBank payment link here]`
5. Environment: **Production** (and Preview if you want)
6. Click **"Save"**
7. **Redeploy** your site:
   ```bash
   vercel --prod
   ```
   Or trigger a redeploy from Vercel Dashboard → Deployments → Redeploy

### Option 2: Via Command Line

```bash
# Add environment variable
vercel env add NEXT_PUBLIC_CLICKBANK_PAYLINK production

# When prompted, paste your ClickBank payment link
# Then redeploy
vercel --prod
```

### Verify It Works

After adding the link and redeploying:

1. Visit `https://tavarios.com/sales` (or your Vercel URL)
2. You should now see **"Buy Now - $119/month →"** buttons
3. Clicking them should take you to ClickBank checkout

## Current Behavior (Without ClickBank Link)

Right now, the sales page will show:
- ✅ "Get Started Now →" button (links to `/signup`)
- ✅ "Try Free Demo" button
- ❌ "Buy Now" button (will appear once ClickBank link is added)

This is fine for now - the page is fully functional, just using the signup flow instead of direct ClickBank checkout.

## Testing Checklist

After deployment:

- [ ] Sales page loads at `/sales`
- [ ] All buttons work
- [ ] Images load correctly
- [ ] Mobile responsive
- [ ] Demo modal works
- [ ] Pricing modal works
- [ ] Navigation links work
- [ ] Footer links work

## Next Steps

1. ✅ Deploy to Vercel (do this now)
2. ⏳ Get ClickBank payment link from ClickBank support
3. ⏳ Add payment link to environment variables
4. ⏳ Redeploy
5. ⏳ Test ClickBank checkout flow
6. ⏳ Update ClickBank with sales page URL: `https://tavarios.com/sales`

## Quick Commands Reference

```bash
# Deploy to production
vercel --prod

# Deploy to preview (for testing)
vercel

# View logs
vercel logs

# List environment variables
vercel env ls

# Add environment variable
vercel env add NEXT_PUBLIC_CLICKBANK_PAYLINK production
```

## Support

If deployment fails:
- Check Vercel dashboard for error logs
- Verify `vercel.json` exists in project root
- Make sure you're in the project root directory
- Check that `frontend/package.json` exists






