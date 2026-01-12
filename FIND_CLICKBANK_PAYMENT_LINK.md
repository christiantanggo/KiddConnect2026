# How to Find Your ClickBank Payment Link

This is a step-by-step guide to find your ClickBank payment link (paylink) in your ClickBank dashboard.

## Method 1: Build It Manually (Most Reliable)

If you can't find a direct link on the product page, you can build it manually using this format:

### Payment Link Format:
```
https://[VENDOR_ID].pay.clickbank.net/?cbitems=[ITEM_NUMBER]
```

### How to Find Your Vendor ID and Item Number:

**From the Product List Page:**
1. Look at the **Item Number** column (you'll see a number like `1`, `2`, etc.)
2. Your **Vendor ID** is in the URL: `https://[vendor-id].accounts.clickbank.com`
   - Example: If URL is `https://tavarios.accounts.clickbank.com`, your Vendor ID is `tavarios`

**Example:**
- Vendor ID: `tavarios`
- Item Number: `1`
- Payment Link: `https://tavarios.pay.clickbank.net/?cbitems=1`

---

## Method 2: Find the Generated Payment Link in ClickBank

ClickBank does generate and display the payment link - here's where to find it:

### Step 1: Open Your Product Page
1. Go to **Accounts → Products**
2. Click on **"Tavari AI Phone Agent"** to open the product editor

### Step 2: Check the "Order Form" Tab
1. On the product page, look for tabs at the top:
   - **"Product"** tab
   - **"Pricing"** tab
   - **"Order Form"** tab ← **CHECK THIS ONE FIRST**
   - **"Settings"** tab
   - **"Images"** tab

2. Click on the **"Order Form"** tab
3. Look for:
   - **"Order Form URL"** field
   - **"Product URL"** field
   - **"Payment Link"** field
   - A generated URL displayed in a box or text field

### Step 3: Check the "Product" Tab
1. Click on the **"Product"** tab
2. Scroll down and look for:
   - **"Product URL"** section
   - **"Order Form URL"** section
   - **"Paylink"** section
   - A URL displayed near the bottom of the form

### Step 4: Check "My Order Form" Section
1. In the left sidebar, under **Vendor Settings**, click **"My Order Form"**
2. Look for your product's order form
3. The payment link/URL should be displayed there

### Step 5: Check Product Status
**Important:** The payment link may only appear after:
- Product is **approved** (not "Action Required")
- Order form is **configured**
- Product is **active**

If you see "Action Required" status:
1. Click the **"Action Required"** button
2. Complete any missing information
3. Submit for approval
4. Once approved, the payment link should appear

### Step 6: Look for a "Copy Link" or "Get Paylink" Button
Some ClickBank interfaces have:
- A **"Copy Paylink"** button
- A **"Get Payment Link"** button
- A **"Generate Link"** button
- Click these to reveal or copy the payment link

---

## Method 2: From Vendor Settings

### Step 1: Log in to ClickBank
1. Go to **https://accounts.clickbank.com**
2. Log in with your credentials

### Step 2: Go to Vendor Settings
1. Click **"Accounts"** in the left sidebar
2. Click **"My Site"** from the main navigation
3. Or go directly to: **https://accounts.clickbank.com/master/vendorSettings.html**

### Step 3: Find Your Vendor ID
1. Look for **"Account Nickname"** or **"Vendor ID"**
2. This is the first part of your payment link
3. Write it down (e.g., `tavari` or `yourname`)

### Step 4: Get Your Product ID
1. Go back to **Accounts → Products**
2. Find your product
3. Look for the **"Item Number"** or **"Product ID"** (usually a number like `1`, `2`, `123456`, etc.)
4. Write it down

### Step 5: Construct Your Payment Link
Use this format:
```
https://[VENDOR_ID].pay.clickbank.net/?cbitems=[ITEM_NUMBER]
```

**Example:**
- Vendor ID: `tavari`
- Item Number: `1`
- Payment Link: `https://tavari.pay.clickbank.net/?cbitems=1`

---

## Method 3: From the Marketplace (If Product is Listed)

### Step 1: Go to Marketplace
1. Log in to ClickBank
2. Click **"Marketplace"** in the left sidebar

### Step 2: Find Your Product
1. Search for your product name
2. Click on it to view the product page

### Step 3: Get the Paylink
1. On the product page, look for **"Paylink"** or **"Order Now"** button
2. Right-click the button and select **"Copy Link Address"**
3. This is your payment link

---

## What Your Payment Link Should Look Like

### Format 1: Standard Paylink
```
https://[vendor-name].clickbank.net/c/[product-number]/[nickname]
```
Example: `https://tavari.clickbank.net/c/123456/tavari-ai`

### Format 2: Pay ClickBank Format
```
https://[vendor-id].pay.clickbank.net/?cbitems=[item-number]
```
Example: `https://tavari.pay.clickbank.net/?cbitems=1`

### Format 3: Custom Paylink
```
https://[custom-domain]/[path]
```
Example: `https://buy.tavari.com/order`

---

## Important Notes

### ✅ DO Use:
- **Direct payment links** (paylinks)
- Links that go directly to checkout
- Links that start with `https://`

### ❌ DON'T Use:
- **Hoplinks** (these are for affiliates, not direct sales)
- **Affiliate links** (these track affiliate commissions)
- Links that include `?hop=` parameter (these are affiliate links)

### How to Tell the Difference:
- **Payment Link (Paylink):** Direct checkout, no affiliate tracking
- **Hoplink (Affiliate Link):** Includes `?hop=` parameter, tracks affiliate commissions

---

## Quick Checklist

Before using your payment link, verify:

- [ ] Link starts with `https://`
- [ ] Link doesn't contain `?hop=` (that's an affiliate link)
- [ ] Link goes directly to checkout when clicked
- [ ] Product is active and approved in ClickBank
- [ ] Product pricing is set correctly ($119/month)

