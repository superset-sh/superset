# Linear Local Dev Pattern

## Problem

Linear OAuth callbacks and Linear webhooks need a URL that Linear can reach. In local development, `localhost` is not enough for the full Superset Linear flow because:

- the OAuth `redirect_uri` must match exactly between the authorize request and token exchange
- Linear webhooks require a public HTTPS, non-localhost endpoint
- QStash-delivered follow-up jobs also need an externally reachable callback URL

## Repo Context

This repo already has:

- Caddy for local reverse proxying in development
- a Cloudflare Worker service called `electric-proxy`

Caddy is local-only infrastructure. It does not expose the machine to the internet.

The existing Cloudflare service is a Worker, not a Cloudflare Tunnel for `apps/api`.

For Linear OAuth + webhooks, we still need a public tunnel service that forwards requests back to the local API.

## Pattern

Keep normal app traffic local, but add a second server-only API base URL for inbound traffic:

- `NEXT_PUBLIC_WEB_URL=http://localhost:3000`
- `NEXT_PUBLIC_API_URL=http://localhost:3001`
- `EXTERNAL_API_URL=https://api-<engineer>.dev.superset.sh`

Use `EXTERNAL_API_URL` only for:

- provider callback URLs
- webhook endpoints
- QStash job URLs and signature verification

Keep browser and local app traffic on `NEXT_PUBLIC_API_URL`.

This means:

- local clients talk directly to `localhost`
- third-party systems talk to the stable public hostname

## Why Not Reuse `NEXT_PUBLIC_API_URL`

It is technically possible to set:

- `NEXT_PUBLIC_API_URL=https://api-<engineer>.dev.superset.sh`

and send all traffic through the tunnel.

That works, but it is not the recommended default because it makes all local browser and desktop API traffic depend on the public tunnel. That adds latency, creates harder debugging paths, and makes local development more fragile than necessary.

The cleaner split is:

- `NEXT_PUBLIC_API_URL` = local client-to-API traffic
- `EXTERNAL_API_URL` = external provider-to-API traffic

## Recommended Tunnel Service

Use Cloudflare Tunnel as a dev service, not as application code.

For this repo, the clean split is:

- tunnel = local infrastructure service, same class as `dev:caddy`
- URL selection = tiny helper in code
- integration logic = stays in `apps/api`

Do not create a new app just for the tunnel. It is a local development service.

## Naming Pattern For Parallel Testing

For multiple engineers testing in parallel, use one stable hostname per engineer:

- `api-kietho.dev.superset.sh`
- `api-avi.dev.superset.sh`
- `api-sarah.dev.superset.sh`

This matches the repo's existing app-prefixed naming style like:

- `api.superset.sh`
- `app.superset.sh`
- `docs.superset.sh`

Recommended ownership model:

- one Cloudflare Tunnel per engineer
- one stable public hostname per engineer
- one Linear dev app per engineer
- one Linear test workspace per engineer

Avoid branch-scoped or worktree-scoped public hostnames by default. Provider config churn is too high.

## Linear Workspace And App Pattern

Use a separate Linear test workspace for local integration testing.

Recommended setup:

- one shared Linear workspace for managing OAuth apps if the team wants shared admin access
- one engineer-specific test workspace for actual issue/webhook testing
- one engineer-specific Linear OAuth app if the engineer has their own tunnel hostname

Example:

- tunnel hostname: `api-kietho.dev.superset.sh`
- Linear app: `Superset Linear Dev Kietho`
- Linear workspace: `Superset Dev Kietho`

This avoids callback URL conflicts, webhook target conflicts, and webhook secret conflicts when multiple people are testing locally at the same time.

## Full Flow

With the recommended env split:

- `NEXT_PUBLIC_WEB_URL=http://localhost:3000`
- `NEXT_PUBLIC_API_URL=http://localhost:3001`
- `EXTERNAL_API_URL=https://api-kietho.dev.superset.sh`

