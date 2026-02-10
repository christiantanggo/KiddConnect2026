# Tavari AI Core v2 - Testing Guide

## Quick Test URLs

### Health Check (Verify Server is Running)
```
GET http://localhost:5001/health
```
Or in production:
```
GET https://api.tavarios.com/health
```

### V2 API Endpoints

All v2 endpoints are prefixed with `/api/v2/`

---

## 1. Organization Management

### Get User's Organizations
```bash
GET /api/v2/organizations
Authorization: Bearer YOUR_JWT_TOKEN
```

**Test with curl:**
```bash
curl -X GET http://localhost:5001/api/v2/organizations \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Get Current Active Organization
```bash
GET /api/v2/organizations/current
Authorization: Bearer YOUR_JWT_TOKEN
```

**Test with curl:**
```bash
curl -X GET http://localhost:5001/api/v2/organizations/current \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Select Active Organization
```bash
POST /api/v2/organizations/select
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "business_id": "uuid-here"
}
```

**Test with curl:**
```bash
curl -X POST http://localhost:5001/api/v2/organizations/select \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{"business_id": "your-business-id-here"}'
```

---

## 2. Module Management

### List All Modules (with subscription status)
```bash
GET /api/v2/modules
Authorization: Bearer YOUR_JWT_TOKEN
X-Active-Business-Id: your-business-id (optional, can use session)
```

**Test with curl:**
```bash
curl -X GET http://localhost:5001/api/v2/modules \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "X-Active-Business-Id: your-business-id"
```

### Get Specific Module Details
```bash
GET /api/v2/modules/:moduleKey
Authorization: Bearer YOUR_JWT_TOKEN
X-Active-Business-Id: your-business-id
```

**Test with curl:**
```bash
curl -X GET http://localhost:5001/api/v2/modules/sales-ai \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "X-Active-Business-Id: your-business-id"
```

---

## 3. Module Settings

### Get Module Settings
```bash
GET /api/v2/settings/modules/:moduleKey
Authorization: Bearer YOUR_JWT_TOKEN
X-Active-Business-Id: your-business-id
```

**Test with curl:**
```bash
curl -X GET http://localhost:5001/api/v2/settings/modules/sales-ai \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "X-Active-Business-Id: your-business-id"
```

### Update Module Settings (requires configure_module permission)
```bash
PUT /api/v2/settings/modules/:moduleKey
Authorization: Bearer YOUR_JWT_TOKEN
X-Active-Business-Id: your-business-id
Content-Type: application/json

{
  "settings": {
    "key1": "value1",
    "key2": "value2"
  }
}
```

**Test with curl:**
```bash
curl -X PUT http://localhost:5001/api/v2/settings/modules/sales-ai \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "X-Active-Business-Id: your-business-id" \
  -H "Content-Type: application/json" \
  -d '{"settings": {"api_key": "test123"}}'
```

### List All Module Settings
```bash
GET /api/v2/settings/modules
Authorization: Bearer YOUR_JWT_TOKEN
X-Active-Business-Id: your-business-id
```

---

## 4. Module Marketplace

### Browse Available Modules
```bash
GET /api/v2/marketplace
Authorization: Bearer YOUR_JWT_TOKEN
X-Active-Business-Id: your-business-id
```

**Test with curl:**
```bash
curl -X GET http://localhost:5001/api/v2/marketplace \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "X-Active-Business-Id: your-business-id"
```

---

## 5. Webhooks (For Testing)

### Stripe Webhook Test
```bash
POST /api/v2/webhooks/stripe
stripe-signature: signature-here
Content-Type: application/json

[Stripe event payload]
```

**Note:** Stripe webhooks require signature verification. Use Stripe CLI for local testing:
```bash
stripe listen --forward-to localhost:5001/api/v2/webhooks/stripe
```

### ClickBank Refund Webhook Test
```bash
POST /api/v2/webhooks/clickbank/refund
Content-Type: application/x-www-form-urlencoded

[ClickBank refund parameters]
```

---

## Testing with Postman / Insomnia

