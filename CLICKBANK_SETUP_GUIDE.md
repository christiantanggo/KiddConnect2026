# ClickBank Setup Guide for Tavari

This guide walks you through setting up your Tavari product on ClickBank.

## ✅ Already Completed

- ✅ Customer Support Page created at `/support`
- ✅ Support email: `info@tanggo.ca`
- ✅ Support page includes contact form, FAQs, and contact information

## Step 1: Configure ClickBank Vendor Account

### 1.1 Access Vendor Settings

1. Log in to your ClickBank account: https://accounts.clickbank.com
2. Navigate to: **Vendor Settings** → **My Site**

### 1.2 Customer Support Information

Fill in the following information:

**Customer Support Website:**
```
https://tavarios.com/support
```

**Customer Support Email:**
```
info@tanggo.ca
```

**Customer Support Phone (Optional):**
```
[Your support phone number if you have one]
```

**Click "Save" to update your vendor information.**

## Step 2: Product Setup in ClickBank

### 2.1 Create Your Product

1. Navigate to: **Accounts** → **Products**
2. Click **"Create Product"**
3. Fill in product details:
   - **Product Name:** Tavari AI Phone Agent
   - **Description:** [Your product description]
   - **Category:** Software / Business Tools
   - **Product Type:** Digital Product (Recurring Subscription)

### 2.2 Pricing Setup

1. Set your product price(s)
2. Configure billing:
   - **Initial Price:** Your signup price (if any)
   - **Rebill Price:** Your monthly subscription price
   - **Rebill Interval:** Monthly

### 2.3 Product URL

Set your product URL to:
```
https://tavarios.com
```

## Step 3: Payment Integration (Optional)

Currently, Tavari uses **Stripe** for payments. You have two options:

### Option A: Keep Using Stripe (Recommended for now)
- ✅ Already implemented and working
- ✅ Stripe handles subscriptions, webhooks, and billing
- ✅ No additional integration needed

### Option B: Integrate ClickBank Payments
If you want to use ClickBank for payments instead of (or in addition to) Stripe, you'll need to:

1. **Set up ClickBank API/webhooks:**
   - Receive ClickBank order notifications
   - Handle subscription renewals
   - Process refunds/cancellations

2. **Modify the billing flow:**
   - Update checkout to use ClickBank
   - Handle ClickBank webhook events
   - Sync subscriptions with your database

**Note:** Integrating ClickBank payments requires code changes. Currently, your system is set up for Stripe. If you want ClickBank payment integration, we'll need to build that separately.

## Step 4: Required Support Page Information

Your support page (`/support`) already includes:
- ✅ Contact email (`info@tanggo.ca`)
- ✅ Contact form
- ✅ FAQs section
- ✅ Business hours

**Additional items you may want to add:**

### Refund Policy
Add a clear refund/cancellation policy to your support page or create a separate `/refunds` page.

### Terms of Service
Already available at `/terms` ✅

### Privacy Policy
Already available at `/privacy` ✅

## Step 5: Test Your Setup

1. **Test the support page:**
   - Visit: https://tavarios.com/support
   - Verify the contact form works
   - Test sending a message
   - Check that emails are received at `info@tanggo.ca`

2. **Verify ClickBank configuration:**
   - Log in to ClickBank
   - Check that your support URL is saved correctly
   - Verify your support email is correct

## Step 6: ClickBank Compliance Checklist

- ✅ Customer Support Website URL provided
- ✅ Support email address provided
- ✅ Support page is publicly accessible
- ✅ Support page includes contact information
- ✅ Support page includes FAQs
- ⚠️ **Pending:** Ensure support requests are responded to within 24-48 hours
- ⚠️ **Pending:** Consider adding refund/cancellation policy page (if not already in Terms)

## Support Response Requirements

ClickBank requires that support requests are responded to within:
- **Initial Response:** Within 24 hours
- **Resolution:** As quickly as possible, following industry best practices

Your contact form sends emails to `info@tanggo.ca`. Make sure:
- You're monitoring this email inbox
- You respond to support requests promptly
- You have a system to track support tickets (optional but recommended)

## Next Steps

1. **Complete ClickBank Vendor Settings** (Step 1 above)
2. **Create your product in ClickBank** (Step 2 above)
3. **Test the support page** (Step 5 above)
4. **Decide on payment integration:**
   - Keep Stripe (current setup) ✅
   - Add ClickBank payments (requires code changes)
   - Use both (requires code changes)

## Need Help?

If you want to integrate ClickBank payments (instead of or in addition to Stripe), let me know and I can help build that integration. Otherwise, your current Stripe setup works great, and you just need to complete the ClickBank vendor settings above.

## Quick Reference

**Support Page URL:**
```
https://tavarios.com/support
```

**Support Email:**
```
info@tanggo.ca
```

**ClickBank Vendor Settings:**
```
https://accounts.clickbank.com/master/vendorSettings.html
```

