# Tavari AI Core v2 - Implementation Status

## ✅ Phase 1: Core Foundation v2 - COMPLETED

### Models Created (`models/v2/`)
- ✅ `OrganizationUser.js` - Multi-organization membership tracking
- ✅ `Module.js` - Module registry with health status
- ✅ `Subscription.js` - Unified billing with Stripe subscription items
- ✅ `UsageLog.js` - Usage tracking per module
- ✅ `AIRequest.js` - AI request logging and token tracking
- ✅ `ModuleSettings.js` - Per-business module configuration
- ✅ `AuditLog.js` - Comprehensive audit logging
- ✅ `Notification.js` - Business/user notifications
- ✅ `ExternalPurchase.js` - ClickBank and other external purchases
- ✅ `Permission.js` - Permission registry
- ✅ `RolePermission.js` - Role-based permission mapping
- ✅ `PlatformVersion.js` - Platform versioning tracking

### Middleware Created (`middleware/v2/`)
- ✅ `requireBusinessContext.js` - Enforces active business context (CRITICAL)
- ✅ `requireLegalAcceptance.js` - Enforces Terms/Privacy acceptance
- ✅ `requireModuleConfigurePermission.js` - Permission check for settings
- ✅ `applyImpersonation.js` - Admin impersonation support
- ✅ `verifyModuleHealth.js` - Module health status verification
- ✅ Updated `rateLimiter.js` - Added `aiRateLimiter` for AI endpoints

### Routes Created (`routes/v2/`)
- ✅ `organizations.js` - Organization selection and management
  - GET `/api/v2/organizations` - List user's organizations
  - POST `/api/v2/organizations/select` - Select active organization
  - GET `/api/v2/organizations/current` - Get current organization

- ✅ `modules.js` - Module information and subscription status
  - GET `/api/v2/modules` - List all modules with subscription status
  - GET `/api/v2/modules/:moduleKey` - Get specific module details

- ✅ `settings.js` - Module settings management
  - GET `/api/v2/settings/modules` - List all module settings
  - GET `/api/v2/settings/modules/:moduleKey` - Get module settings
  - PUT `/api/v2/settings/modules/:moduleKey` - Update module settings (requires permission)

- ✅ `marketplace.js` - Module marketplace
  - GET `/api/v2/marketplace` - Browse available modules

- ✅ `webhooks/stripe.js` - Stripe webhook handler (v2 subscription items)
  - POST `/api/v2/webhooks/stripe` - Handles subscription updates with signature verification

- ✅ `webhooks/clickbank.js` - ClickBank refund handler
  - POST `/api/v2/webhooks/clickbank/refund` - Processes refunds and removes Stripe items

### Server Integration
- ✅ All v2 routes mounted in `server.js` at `/api/v2/*`
- ✅ Routes are completely separate from Phone Agent code
- ✅ No modifications to existing Phone Agent routes

## 🔒 Security Features Implemented

1. **Business Context Enforcement**
   - All v2 routes use `requireBusinessContext` middleware
   - Uses `organization_users` table as source of truth (not `users.business_id`)
   - Supports legacy fallback during migration

2. **Legal Acceptance Enforcement**
   - `requireLegalAcceptance` middleware checks Terms/Privacy acceptance
   - Blocks module access until latest terms accepted

3. **Rate Limiting**
   - AI-specific rate limiter (`aiRateLimiter`) for AI generation endpoints
   - Per-user and per-business limits to prevent abuse

4. **Webhook Signature Verification**
   - Stripe webhooks verify signature using `STRIPE_WEBHOOK_SECRET`
   - ClickBank webhooks verify signature using `CLICKBANK_CLIENT_SECRET`
   - Security events logged to audit_logs

5. **Module Health Status**
   - Modules can be marked as `healthy`, `degraded`, or `offline`
   - `verifyModuleHealth` middleware blocks access to offline modules

6. **Permission-Based Access Control**
   - `configure_module` permission required for settings updates
   - Role-based permissions via `role_permissions` table

## 📋 Next Steps (Remaining Work)

### Phase 1 Remaining Tasks
1. **Settings Routes** (Partial - only module settings done)
   - [ ] `/api/v2/settings/business` - Business profile settings
   - [ ] `/api/v2/settings/communications` - SMS/Email configuration
   - [ ] `/api/v2/settings/users` - User management
   - [ ] `/api/v2/settings/billing` - Billing settings

2. **Admin Routes**
   - [ ] `/api/v2/admin/audit` - Audit log viewer
   - [ ] `/api/v2/admin/notifications` - Notification management
   - [ ] `/api/v2/admin/modules` - Module registry management
   - [ ] `/api/v2/admin/pricing` - Pricing configuration
   - [ ] `/api/v2/admin/support` - Support tools
   - [ ] `/api/v2/admin/impersonate` - User impersonation controls

3. **Background Jobs**
   - [ ] Subscription status sync job (Stripe → DB)
   - [ ] Stripe operation retry queue for failed DB updates

4. **Database Migration**
   - [ ] Create all v2 tables (organization_users, modules, subscriptions, etc.)
   - [ ] Seed initial data (permissions, roles, default modules)

5. **Communications Service**
   - [ ] `sendSms.ts` - SMS sending with business context
   - [ ] `sendEmail.ts` - Email sending with business context

## 🛡️ Phone Agent Protection

**CRITICAL**: Phone Agent code remains completely untouched:
- ✅ No modifications to `/api/vapi/*` routes
- ✅ No modifications to `routes/vapi.js`
- ✅ No modifications to Phone Agent models
- ✅ All v2 code in separate directories (`/v2/`)

## 📝 Notes

1. **Organization Selection**: Users can belong to multiple organizations via `organization_users`. The active organization is stored in session and passed via `X-Active-Business-Id` header.

2. **Billing Architecture**: 
   - One Stripe customer per business (stored in `businesses.stripe_customer_id`)
   - One Stripe subscription per business (stored in `businesses.stripe_subscription_id`)
   - Module entitlements managed via Stripe subscription items (tracked in `subscriptions.stripe_subscription_item_id`)

3. **ClickBank Integration**: 
   - External purchases tracked in `external_purchases`
   - Refunds automatically remove Stripe subscription items
   - Retry logic handles partial failures

4. **Idempotency**: All Stripe operations are designed to be idempotent and retry-safe.

## 🚀 Deployment Checklist

Before deploying to production:
- [ ] Run database migrations to create v2 tables
- [ ] Seed initial data (permissions, roles, modules)
- [ ] Configure environment variables:
  - `STRIPE_WEBHOOK_SECRET` (for Stripe webhooks)
  - `CLICKBANK_CLIENT_SECRET` (for ClickBank webhooks)
  - `CURRENT_TERMS_VERSION` (for legal acceptance)
  - `AI_RATE_LIMIT_PER_USER` (optional, defaults to 10/min)
- [ ] Test organization selection flow
- [ ] Test webhook signature verification
- [ ] Verify Phone Agent still works (no regressions)

## 📚 API Documentation

All v2 APIs are prefixed with `/api/v2/`:
- Organization APIs: `/api/v2/organizations/*`
- Module APIs: `/api/v2/modules/*`
- Settings APIs: `/api/v2/settings/*`
- Marketplace: `/api/v2/marketplace`
- Webhooks: `/api/v2/webhooks/*`

---

**Status**: Foundation complete. Ready for Phase 2 (Module Infrastructure) and remaining Phase 1 tasks.

