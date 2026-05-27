# Kimi Integration

Superset has two Kimi paths:

- Kimi Code CLI as a terminal agent. This uses the local `kimi` login, including Kimi Code plans from `https://www.kimi.com/code/console`.
- Kimi through Moonshot's OpenAI-compatible API for the built-in chat model picker.

The CLI path is the short-path integration. Superset seeds a `Kimi` terminal agent preset that launches `kimi --yolo` interactively, and launches prompted tasks with `kimi --yolo --prompt`.

The ACP path is intentionally separate. Kimi CLI supports `kimi acp`, but Superset does not yet act as an ACP client. A full ACP branch should spawn `kimi acp`, initialize the protocol, and map Superset workspace context, prompts, and tool permissions into ACP messages.

## Local Setup

### Kimi Code CLI

```bash
kimi login
kimi info
```

Then open Superset, create or open a workspace, and choose the `Kimi` terminal agent. No Superset `.env` value is needed for this path because credentials live in the local Kimi CLI config.

### OpenAI-Compatible Chat

```bash
cp .env.local.example .env
# Edit .env and set MOONSHOT_API_KEY or KIMI_API_KEY.
docker compose up -d
bun install
bun run db:migrate
bun run db:seed-dev
bun run dev
```

Then open Superset, create or open a workspace, and choose `Kimi K2.6` from the model picker.

## Production Env

For OpenAI-compatible chat, set these on the process that runs the host service:

```bash
MOONSHOT_API_KEY=sk-...
KIMI_BASE_URL=https://api.moonshot.ai/v1
KIMI_SMALL_MODEL_ID=kimi-k2.6
```

`KIMI_API_KEY` is accepted as an alias for `MOONSHOT_API_KEY`. If `OPENAI_API_KEY` or `OPENAI_AUTH_TOKEN` is also set, direct OpenAI credentials take precedence so existing OpenAI deployments keep working.
