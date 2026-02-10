# Phone Number Format Fix

## Problem
Users were getting errors when signing up:
- "number must be a valid phone number in the E.164 format"
- "credentialId must be a UUID"

## Solution Implemented

### Frontend Changes
1. **Phone Number Formatting** (`frontend/lib/phoneFormatter.js`)
   - Auto-formats phone numbers as user types
   - Validates phone numbers in real-time
   - Converts to E.164 format before submission
   - Shows helpful error messages

2. **Signup Form Updates** (`frontend/app/signup/page.jsx`)
   - Phone input now formats as user types
   - Shows validation errors immediately
   - Placeholder updated to show E.164 format example: `+1 (555) 123-4567`
   - Converts phone number to E.164 before sending to backend

### Backend Changes
1. **Signup Route** (`routes/auth.js`)
   - Validates phone number format on signup
   - Converts to E.164 format before storing
   - Returns clear error if phone number is invalid

2. **VAPI Service** (`services/vapi.js`)
   - All phone number functions now validate E.164 format
   - `transferCall` and `forwardCallToBusiness` format numbers before use
   - Better error messages for phone number issues

## Phone Number Format Requirements

**E.164 Format Examples:**
- US/Canada: `+15551234567` (must start with +1)
- UK: `+442071234567`
- Australia: `+61234567890`

**What Users See:**
- Input field formats as they type: `+1 (555) 123-4567`
- Validation happens in real-time
- Clear error messages if format is wrong
- Automatic conversion to E.164 before submission

## CredentialId Issue

The error "credentialId must be a UUID" suggests VAPI needs a Telnyx credential configured.

### To Fix:
1. Go to VAPI Dashboard → Settings → Credentials
2. Add a Telnyx credential (if not already added)
3. Copy the credential ID (UUID format)
4. Add to your `.env` file:
   ```
   VAPI_TELNYX_CREDENTIAL_ID=your-credential-uuid-here
   ```

### Alternative:
If you don't have a Telnyx credential in VAPI, you may need to:
- Set up Telnyx account
- Configure it in VAPI dashboard
- Or use a different provider (if VAPI supports others)

## Testing

After these changes:
1. Phone numbers are automatically formatted as users type
2. Invalid formats show clear error messages
3. Phone numbers are converted to E.164 before being sent to VAPI
4. All VAPI functions validate phone numbers before use

## User Experience

**Before:**
- Users could enter phone numbers in any format
- Errors occurred at signup time
- Confusing error messages

**After:**
- Users see formatted phone numbers as they type
- Real-time validation with helpful messages
- Automatic format conversion
- Clear guidance on required format



















