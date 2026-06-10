# Superset Chat Architecture — Internal Note

> Status: traced 2026-06-10. Pre-implementation notes for adding MiniMax as a first-class chat provider.

## High-level flow

```
┌──────────────────┐   IPC (trpc)   ┌──────────────────────────────┐
│ Renderer (web)   │ ─────────────► │ Electron main process        │
│ - chat UI        │                │ - host-service (Node)        │
│ - model picker   │                │ - chat-service (Node)        │
│ - settings panel │                │ - cli/agent wrappers         │
└──────────────────┘                └──────────────────────────────┘
                                                  │
                                                  │ HTTPS
                                                  ▼
                                       ┌────────────────────┐
                                       │ LLM provider API   │
                                       │ (anthropic/openai) │
                                       └────────────────────┘
```

The local desktop app:
- Renders the chat UI in a renderer process (renderer/).
- Calls a TRPC server in the host-service (apps/desktop) via Electron IPC.
- The TRPC server runs `packages/chat/src/server/desktop/chat-service/chat-service.ts` which:
  - Reads auth credentials from the `mastracode` auth-storage file.
  - Picks a provider (anthropic or openai-codex today).
  - Streams messages to the upstream API using the AI SDK.

The renderer-side `apps/desktop` settings panel is in `renderer/assets/page-9llLG1MH.js`
(compiled, but source is somewhere under `apps/desktop/src/renderer/`).

## Auth provider abstraction

`packages/chat/src/server/desktop/auth/`
```
auth/
├── provider-ids.ts        # exports ANTHROPIC_AUTH_PROVIDER_ID, OPENAI_AUTH_PROVIDER_ID
├── anthropic/
│   ├── anthropic.ts       # read API key + env config from auth-storage
│   ├── oauth.ts           # OAuth flow
│   └── index.ts
└── openai/
    ├── openai.ts          # read API key + OAuth from auth-storage
    ├── openai.test.ts
    └── index.ts
```

`packages/chat/src/server/shared/auth-provider-ids.ts`:
```ts
export const ANTHROPIC_AUTH_PROVIDER_ID = "anthropic";
export const OPENAI_AUTH_PROVIDER_ID = "openai-codex";
export const OPENAI_AUTH_PROVIDER_IDS = ["openai-codex", "openai"] as const;
```

The auth-storage (provided by `mastracode`) is a file-based key/value store on disk
keyed by provider id. Each entry has either `type: "api_key"` (with `key`) or
`type: "oauth"` (with `access`, `refresh`, `expires`).

`chat-service.ts` reads these credentials and chooses a provider per request. Each
provider has its own cred resolver (e.g. `getOpenAICredentialsFromAuthStorage`).

## Model registry

The model list in the picker comes from a hardcoded `provider_registry_default`
constant in `packages/chat/src/server/...` (compiled into the desktop bundle).
This is the same list I saw at line 69310 of the compiled bundle:

```ts
var provider_registry_default = {
  "anthropic": { ... models: ["claude-opus-4-7", ...] },
  "openai":    { ... models: ["gpt-5.5", ...] },
  "minimax-coding-plan": { url: "https://api.minimax.io/anthropic/v1", ... models: [M2, M2.1, M2.5, M2.5-highspeed, M2.7, M2.7-highspeed] },
  ...
}
```

**The registry has `minimax-coding-plan` already (with M2.x models) but M3 is missing.**
The picker shows models that are in the registry.

## Settings UI

`renderer/assets/page-9llLG1MH.js` is the compiled settings page. It has:
- Anthropic section with: API key field, Advanced collapsible with authToken/baseUrl/extraEnv
- OpenAI section with: API key field only (no advanced)

To add MiniMax, we need a parallel section: API key field + Advanced (baseUrl).

The source is somewhere in `apps/desktop/src/renderer/` (compiled to the asset bundle).

## Where the request is sent

`chat-service.ts` calls into the AI SDK with the resolved credentials. The chat
stream is created by `getSmallModel` or similar (in
`packages/chat/src/server/shared/small-model/get-small-model.ts`).

Looking at the chat-service.ts imports:
```ts
} from "../auth/anthropic";
} from "../auth/openai";
} from "../auth/provider-ids";
} from "./anthropic-env-config";
```

The provider-selection logic in chat-service is gated by
`isAnthropicAuthenticated` / `isOpenAIAuthenticated` checks (lines 7166-7167 of
the compiled bundle). Adding MiniMax means adding a third branch.

## What needs to change for MiniMax-M3 first-class support

1. `packages/chat/src/server/shared/auth-provider-ids.ts`
   - add `MINIMAX_AUTH_PROVIDER_ID = "minimax"` and `MINIMAX_AUTH_PROVIDER_IDS`

2. `packages/chat/src/server/desktop/auth/minimax/` (new)
   - `minimax.ts` — read API key from auth-storage
   - `index.ts`
   - test file

3. `packages/chat/src/server/desktop/chat-service/chat-service.ts`
   - add a `getMiniMaxCredentialsFromAuthStorage` call
   - add a `isMiniMaxAuthenticated` check
   - add a `resolveMiniMaxProvider` branch
   - wire into the model picker / chat path

4. Provider registry (the hardcoded list)
   - find the source (not the compiled bundle) and add M3 to the `minimax-coding-plan` provider entry

5. Renderer settings panel
   - add a MiniMax section mirroring Anthropic (API key + Advanced baseUrl)

6. Renderer chat picker
   - the picker reads from a TRPC endpoint `chatService.listModels` or similar
   - need to make sure M3 appears in the returned list

7. Tests
   - unit tests for the auth resolver
   - unit tests for the provider selection
   - optional: end-to-end test that the chat actually works

## Build & dev cycle

- Monorepo, bun-based (`bunfig.toml`, `bun.lock`).
- Run `bun install` at the root.
- Desktop dev: `cd apps/desktop && bun run dev` (probably).
- Tests: `bun run test` per package, or `turbo test` at root.
- The desktop app is officially macOS-only — getting the dev mode to run on WSL2
  will require some hackery (we already know WSL2 + Electron/Vite has GPU issues).

## Constraints discovered

- The desktop app's local config store is `~/.superset/` (the `local.db` and
  `tanstack-db.sqlite` files I already saw).
- Auth credentials are stored by `mastracode` in its own format (not in the
  Superset DB).
- The compiled bundle is in `app.asar` and is NOT regenerated on the fly — the
  dev server outputs to a separate hot-reload target.
- The model registry is hardcoded in TS, not loaded from models.dev at runtime
  (the `get-small-model` module fetches models.dev for some features but the
  picker list is from the hardcoded registry).

## Open questions

- Where exactly is the model picker UI? (need to find the source for page-3-eOMRue.js)
- Where does the chat-service decide which provider to use for a given request?
  Is it a per-chat config or per-model-id heuristic?
- Is there a per-workspace model override (the spec mentions this as nice-to-have)?
