# MiniMax Chat Provider — TODO

Implementation tasks for adding MiniMax as a first-class chat provider.

Each item is a small reviewable commit. Order: top to bottom.

## Phase 0: Bootstrap (DONE)
- [x] Fork superset-sh/superset to p1rat3/superset
- [x] Clone locally to /home/racie/projects/superset
- [x] Create branch `feat/minimax-chat-provider`
- [x] Trace chat architecture, save to ARCHITECTURE.md

## Phase 1: Provider IDs (foundation)
- [ ] 1.1 Add `MINIMAX_AUTH_PROVIDER_ID` to `packages/chat/src/server/shared/auth-provider-ids.ts`
- [ ] 1.2 Commit: `chore(chat): add MiniMax auth provider id`

## Phase 2: Auth resolver (Anthropic-shaped, since MiniMax exposes Anthropic protocol)
- [ ] 2.1 Create `packages/chat/src/server/desktop/auth/minimax/minimax.ts`
      - model: `getMiniMaxCredentialsFromAuthStorage(authStorage)`
      - reads from auth-storage, returns `MiniMaxCredentials` with apiKey
      - mirrors `getOpenAICredentialsFromAuthStorage` but without OAuth
- [ ] 2.2 Create `packages/chat/src/server/desktop/auth/minimax/index.ts`
- [ ] 2.3 Create `packages/chat/src/server/desktop/auth/minimax/minimax.test.ts`
- [ ] 2.4 Commit: `feat(chat): add MiniMax auth resolver`

## Phase 3: Chat-service integration
- [ ] 3.1 Add `getMiniMaxCredentials()` and `isMiniMaxAuthenticated` in chat-service.ts
- [ ] 3.2 Add `logAuthResolution("minimax", ...)` calls
- [ ] 3.3 Wire into the provider-selection logic (so when model id starts with `minimax/` or is in the MiniMax registry, route to MiniMax)
- [ ] 3.4 Commit: `feat(chat): route MiniMax requests through the chat service`

## Phase 4: Model registry
- [ ] 4.1 Find the source for the hardcoded `provider_registry_default`
      (likely under packages/chat/src/server/.../registry/ or similar)
- [ ] 4.2 Add `MiniMax-M3` to the `minimax-coding-plan` provider's models list
- [ ] 4.3 Also add M2.x models if missing
- [ ] 4.4 Commit: `feat(chat): add MiniMax-M3 to model registry`

## Phase 5: Settings UI
- [ ] 5.1 Find the source file for `renderer/assets/page-9llLG1MH.js` (the settings page)
- [ ] 5.2 Add a MiniMax section to the settings page mirroring Anthropic
      - API key field
      - Advanced section: baseUrl, extraEnv
      - "Connect MiniMax in Settings" / "Manage MiniMax in Settings" tooltip
- [ ] 5.3 Commit: `feat(chat-settings): add MiniMax provider section`

## Phase 6: Model picker
- [ ] 6.1 Find where the picker renders the model list
- [ ] 6.2 Ensure MiniMax-M3 shows up in the picker (should follow automatically from registry)
- [ ] 6.3 Add a "MiniMax" provider group header in the picker (like Anthropic/OpenAI)

## Phase 7: Tests
- [ ] 7.1 Test: getMiniMaxCredentialsFromAuthStorage returns null on empty storage
- [ ] 7.2 Test: getMiniMaxCredentialsFromAuthStorage returns key when present
- [ ] 7.3 Test: chat-service provider selection prefers MiniMax when configured
- [ ] 7.4 Test: registry includes MiniMax-M3
- [ ] 7.5 Commit: `test(chat): cover MiniMax provider selection and adapter`

## Phase 8: Docs
- [ ] 8.1 Create `docs/providers/minimax.md`
- [ ] 8.2 Update main docs index if it lists providers
- [ ] 8.3 Update `apps/desktop/src/renderer/...` README if it has one
- [ ] 8.4 Commit: `docs(chat): add MiniMax setup instructions`

## Phase 9: Verify
- [ ] 9.1 Build the desktop app on WSL (expect to need hacks for GPU)
- [ ] 9.2 Open Superset, set MiniMax API key, pick M3, send a test prompt
- [ ] 9.3 Confirm existing Anthropic + OpenAI providers still work
- [ ] 9.4 Commit any final fixes

## Blockers / Known issues
- The Superset desktop dev server doesn't officially support WSL/Linux — we'll
  need to either:
    a) Build a production bundle and test from there
    b) Hack the GPU/Weston issues in the dev server
    c) Only verify the API contracts with unit tests, defer GUI testing

## Time estimate
Phases 1-2: 1-2 hours
Phases 3-4: 1-2 hours
Phase 5: 1-2 hours (largest, requires finding the source for the compiled bundle)
Phase 6: 30 min - 1 hour
Phase 7: 1-2 hours
Phase 8: 30 min
Phase 9: 1+ hours (depending on WSL GPU hacks)

**Total: roughly 1-2 working days of focused work, not a single session.**
