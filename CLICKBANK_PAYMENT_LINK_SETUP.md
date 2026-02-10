# ClickBank Payment Link Setup

This guide explains how to find your ClickBank payment link (paylink) and add it to the sales page.

## What is a ClickBank Payment Link?

A ClickBank payment link (also called a "paylink") is the URL that customers use to purchase your product. When customers click this link, they're taken to ClickBank's secure checkout page to complete their purchase.

## How to Find Your ClickBank Payment Link

### Step 1: Log in to ClickBank

1. Go to https://accounts.clickbank.com
2. Log in with your vendor account credentials

### Step 2: Navigate to Your Product

1. Click **"Accounts"** in the left sidebar
2. Click **"Products"** from the main navigation
3. Find your **"Tavari AI Phone Agent"** product
4. Click on the product name to open it

### Step 3: Get Your Payment Link

Once you're on the product page, you'll see several options:

#### Option A: Standard Paylink (Recommended)

1. Look for the **"Paylinks"** or **"Payment Links"** section
2. You'll see a link in this format:
   ```
   https://[your-vendor-name].clickbank.net/c/[product-number]/[nickname]
   ```
   Example: `https://tavari.clickbank.net/c/123456/tavari-ai`

3. **Copy this URL** - this is your payment link

#### Option B: Custom Paylink

If you've created a custom paylink:
1. Go to **"Paylinks"** section
2. Find your custom paylink (it may have a custom domain or nickname)
3. Copy the URL

#### Option C: Hoplink (For Affiliates)

- **Hoplinks** are for affiliates, not direct sales
- Don't use hoplinks on the sales page - use the direct paylink instead

## Step 4: Add the Payment Link to Your Sales Page

### For Local Development

Add the payment link to your `.env.local` file in the `frontend` directory:

```bash
# ClickBank Payment Link
NEXT_PUBLIC_CLICKBANK_PAYLINK=https://your-vendor-name.clickbank.net/c/123456/tavari-ai
```

### For Production (Vercel)

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add a new environment variable:
   - **Name:** `NEXT_PUBLIC_CLICKBANK_PAYLINK`
   - **Value:** Your ClickBank payment link URL
   - **Environment:** Production (and Preview if you want)
4. Click **Save**
5. **Redeploy** your frontend for the changes to take effect

### For Production (Other Platforms)

Add the environment variable to your hosting platform:
- **Name:** `NEXT_PUBLIC_CLICKBANK_PAYLINK`
- **Value:** Your ClickBank payment link URL

## How It Works

Once the payment link is configured:

1. **Sales Page** (`/sales`) will show a **"Buy Now - $119/month →"** button
2. When customers click this button, they're taken to ClickBank's checkout
3. After purchase, ClickBank sends a webhook to your backend
4. Your backend automatically creates the customer account
5. Customer receives a welcome email with login credentials

## Testing the Payment Link

### Test Mode

1. In ClickBank, enable **Test Mode** for your product
2. Use the test payment link to make a test purchase
3. Verify that:
   - The checkout page loads correctly
   - You can complete a test purchase
   - Your webhook receives the notification
   - An account is created automatically

### Production

1. Disable test mode in ClickBank
2. Use the production payment link
3. Make a real purchase (or have someone test it)
4. Verify the full flow works end-to-end

## Troubleshooting

### Payment Link Not Showing on Sales Page

**Problem:** The "Buy Now" button doesn't appear, only "Get Started Now"

**Solution:**
1. Check that `NEXT_PUBLIC_CLICKBANK_PAYLINK` is set in your environment variables
2. Make sure the variable name is exactly `NEXT_PUBLIC_CLICKBANK_PAYLINK` (case-sensitive)
3. Restart your development server or redeploy your frontend
4. Clear your browser cache

### Payment Link Opens But Shows Error

**Problem:** Clicking the payment link shows an error page

**Solution:**
1. Verify the payment link URL is correct (no typos)
2. Check that your product is active in ClickBank
3. Ensure your product is approved (not in review)
4. Try the link in an incognito/private browser window

### Payment Link Format

**Common Formats:**
- Standard: `https://[vendor].clickbank.net/c/[product]/[nickname]`
- Custom: `https://[custom-domain]/[path]`
- With parameters: `https://[vendor].clickbank.net/c/[product]/[nickname]?[params]`

**Note:** The link should start with `https://` and be a complete URL.

## Security Notes

1. **Never commit the payment link to version control** - use environment variables
2. **Use HTTPS only** - ClickBank requires secure connections
3. **Test in test mode first** - Don't use production links for testing
4. **Monitor webhook logs** - Ensure purchases are being processed correctly

## Next Steps

After setting up the payment link:

1. ✅ Test the payment link in ClickBank test mode
2. ✅ Verify the sales page shows the "Buy Now" button
3. ✅ Make a test purchase and verify account creation
4. ✅ Check that welcome emails are being sent
5. ✅ Switch to production mode when ready

## Support

If you need help:
- **ClickBank Support:** https://support.clickbank.com
- **Tavari Support:** info@tanggo.ca

## Quick Reference

**Environment Variable:**
```
NEXT_PUBLIC_CLICKBANK_PAYLINK=https://your-vendor-name.clickbank.net/c/123456/tavari-ai
```

**Sales Page URL:**
```
https://tavarios.com/sales
```

**ClickBank Dashboard:**
```
https://accounts.clickbank.com
```









