# OAuth Token Encryption Rollout Plan

## Goal

Encrypt third-party OAuth tokens (Linear, Slack, and related auth token fields) before storing them in Neon so tokens are not persisted as plaintext at rest in application-managed data.

## Scope

- Phase 1 (required): `integration_connections.access_token`, `integration_connections.refresh_token`
- Phase 2 (follow-up): `auth.accounts.access_token`, `auth.accounts.refresh_token`, `auth.accounts.id_token`
- Non-goal for this rollout: schema-level type changes (we can keep `text` columns and store encrypted payloads)

## Rollout Strategy

- Use application-layer encryption/decryption
- Encrypt on all writes immediately
- Dual-read during migration:
  - if value starts with `enc:v1:`, decrypt
  - else treat as legacy plaintext
- Backfill existing rows to encrypted form
- Remove plaintext fallback after migration reaches 100%

## Implementation Steps

### 1. Add shared crypto helper

- Status: Completed
- Create a shared utility (importable from API and tRPC runtimes) with:
  - `encryptOAuthToken(plaintext: string): string`
  - `decryptOAuthToken(value: string): string`
- Algorithm: AES-256-GCM with random IV and auth tag
- Output format: `enc:v1:<base64_payload>`
- Validate key length at startup and fail fast if invalid

### 2. Add environment configuration

- Status: Completed
- Add `OAUTH_TOKENS_ENCRYPTION_KEY` (base64-encoded 32-byte key) to server env
- Update env validation where required in:
  - `apps/api`
  - any server runtime that reads/writes these token fields
- Keep this key out of client-exposed env

### 3. Encrypt write paths

- Status: Completed
- Update Slack OAuth callback:
  - `apps/api/src/app/api/integrations/slack/callback/route.ts`
  - Encrypt before `insert` and `onConflictDoUpdate`
- Update Linear OAuth callback:
  - `apps/api/src/app/api/integrations/linear/callback/route.ts`
  - Encrypt before `insert` and `onConflictDoUpdate`

### 4. Decrypt read paths

- Status: Completed
- Decrypt tokens at point of use before SDK/API calls:
  - `packages/trpc/src/router/integration/linear/utils.ts`
  - `apps/api/src/app/api/proxy/linear-image/route.ts`
  - `apps/api/src/app/api/integrations/linear/jobs/initial-sync/route.ts`
  - Slack event handlers under `apps/api/src/app/api/integrations/slack/events/**`
- Ensure no consumer passes encrypted payload directly into provider SDKs

### 5. Backfill existing plaintext rows

- Status: Completed
- Add idempotent script in `packages/scripts`:
  - scan `integration_connections` in batches
  - if token is non-null and not prefixed `enc:v1:`, encrypt and update
- Include options:
  - `--dry-run`
  - `--batch-size`
  - logging/progress counters
- Run in staging first, then production

### 6. Testing

- Status: Completed
- Unit tests:
  - encrypt/decrypt roundtrip
  - invalid/missing key handling
  - tamper detection (auth tag failure)
  - plaintext fallback behavior during migration window
- Integration tests:
  - Slack/Linear callback stores prefixed encrypted token values
  - token-consuming flows still authenticate correctly

### 7. Deployment Sequence

1. Deploy code with dual-read + encrypt-on-write.
2. Validate new writes are `enc:v1:` in staging.
3. Run backfill in staging and verify flows.
4. Deploy to production.
5. Run production backfill.
6. Verify plaintext count is zero.
7. Remove plaintext fallback in a cleanup PR.

### 8. Post-rollout Security Actions

- Rotate/reconnect existing provider tokens where possible (defense-in-depth, since old plaintext may have been exposed historically)
- Extend the same pattern to Phase 2 auth token tables

## Success Criteria

- All new OAuth token writes are encrypted (`enc:v1:` prefix)
- Backfill converts all legacy plaintext tokens
- No regression in Slack/Linear integration behavior
- Plaintext fallback removed after completion