### Setup
1. **Collection URL:** `http://localhost:5001` (or your production URL)
2. **Authorization:** 
   - Type: Bearer Token
   - Token: Get from `/api/auth/login` endpoint first

### Step-by-Step Testing Flow

#### Step 1: Login to Get Token
```
POST /api/auth/login
Content-Type: application/json

{
  "email": "your-email@example.com",
  "password": "your-password"
}
```
**Save the `token` from response**

#### Step 2: Get Organizations
```
GET /api/v2/organizations
Authorization: Bearer {token}
```

#### Step 3: Select Organization (if multiple)
```
POST /api/v2/organizations/select
Authorization: Bearer {token}
Content-Type: application/json

{
  "business_id": "{business_id_from_step_2}"
}
```

#### Step 4: Browse Modules
```
GET /api/v2/marketplace
Authorization: Bearer {token}
X-Active-Business-Id: {business_id}
```

#### Step 5: Get Module Settings
```
GET /api/v2/settings/modules/{module_key}
Authorization: Bearer {token}
X-Active-Business-Id: {business_id}
```

---

## Frontend Testing

### React / Next.js Example
```javascript
// Fetch organizations
const response = await fetch('/api/v2/organizations', {
  headers: {
    'Authorization': `Bearer ${token}`,
  },
});

const { organizations } = await response.json();

// Select organization
await fetch('/api/v2/organizations/select', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ business_id: selectedBusinessId }),
});

// Get modules
const modulesResponse = await fetch('/api/v2/modules', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'X-Active-Business-Id': selectedBusinessId,
  },
});
```

---

## Browser Console Testing

Open browser DevTools Console on your frontend and run:

```javascript
// Assuming you have the token stored
const token = localStorage.getItem('authToken'); // or however you store it
const businessId = localStorage.getItem('activeBusinessId');

// Test organizations endpoint
fetch('/api/v2/organizations', {
  headers: { 'Authorization': `Bearer ${token}` }
})
  .then(r => r.json())
  .then(console.log);

// Test modules endpoint
fetch('/api/v2/modules', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'X-Active-Business-Id': businessId
  }
})
  .then(r => r.json())
  .then(console.log);
```

---

## Important Notes

### Required Headers
- `Authorization: Bearer {token}` - Required for all authenticated endpoints
- `X-Active-Business-Id: {business_id}` - Required for most v2 endpoints (or use session)

### Error Responses
All endpoints return standard error format:
```json
{
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

### Common Error Codes
- `BUSINESS_CONTEXT_REQUIRED` - No active business selected
- `BUSINESS_ACCESS_DENIED` - User doesn't belong to requested business
- `TERMS_NOT_ACCEPTED` - User hasn't accepted latest terms
- `PERMISSION_DENIED` - User lacks required permission
- `MODULE_NOT_FOUND` - Module doesn't exist
- `MODULE_OFFLINE` - Module health status is offline

---

## Database Setup Required

⚠️ **Before testing, you need to:**
1. Run database migrations to create v2 tables
2. Seed initial data (permissions, roles, modules)
3. Create test organizations and link users via `organization_users`

The endpoints will return errors if the database tables don't exist yet!

---

## Quick Local Test Script

Save as `test-v2-api.sh`:

```bash
#!/bin/bash

BASE_URL="http://localhost:5001"
TOKEN="YOUR_TOKEN_HERE"
BUSINESS_ID="YOUR_BUSINESS_ID_HERE"

echo "=== Testing Organizations ==="
curl -X GET "$BASE_URL/api/v2/organizations" \
  -H "Authorization: Bearer $TOKEN"

echo -e "\n\n=== Testing Modules ==="
curl -X GET "$BASE_URL/api/v2/modules" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Active-Business-Id: $BUSINESS_ID"

echo -e "\n\n=== Testing Marketplace ==="
curl -X GET "$BASE_URL/api/v2/marketplace" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Active-Business-Id: $BUSINESS_ID"
```

Make executable and run:
```bash
chmod +x test-v2-api.sh
./test-v2-api.sh
```




