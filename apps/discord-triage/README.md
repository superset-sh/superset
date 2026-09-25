# discord-triage

Gateway bot that turns Discord support posts into tickets. Every new top-level message in a watched text channel (and every new post in a watched forum channel) is picked up, the bot opens a thread on it, and two optional sinks run:

- **Linear** (`LINEAR_FILING_ENABLED`): files a Triage issue labeled `Source: Discord` and links it from the thread; issue close archives the thread via the Linear webhook.
- **Plain bridge** (`PLAIN_BRIDGE_ENABLED`): mirrors the post into Plain over email so the support team (and the Parahelp agent) can work it like any other ticket. Each Discord user is a synthetic Plain customer `discord-<userId>@<BRIDGE_EMAIL_DOMAIN>`; the post is emailed to Plain's inbound address, follow-ups in the Discord thread are emailed as replies (threaded with `In-Reply-To`), and support replies are sent by Plain to the synthetic address, received by Resend, delivered to `/resend-webhook`, and posted into the Discord thread as "Superset Support". The thread <-> email map lives in SQLite on a Fly volume.

After filing, an async enhancement pass mirrors message attachments to Linear uploads (Discord CDN URLs expire) and — when `ANTHROPIC_API_KEY` is set — has Claude Sonnet rewrite the ticket into the standard format (improved title, Context, Artifacts, References, original report preserved as a quote). Screenshots are passed to the model as vision input. Enhancement failures leave the raw issue untouched.

## Env

| Var | Value |
|---|---|
| `ANTHROPIC_API_KEY` | Enables Claude Sonnet ticket summarization/enhancement; skipped when unset |
| `DISCORD_BOT_TOKEN` | Bot token from the Discord developer portal |
| `DISCORD_CHANNEL_IDS` | Comma-separated channel IDs to watch |
| `LINEAR_API_KEY` | Linear personal API key |
| `LINEAR_TEAM_KEY` | Team key, default `SUPER` |
| `LINEAR_SOURCE_LABEL` | Label name, default `Discord`; must exist on the team (boot fails otherwise) |
| `LINEAR_WEBHOOK_SECRET` | Signing secret of the Linear webhook; `/linear-webhook` (issue close → archive Discord thread) stays disabled when unset |
| `LINEAR_FILING_ENABLED` | `true` (default) files every report into Linear Triage; set `false` once the Parahelp agent files issues itself |
| `DISCORD_BOT_NAME` / `DISCORD_BOT_AVATAR_URL` | Bot profile, applied at boot when it differs from the current one |
| `PLAIN_BRIDGE_ENABLED` | `true` mirrors reports into Plain over email and relays replies back; needs the four vars below |
| `PLAIN_INBOUND_ADDRESS` | Plain's inbound address for the support email channel (Settings → Channels → Email) |
| `RESEND_API_KEY` | Resend key with sending + receiving access |
| `BRIDGE_EMAIL_DOMAIN` | Resend domain with receiving enabled, e.g. `discord.superset.sh` |
| `RESEND_WEBHOOK_SECRET` | Signing secret of the Resend `email.received` webhook pointed at `/resend-webhook`; inbound relay stays disabled when unset |
| `BRIDGE_DB_PATH` | SQLite path for the thread map (`/data/bridge.sqlite` on the Fly volume); in-memory when unset |

## One-time setup

1. [discord.com/developers/applications](https://discord.com/developers/applications) → New Application → Bot:
   - enable **Message Content Intent** (privileged)
   - copy the bot token
2. Invite it: OAuth2 → URL Generator → scope `bot`, permissions: View Channels, Send Messages, Send Messages in Threads, Create Public Threads, Read Message History. Open the generated URL, add to the server.
3. Right-click the support channel → Copy Channel ID (enable Developer Mode in Discord settings if missing).
4. Linear personal API key: Linear → Settings → API.
5. Deploy:
   ```bash
   fly apps create superset-discord-triage
   fly secrets set -a superset-discord-triage DISCORD_BOT_TOKEN=... LINEAR_API_KEY=...
   bun run deploy   # from apps/discord-triage; builds from repo root, forces --ha=false
   ```
   The bot MUST run as a single machine (`--ha=false`) — two machines file every issue twice. Watched channel IDs live in `fly.toml` `[env]`, not secrets.

Issues land in Triage because API-created issues default to the Triage state — the bot never sets a state explicitly.

## Plain bridge setup

1. Resend: add the bridge domain (e.g. `discord.superset.sh`), add its DKIM/SPF records plus the receiving `MX 10 inbound-smtp.us-east-1.amazonaws.com`, and enable receiving.
2. Resend → Webhooks: add `https://superset-discord-triage.fly.dev/resend-webhook` for `email.received`; store its signing secret as `RESEND_WEBHOOK_SECRET`.
3. `fly secrets set RESEND_API_KEY=... RESEND_WEBHOOK_SECRET=... PLAIN_INBOUND_ADDRESS=...@inbound.postmarkapp.com`, then deploy (the deploy script creates the `bridge_data` volume on first run).

Plain threads replies only on `In-Reply-To`/`References`, never on subject, which is why the bot records every Message-ID it sends or receives.
