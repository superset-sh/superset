# Fix: API keys overwritten by OAuth connect/disconnect cycle

## Problem

Settings > Models "API key" field writes to the same auth.json slot as OAuth. When a user:
1. Saves an API key → `authStorage.set("anthropic", { type: "api_key", key: "sk-..." })`
2. Connects OAuth → `authStorage.login("anthropic", ...)` overwrites with `{ type: "oauth", ... }`
3. Disconnects OAuth → `authStorage.remove("anthropic")` deletes everything

The API key is lost. The model picker shows "disabled" even though the user saved a key.

Chat still works because `createMastraCode`'s model resolution reads from env vars / external config independently of this status check.

## Root cause

`setApiKeyForProvider` uses `authStorage.set(providerId, credential)` which writes to the main provider slot. OAuth also writes to the same slot. They collide.

mastracode's `AuthStorage` has **two separate storage mechanisms**:
- `set(providerId, credential)` / `get(providerId)` → main slot (`"anthropic"` in auth.json)
- `setStoredApiKey(providerId, key)` / `getStoredApiKey(providerId)` → dedicated API key slot (`"apikey:anthropic"` in auth.json)

We're using the wrong one for API keys.

## Fix

### `auth-storage-utils.ts`

**`setApiKeyForProvider`**: switch from `authStorage.set()` to `authStorage.setStoredApiKey()`.

**`clearApiKeyForProvider`**: clear the `apikey:` slot. Use `authStorage.set("apikey:<providerId>", ...)` with a removal, or check `hasStoredApiKey` and handle accordingly. Since mastracode doesn't expose `removeStoredApiKey`, use `authStorage.remove("apikey:<providerId>")`.

**`resolveAuthMethodForProvider`**: after checking the main slot, also check `authStorage.hasStoredApiKey(providerId)` as a fallback → return `"api_key"`.

### `chat-service.ts`

No changes needed — `getAnthropicAuthStatus` and `getOpenAIAuthStatus` already delegate to `resolveAuthMethodForProvider` which will now find stored API keys.

The `setStoredAnthropicApiKeyFromEnvVariables` helper in `disconnectAnthropicOAuth` should also use `setStoredApiKey` for consistency, but it's less critical since it reads from the env config file.

## Behavior after fix

| Action | `"anthropic"` (main) | `"apikey:anthropic"` (dedicated) |
|---|---|---|
| Save API key (Settings) | unchanged | written |
| Connect OAuth | overwritten with OAuth | survives |
| Disconnect OAuth | removed | survives |
| Auth status check | reads both | ← |

## Side effect: small-model tasks

`getSmallModel` reads `apikey:anthropic` from auth.json directly. Currently, API keys saved via Settings go to the main `"anthropic"` slot, so `getSmallModel` doesn't find them. After this fix, saved API keys land in `apikey:anthropic` where `getSmallModel` already looks → branch naming works for Settings-saved keys without any additional change.

## Scope

- `packages/chat/src/server/desktop/chat-service/auth-storage-utils.ts` (~15 LOC changed)
- `packages/chat/src/server/desktop/chat-service/chat-service.ts` — `setStoredAnthropicApiKeyFromEnvVariables` updated for consistency (~2 LOC)
- Tests in `chat-service.test.ts` if any mock `setApiKeyForProvider` behavior
