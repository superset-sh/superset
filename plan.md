# Plan: OAuth Provider Authentication for Chat

## Overview
Add Anthropic + OpenAI OAuth login so users can authenticate with their own accounts (Claude Pro/Max, ChatGPT Plus/Pro) instead of relying on `.env` API keys. OAuth credentials take priority over `.env` fallback.

## Architecture

**Flow**: User clicks "Connect" → opens browser for OAuth → user authorizes → token exchanged and stored → `process.env.{PROVIDER}_API_KEY` set before each Mastra agent call.

Mastra reads `process.env.ANTHROPIC_API_KEY` / `process.env.OPENAI_API_KEY` at runtime via its `apiKeyEnvVar` config per provider. We inject the OAuth access token into the env before each `superagent.stream()` call.

## Implementation Steps

### Step 1: Add PKCE + OAuth utilities (main process)

Create `apps/desktop/src/main/lib/oauth/`:
- `pkce.ts` — PKCE verifier/challenge generation (Web Crypto API)
- `anthropic.ts` — Anthropic OAuth flow (PKCE, token exchange, refresh)
- `openai.ts` — OpenAI Codex OAuth flow (local callback server + PKCE)
- `types.ts` — Shared types (`OAuthCredentials`, `OAuthProvider`)
- `credential-store.ts` — Encrypt and store/load credentials in local SQLite `settings` table (new JSON column `oauthCredentials`)

### Step 2: Add `oauthCredentials` column to settings schema

In `packages/local-db/src/schema/schema.ts`, add a JSON column to the `settings` table:
```typescript
oauthCredentials: text("oauth_credentials", { mode: "json" }).$type<Record<string, OAuthCredentialEntry>>()
```

Generate a migration for this schema change.

### Step 3: Create tRPC router for OAuth operations

Create `apps/desktop/src/lib/trpc/routers/oauth/index.ts` with procedures:
- `getProviderStatus` — Returns connected providers and their status (connected/expired)
- `startLogin` — Initiates OAuth flow, returns auth URL to open in browser
- `completeLogin` — Receives auth code from renderer, exchanges for tokens, stores them
- `disconnect` — Removes stored credentials for a provider
- `getActiveApiKey` — Returns the current access token for a provider (refreshing if expired)

Register this router in the root tRPC router.

### Step 4: Inject OAuth credentials before agent calls

Modify `apps/desktop/src/lib/trpc/routers/ai-chat/index.ts`:
- In the `superagent` mutation (line 522), before calling `superagent.stream()`:
  1. Parse the provider from `modelId` (e.g., `"anthropic/..."` → `"anthropic"`)
  2. Call the credential store to get a valid access token for that provider
  3. If found, set `process.env.ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`) to the token
  4. After the stream completes, restore the original env var value
- Same for `approveToolCall` resumption path

### Step 5: Settings UI — "AI Providers" page

Create `apps/desktop/src/renderer/routes/_authenticated/settings/ai-providers/`:
- `page.tsx` — Route definition
- `components/AiProvidersSettings/AiProvidersSettings.tsx` — Main settings component

Shows provider cards (Anthropic, OpenAI) with:
- Connection status (Connected / Not Connected / Expired)
- "Connect" button → opens OAuth flow in browser
- "Disconnect" button for connected providers

Add to sidebar navigation:
- `GeneralSettings.tsx` — Add "AI Providers" entry with `HiOutlineCpuChip` icon
- `settings-state.ts` — Add `"ai-providers"` to `SettingsSection` type
- `layout.tsx` — Add route mapping
- `settings-search.ts` — Add search items

### Step 6: Model picker — connection indicator

Modify `ModelPicker.tsx`:
- Query provider connection status via tRPC
- Show a small indicator (lock icon or "Connect" link) next to provider groups that aren't authenticated
- Clicking opens the settings AI Providers page (or triggers OAuth directly)

## Files to create
1. `apps/desktop/src/main/lib/oauth/pkce.ts`
2. `apps/desktop/src/main/lib/oauth/types.ts`
3. `apps/desktop/src/main/lib/oauth/anthropic.ts`
4. `apps/desktop/src/main/lib/oauth/openai.ts`
5. `apps/desktop/src/main/lib/oauth/credential-store.ts`
6. `apps/desktop/src/main/lib/oauth/index.ts`
7. `apps/desktop/src/lib/trpc/routers/oauth/index.ts`
8. `apps/desktop/src/renderer/routes/_authenticated/settings/ai-providers/page.tsx`
9. `apps/desktop/src/renderer/routes/_authenticated/settings/ai-providers/components/AiProvidersSettings/AiProvidersSettings.tsx`
10. `apps/desktop/src/renderer/routes/_authenticated/settings/ai-providers/components/AiProvidersSettings/index.ts`

## Files to modify
1. `packages/local-db/src/schema/schema.ts` — Add `oauthCredentials` column
2. `apps/desktop/src/lib/trpc/routers/index.ts` — Register OAuth router
3. `apps/desktop/src/lib/trpc/routers/ai-chat/index.ts` — Inject credentials before agent calls
4. `apps/desktop/src/renderer/routes/_authenticated/settings/components/SettingsSidebar/GeneralSettings.tsx` — Add sidebar entry
5. `apps/desktop/src/renderer/stores/settings-state.ts` — Add `ai-providers` section type
6. `apps/desktop/src/renderer/routes/_authenticated/settings/layout.tsx` — Add route mapping
7. `apps/desktop/src/renderer/routes/_authenticated/settings/utils/settings-search/settings-search.ts` — Add search items
8. `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/ChatPane/ChatInterface/components/ModelPicker/ModelPicker.tsx` — Add connection status

## Key decisions
- **Storage**: Reuse `settings` table with a new JSON column rather than a new table (simpler, single-row pattern matches existing approach)
- **Token injection**: Set `process.env` before each call since Mastra reads it at runtime. Save/restore original values to avoid side effects.
- **OpenAI flow**: Uses local HTTP server on port 1455 for callback (same as pi-mono). Falls back to manual code paste if port is busy.
- **Anthropic flow**: Device code style — user pastes `code#state` from browser redirect. No local server needed.