the full OAuth + webhook flow looks like this:

1. Open the local web app at `http://localhost:3000`.
2. Click "Connect Linear".
3. The local API builds the Linear authorize URL with:
   - `redirect_uri=https://api-kietho.dev.superset.sh/api/integrations/linear/callback`
4. Linear redirects the browser to that public callback URL.
5. Cloudflare Tunnel forwards that request to local `localhost:3001`.
6. The local callback route exchanges the code using the exact same public `redirect_uri`.
7. The callback stores the connection and redirects the browser back to the local web app.
8. The initial sync job is queued to a public API job URL so QStash can reach it through the same tunnel.
9. Later, Linear webhooks hit the public webhook URL and Cloudflare forwards them to the local webhook route.

The tunnel therefore fixes the full integration chain:

- OAuth callback
- token exchange redirect URI matching
- initial QStash-delivered sync
- later Linear webhook delivery

## Cloudflare Tunnel Setup

Create a named tunnel and route a stable subdomain to it.

Example commands:

```bash
brew install cloudflared
cloudflared tunnel login
cloudflared tunnel create superset-api-kietho
cloudflared tunnel route dns superset-api-kietho api-kietho.dev.superset.sh
```

Example config:

```yaml
# .cloudflared/config.yml
tunnel: superset-api-kietho
credentials-file: /Users/<you>/.cloudflared/<tunnel-uuid>.json

ingress:
  - hostname: api-kietho.dev.superset.sh
    service: http://localhost:3001
  - service: http_status:404
```

Start from the checked-in template at `.cloudflared/config.example.yml` and copy it to `.cloudflared/config.yml`.

Run the tunnel:

```bash
bun run dev:tunnel
```

Then set env locally:

```bash
NEXT_PUBLIC_WEB_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3001
EXTERNAL_API_URL=https://api-kietho.dev.superset.sh
CLOUDFLARED_TUNNEL_NAME=superset-api-kietho
```

For a one-command local stack focused on the web + API Linear flow:

```bash
bun run dev:linear
```

## Why Stable Tunnel

Linear stores callback and webhook URLs in app settings. An ephemeral tunnel domain forces manual reconfiguration every restart.

Prefer:

- named Cloudflare Tunnel + your own subdomain

Avoid for normal testing:

- temporary `trycloudflare.com` URLs
- any other random tunnel URL that changes per session

## Linear App Settings

In the engineer's Linear dev app, configure:

- OAuth callback URL: `https://api-kietho.dev.superset.sh/api/integrations/linear/callback`
- Webhook URL: `https://api-kietho.dev.superset.sh/api/integrations/linear/webhook`

Locally, use the matching engineer-specific credentials:

```bash
LINEAR_CLIENT_ID=...
LINEAR_CLIENT_SECRET=...
LINEAR_WEBHOOK_SECRET=...
```

## Security Notes

Do not put an interactive Cloudflare Access login in front of the Linear callback or webhook routes. Linear and QStash must be able to reach those endpoints directly.

For local development, the simplest workable setup is:

- keep the tunnel public
- only run it when actively testing
- rely on:
  - application auth
  - signed OAuth state
  - Linear webhook signature verification
  - QStash signature verification

If we later want a tighter model, we can put Caddy in front of the API and only expose a small allowlisted set of routes through the tunnel.

## Testing Pattern

Use two testing modes:

- End-to-end testing: point Linear at the stable tunnel URL and exercise the real callback, webhook, and sync flow.
- Payload inspection: point a temporary webhook at RequestBin when you only need to inspect payload shape or delivery behavior.

RequestBin is useful for verifying which events Linear emits before routing them back to Superset.

## Summary

The recommended parallel-dev pattern is:

- one engineer
- one stable public subdomain
- one Cloudflare Tunnel
- one Linear dev app
- one Linear test workspace

That gives each engineer a stable full-fidelity local integration environment without stepping on anyone else's callback URLs, webhook URLs, or secrets.
