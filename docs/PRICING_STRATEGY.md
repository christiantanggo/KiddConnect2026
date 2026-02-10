# Tavari AI Module Pricing Strategy

## Overview

This document outlines the pricing strategy for Tavari AI modules, including how pricing is configured, stored, and managed.

## Pricing Model

### Unified Billing Structure

- **One Stripe Customer** per business (stored in `businesses.stripe_customer_id`)
- **One Stripe Subscription** per business (stored in `businesses.stripe_subscription_id`)
- **Multiple Subscription Items** on the subscription (one per module)
- Each subscription item is tracked in `subscriptions.stripe_subscription_item_id`

### Module Pricing Configuration

Module pricing is stored in the `modules.metadata` JSONB field:

```json
{
  "pricing": {
    "monthly_price_cents": 2900,  // $29.00 in cents
    "currency": "usd",
    "usage_limit": 100,            // Generations per month
    "interval": "month"
  },
  "stripe_product_id": "prod_xxxxx",
  "stripe_price_id": "price_xxxxx"
}
```

## Default Pricing

### Review Reply AI Module

- **Monthly Price:** $29.00 USD
- **Usage Limit:** 100 generations per month
- **Billing Cycle:** Monthly (follows business billing cycle)
- **Overage:** Not available (upgrade required)

## Pricing Storage

### Database Storage

1. **modules.metadata** - Stores pricing configuration and Stripe IDs
2. **subscriptions** - Tracks active subscriptions with usage limits
3. **usage_logs** - Tracks actual usage against limits

### Stripe Products & Prices

- Each module has a Stripe Product
- Each module has a Stripe Price (monthly recurring)
- Product/Price IDs are stored in `modules.metadata` after creation
- Can be created manually in Stripe Dashboard or via migration script

## Pricing Management

### Admin Configuration

Admins can update module pricing via:

1. **Database:** Direct update to `modules.metadata.pricing`
2. **Admin API:** `PUT /api/v2/admin/modules/:moduleKey/pricing`
3. **Stripe Dashboard:** Update price, then sync metadata

### Runtime Price Changes

When pricing is updated:

1. **Existing Subscriptions:** Continue at old price (grandfathered)
2. **New Subscriptions:** Use new price
3. **Price Changes:** Require creating new Stripe Price (old price ID kept in metadata for history)

## Usage Limits

### Limit Enforcement

- Limits are enforced per billing cycle (business billing cycle, not per-module)
- Usage is tracked in `usage_logs` table
- Limits reset on billing cycle reset date
- Exceeding limit returns 403 error with upgrade prompt

### Limit Types

1. **Hard Limit:** No usage allowed after limit reached
2. **Overage:** (Future) Allow overage with additional charges
3. **Soft Limit:** Warning notifications at 80% usage

## Activation Flow

1. User clicks "Activate" on module
2. System checks if Stripe customer exists (creates if not)
3. System checks if main subscription exists (creates if not)
4. System gets/create Stripe product/price from `modules.metadata`
5. System adds subscription item to main subscription
6. System creates `subscriptions` record with `stripe_subscription_item_id`
7. User redirected to module setup wizard

## Refunds & Cancellations

### ClickBank Refunds

- ClickBank refund webhook automatically removes Stripe subscription item
- Subscription status updated to 'canceled'
- Access immediately revoked

### Stripe Cancellations

- Subscription item deleted in Stripe
- Webhook handler updates `subscriptions.status` to 'canceled'
- Access revoked on next request (via `verifySubscriptionWithStripe` middleware)

## Environment Variables (Optional)

For modules that should use pre-created Stripe products/prices:

```bash
STRIPE_PRODUCT_ID_REVIEWS=prod_xxxxx
STRIPE_PRICE_ID_REVIEWS=price_xxxxx
```

If not set, products/prices are auto-created on first activation.

## Migration Script

Run to create Stripe products/prices for all active modules:

```bash
node scripts/create-module-stripe-products.js
```

This script:
1. Reads all active modules from database
2. Gets pricing from `modules.metadata`
3. Creates Stripe products/prices if they don't exist
4. Updates `modules.metadata` with product/price IDs

## Future Enhancements

- [ ] Tiered pricing (Basic/Pro/Enterprise)
- [ ] Usage-based pricing (per generation)
- [ ] Overage billing
- [ ] Annual pricing discounts
- [ ] Promotional pricing/coupons
- [ ] Trial periods
- [ ] Per-seat pricing





