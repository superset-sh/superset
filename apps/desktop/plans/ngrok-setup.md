# Ngrok Setup for Local Development

This guide explains how to set up ngrok for testing GitHub OAuth locally with cloud workspaces.

## Why Ngrok?

GitHub OAuth requires a publicly accessible callback URL. When developing locally:
- Your web app runs on `localhost:3000`
- Your API runs on `localhost:3001`
- GitHub cannot redirect back to `localhost` after OAuth authorization

Ngrok creates a secure tunnel from a public URL to your local machine, allowing GitHub OAuth callbacks to work.

## Prerequisites

- [ngrok account](https://ngrok.com) (free tier works, paid is easier)
- ngrok CLI installed

## Free vs Paid Account

| Feature | Free | Paid |
|---------|------|------|
| Static domain | 1 (must claim) | Unlimited custom subdomains |
| Session timeout | ~2 hours idle | No timeout |
| Custom domain | No | Yes (e.g., `dev.superset.sh`) |
| Setup complexity | Claim domain first | Just use `--subdomain` |

**With a paid account**, skip step 3 and just run:
```bash
ngrok http 3001 --subdomain=superset-dev
# Gives you: https://superset-dev.ngrok.io
```

## Setup Steps

### 1. Install ngrok

```bash
# macOS
brew install ngrok

# Or download from https://ngrok.com/download
```

### 2. Authenticate ngrok

Get your auth token from the [ngrok dashboard](https://dashboard.ngrok.com/get-started/your-authtoken):

```bash
ngrok config add-authtoken YOUR_AUTH_TOKEN
```

### 3. Reserve a Static Domain (Recommended)

Free ngrok accounts can claim one static domain. This is better than random URLs because:
- The domain persists across sessions
- You don't need to update GitHub App settings each time

1. Go to [ngrok Dashboard → Domains](https://dashboard.ngrok.com/cloud-edge/domains)
2. Click "New Domain" and claim a free static domain
3. Example: `your-name-superset.ngrok-free.app`

### 4. Start the Tunnel

The API server runs on port 3001:

**Free account (with static domain):**
```bash
ngrok http 3001 --domain=your-name-superset.ngrok-free.app
```

**Paid account (custom subdomain):**
```bash
# Use any subdomain you want on ngrok.io
ngrok http 3001 --url=superset-dev.ngrok.io

# This gives you: https://superset-dev.ngrok.io
```

**Paid account (custom domain):**
```bash
# Use your own domain (requires DNS setup)
ngrok http 3001 --url=dev.superset.sh
```

You'll see output like:
```
Session Status                online
Account                       your-email@example.com
Forwarding                    https://your-name-superset.ngrok-free.app -> http://localhost:3001
```

### 5. Update Environment Variables

In your `.env` file, add `NEXT_PUBLIC_NGROK_URL` for GitHub OAuth while keeping the regular API URL on localhost:

```bash
# Regular API URL stays on localhost for Google OAuth and other features
NEXT_PUBLIC_API_URL=http://localhost:3001

# Ngrok URL is only used for GitHub OAuth (which requires public callback URL)
NEXT_PUBLIC_NGROK_URL=https://your-name-superset.ngrok-free.app
```

This approach keeps Google OAuth working (which requires the registered `localhost` redirect URI) while enabling GitHub OAuth through ngrok.

### 6. Update GitHub App Callback URL

The GitHub App needs its callback URL updated to point to your ngrok domain:

1. Go to [GitHub App Settings](https://github.com/settings/apps) (or your organization's apps)
2. Click on the **superset-app** (or your app name)
3. Find **"Callback URL"** under "Identifying and authorizing users"
4. Change it to your ngrok URL:
   ```
   https://your-name-superset.ngrok-free.app/api/github/callback
   ```
5. Save changes

**Important:** Remember to change this back to the production URL (`https://api.superset.sh/api/github/callback`) when you're done testing locally, or it will break production GitHub OAuth.

### 7. Start Development Servers

In a separate terminal:

```bash
bun dev
```

The web app still runs on `localhost:3000` - only the API traffic goes through ngrok.

## Testing the Flow

1. Navigate to `http://localhost:3000/cloud`
2. Click "Connect GitHub"
3. You should be redirected to GitHub for authorization
4. After authorizing, GitHub redirects to your ngrok URL
5. The API handles the callback and redirects back to localhost

## Troubleshooting

### "Connect GitHub" goes to 404

Make sure your `.env` has the correct `NEXT_PUBLIC_API_URL` pointing to your ngrok domain, then restart the dev server.

### GitHub shows "Callback URL mismatch"

Your GitHub App's callback URL must match your ngrok domain. See [Step 6](#6-update-github-app-callback-url) to update it in GitHub App Settings.

### ngrok tunnel expires

Free ngrok tunnels expire after ~2 hours of inactivity. Solutions:
- Restart `ngrok http 3001 --domain=...`
- Upgrade to paid (no timeouts)

### Different ngrok URL each time

Without a static domain, ngrok generates a random URL each session. Solutions:
- Claim a free static domain (step 3)
- Paid account: use `--subdomain=superset-dev` for consistent URL

## Architecture Notes

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Browser       │     │   ngrok         │     │   Local API     │
│   localhost:3000│────▶│   tunnel        │────▶│   localhost:3001│
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                                               │
        │                                               │
        ▼                                               ▼
┌─────────────────┐                           ┌─────────────────┐
│   GitHub OAuth  │◀──────────────────────────│   Callback      │
│   Authorization │                           │   Handler       │
└─────────────────┘                           └─────────────────┘
```

1. User clicks "Connect GitHub" on localhost:3000
2. Browser redirects to GitHub OAuth
3. GitHub redirects to ngrok URL after authorization
4. ngrok forwards to localhost:3001
5. API handles callback, creates session, redirects back to localhost:3000

## Quick Start (Recommended)

Use the `dev:cloud` script to run ngrok + dev servers together:

```bash
# 1. Add to your .env:
NGROK_SUBDOMAIN=superset-dev
NEXT_PUBLIC_NGROK_URL=https://superset-dev.ngrok.io

# 2. Run everything:
bun run dev:cloud
```

This starts ngrok in the background and runs the dev servers. When you stop the servers (Ctrl+C), ngrok also shuts down.

Note: `NEXT_PUBLIC_API_URL` stays on `http://localhost:3001` for Google OAuth and general API calls. Only GitHub OAuth uses the ngrok URL.

## Manual Commands

```bash
# Start tunnel manually (replace with your domain)
ngrok http 3001 --url=superset-dev.ngrok.io

# Check tunnel status
curl https://superset-dev.ngrok.io/health

# View ngrok web inspector (shows all requests)
open http://localhost:4040
```
