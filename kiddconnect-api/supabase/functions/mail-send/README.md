# Mail Send Edge Function

Supabase Edge Function for sending emails via AWS SES.

## Setup

### 1. Environment Variables

Set these in Supabase Dashboard → Edge Functions → Secrets:

- `SES_ACCESS_KEY_ID` - AWS IAM access key
- `SES_SECRET_ACCESS_KEY` - AWS IAM secret key
- `AWS_REGION` - AWS region (e.g., `us-east-1`)
- `SUPABASE_URL` - Auto-set by Supabase
- `SUPABASE_SERVICE_ROLE_KEY` - Auto-set by Supabase

### 2. Deploy Function

```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Deploy the function
supabase functions deploy mail-send
```

### 3. AWS SES Setup

1. Verify sender email in AWS SES Console
2. IAM user needs permissions:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "ses:SendEmail",
           "ses:SendRawEmail"
         ],
         "Resource": "*"
       }
     ]
   }
   ```

## Usage

```javascript
const response = await fetch(`${SUPABASE_URL}/functions/v1/mail-send`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
  },
  body: JSON.stringify({
    businessId: "business-uuid",
    campaignId: "unique-campaign-id",
    contactId: "unique-contact-id",
    to: "recipient@example.com",
    fromEmail: "sender@example.com",
    fromName: "Display Name",
    subject: "Email Subject",
    html: "<html>...</html>",
    text: "Plain text version",
    attachments: [/* optional */]
  }),
});
```