---

## Testing Your Payment Link

### Test Mode
1. In ClickBank, enable **Test Mode** for your product
2. Use the test payment link
3. Make a test purchase
4. Verify the webhook is received

### Production
1. Disable test mode
2. Use the production payment link
3. Test with a real purchase (or have someone test it)

---

## Troubleshooting

### "I can't find the payment link"
- Make sure your product is **created** and **active**
- Check that you're looking in the right section (Products page)
- Try Method 2 to construct it manually

### "The link doesn't work"
- Verify the link is correct (no typos)
- Check that your product is **approved** (not in review)
- Ensure your product is **active** (not paused)
- Try the link in an incognito/private browser window

### "I see multiple links"
- Use the **direct payment link** (paylink), not hoplinks
- The paylink is usually the shortest URL
- Avoid links with `?hop=` parameter

---

## Still Need Help?

### ClickBank Support
- **Support Center:** https://support.clickbank.com
- **Live Chat:** Available in your ClickBank dashboard
- **Email:** support@clickbank.com

### Common Questions
- **Q: Where is my Vendor ID?**  
  A: Go to Accounts → My Site → Look for "Account Nickname"

- **Q: Where is my Product ID?**  
  A: Go to Accounts → Products → Click your product → Look for "Item Number"

- **Q: Can I use an affiliate link?**  
  A: No, use the direct payment link (paylink) for the sales page

---

## Next Steps

Once you have your payment link:

1. ✅ Copy the URL
2. ✅ Add it to your environment variable: `NEXT_PUBLIC_CLICKBANK_PAYLINK`
3. ✅ Test it in test mode first
4. ✅ Verify it works on your sales page
5. ✅ Switch to production when ready

---

## Quick Reference

**ClickBank Login:** https://accounts.clickbank.com  
**Products Page:** https://accounts.clickbank.com/account/products  
**Vendor Settings:** https://accounts.clickbank.com/master/vendorSettings.html  
**Support:** https://support.clickbank.com

