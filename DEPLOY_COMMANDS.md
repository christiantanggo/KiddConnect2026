# CORRECT DEPLOYMENT COMMAND

## For tavarios.com deployment:

```bash
# From project ROOT directory:
cd C:\Apps\Tavari-Communications-App

# Link to correct project
vercel link --project tavari-communications-agent --yes

# Deploy
vercel --prod --yes
```

## IMPORTANT: Vercel Dashboard Settings

**Project Settings → General → Root Directory MUST be set to: `frontend`**

If it's not set correctly, the build will only generate 2 pages instead of 94.

## To verify correct build:
Look for "Route (app)" in build logs, NOT "Route (pages)".

