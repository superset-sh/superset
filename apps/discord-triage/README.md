# discord-triage

Gateway bot that auto-ingests Discord support messages into Linear Triage. Every new top-level message in a watched text channel (and every new post in a watched forum channel) becomes a Linear issue labeled `Source: Discord`; the bot opens a thread on the message with a link to the issue. Thread replies are not synced (future work).

## Env

| Var | Value |
|---|---|
| `DISCORD_BOT_TOKEN` | Bot token from the Discord developer portal |
| `DISCORD_CHANNEL_IDS` | Comma-separated channel IDs to watch |
| `LINEAR_API_KEY` | Linear personal API key |
| `LINEAR_TEAM_KEY` | Team key, default `SUPER` |
| `LINEAR_SOURCE_LABEL` | Label name, default `Discord`; must exist on the team (boot fails otherwise) |
| `LINEAR_WEBHOOK_SECRET` | Signing secret of the Linear webhook; `/linear-webhook` (issue close → archive Discord thread) stays disabled when unset |

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
