# Validation Notes

## 2026-05-31 Picker Polish Pass

- Fixed model picker scroll performance by using a fixed-height virtualized list,
  disabling per-row runtime measurement, and avoiding scroll-triggered hover
  state churn.
- Fixed provider picker ordering so semantic model versions sort newest first,
  while parameter sizes such as `120b` do not outrank `gpt-5.5`.
- Fixed same-version ordering so base models like `gpt-5.5` appear before
  longer provider-specific variants like `gpt-5.5-ziyan`.
- Verified typo-tolerant search with a real provider-backed model list:
  searching `got-5.5` returned `gpt-5.5` first and `gpt-5.5-ziyan` second.
- Verified real desktop picker virtualization:
  - full list source contained 48 fetched models from the real relay provider
  - top render mounted 15 options, not the full list
  - bottom scroll still mounted 15 options
  - scroll height stayed virtualized at 2332 px with a 420 px viewport
- Verified real Chat path in an E2E workspace using the real relay provider:
  sent `Say exactly: model provider smoke ok` and received
  `model provider smoke ok`.
- Deleted the temporary E2E model provider after the real-provider check so the
  real credential is not left in the local provider registry.
- Restored the desktop app to the daily account before handoff; visible labels:
  `Biang` and `Biang Workspace`.
- Renderer console errors after real Chat validation: none.
- Artifacts:
  - `artifacts/14-model-picker-virtualized-sorted.png`
  - `artifacts/15-model-picker-virtualized-bottom.png`
  - `artifacts/16-model-picker-got-search-real-provider.png`
  - `artifacts/17-chat-real-provider-response.png`

## 2026-05-31 Picker Polish Commands

- `bun --cwd apps/desktop test src/renderer/components/Chat/ChatInterface/utils/modelOptions/modelOptions.test.ts src/renderer/components/Chat/ChatInterface/hooks/useSlashCommandExecutor/model-query.test.ts 'src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatPane/components/WorkspaceChatInterface/hooks/useSlashCommandExecutor/model-query.test.ts' 'src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatPane/components/WorkspaceChatInterface/components/ChatMessageList/utils/messageListHelpers.test.ts' src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/ChatPane/ChatPaneInterface/components/ChatMessageList/utils/messageListHelpers.test.ts`
  passed: 28 tests.
- `bun --cwd packages/host-service test src/model-providers/model-ref.test.ts src/model-providers/remote-models.test.ts src/model-providers/claude-settings.test.ts src/trpc/router/model-providers/model-providers.test.ts src/runtime/chat/chat.test.ts`
  passed: 15 tests.
- `bun --cwd apps/desktop typecheck` passed.
- `bun run lint:fix` passed; Biome fixed 4 files.
- `bun run lint` passed.
- `bun run typecheck` passed: 29 packages.

## Latest Pass

- `bun run lint:fix` passed and fixed formatting/import ordering.
- `bun run lint` passed.
- `bun run typecheck` passed: 29 packages.
- `bun --cwd apps/desktop test` passed: 2034 tests.
- `bun --cwd apps/desktop typecheck` passed.
- `bun --cwd packages/host-service typecheck` passed.
- `bun --cwd packages/host-service test src/model-gateway/gateway.test.ts src/runtime/chat/chat.test.ts src/providers/model-providers/RegistryModelProvider/RegistryModelProvider.test.ts src/trpc/router/model-providers/model-providers.test.ts` passed: 10 tests.
- `bun --cwd apps/desktop test src/renderer/components/ModelProviderIcon/ModelProviderIcon.test.ts` passed: 2 tests.

## Full Host-Service Test

- `bun --cwd packages/host-service test` was also run for breadth.
- Result: 714 pass, 8 todo, 1 fail.
- The failure is the known unrelated flaky real-daemon case:
  `terminal router integration > terminal disposal cleans up background process groups from real daemon sessions`.
- Failure mode: timeout waiting for real daemon process-group cleanup after 3000 ms.
- The model-provider, model-gateway, registry resolver, chat runtime, router, no-Electron-coupling, and desktop suites passed.

## Desktop Acceptance

- Account: `superset-e2e@local.test`.
- Workspace: `E2E Workspace`.
- Workspace id: `a042bbcf-9fa0-4409-be74-9a50d247b1a9`.
- The real Electron app was driven through Desktop Automation CLI at `http://localhost:3005`.
- The fake local provider was used for E2E data and stopped after validation.
- Chat E2E path:
  - Navigated to `/v2-workspace/a042bbcf-9fa0-4409-be74-9a50d247b1a9/chat`.
  - Selected model shown as `gpt-e2e-chat`.
  - Sent a real chat message through the renderer and host-service runtime.
  - Verified assistant response text: `E2E gateway reply: model provider chat path is working.`
- Settings and Chat picker icon polish:
  - Verified Settings > Models provider row, model families, and model chips render LobeHub static SVG icons.
  - Verified Chat model picker renders provider/model icons and keeps text/layout readable in dark theme.
- Post-E2E handoff:
  - Signed out of the disposable E2E account after validation.
  - Signed the real desktop app back into the developer's daily account.
  - Verified the visible organization label is `Biang`, confirmed `Biang Workspace` is available, and left the app on the V2 workspaces list for manual acceptance without creating extra daily-account test data.
- Artifacts:
  - `artifacts/06-chat-e2e-gateway-reply.png`
  - `artifacts/07-chat-route-smoke.png`
  - `artifacts/07-chat-route-smoke.json`
  - `artifacts/08-settings-models-lobe-icons.png`
  - `artifacts/09-chat-picker-lobe-icons.png`
  - `artifacts/10-chat-picker-lobe-icons-contrast.png`
  - `artifacts/11-settings-models-lobe-icons-contrast.png`

## Bug Notes

- Real desktop Chat initially failed with `Unauthorized` because `mastracode` read global auth during module import/runtime. The implementation now imports and runs the host-service chat stack under an organization-local Mastra home.
- After auth isolation, real desktop Chat failed with `Not Found` because the AI SDK sent Anthropic calls to `/model-gateway/messages` when `ANTHROPIC_BASE_URL` ended at `/model-gateway`.
- Gateway regression fix: the local model gateway now accepts both versioned and unversioned Anthropic-compatible endpoint shapes:
  - `GET /model-gateway/models`
  - `GET /model-gateway/v1/models`
  - `POST /model-gateway/messages`
  - `POST /model-gateway/v1/messages`

## Security Notes

- Real provider credentials were not used in automated tests.
- Real provider credentials were not written into code, tests, screenshots, or task notes.
- Router and helper tests cover remote model-list failures without leaking saved credentials.
- E2E screenshots and validation data use only fake provider names, fake model ids, and localhost URLs.

## 2026-05-31 Resend Regression Fix

- Root cause: persisted Mastra user turns can have role `signal`, while the
  runtime restart helper only accepted role `user`. Resend/edit from a rendered
  user bubble therefore rejected a valid stored user turn with
  `Only user messages can be edited or resent`.
- Fix: both chat runtime restart helpers now treat `user` and `signal` as
  restartable user turns, and still fall back from an assistant message id to
  the previous restartable user turn.
- Focused regression tests:
  - `bun --cwd packages/chat test src/server/trpc/utils/runtime/runtime.test.ts`
    passed: 12 tests.
  - `bun --cwd packages/host-service test src/runtime/chat/chat.test.ts`
    passed: 2 tests.
- Static checks:
  - `bun run lint:fix` passed; no fixes required after the final patch.
  - `bun run lint` passed.
  - `bun --cwd packages/chat typecheck` passed.
  - `bun --cwd packages/host-service typecheck` passed.
  - `bun run typecheck` passed: 29 packages.
- Spec sync: recorded the Mastra persisted `signal` role gotcha in
  `.trellis/spec/guides/terminal-and-host-runtime.md`.
- Desktop Automation CLI smoke:
  - Restarted `bun run --cwd apps/desktop dev` so Electron and host-service used
    the patched runtime.
  - Verified daily account labels were visible: `Biang Workspace`.
  - Clicked the visible Chat user bubble's `Resend message` action in the real
    V2 workspace.
  - Verified the page no longer contained
    `Only user messages can be edited or resent`.
  - The resulting visible runtime error was provider availability
    (`All credentials for model mimo-v2.5-pro are cooling down via provider ...`),
    which confirms resend reached model execution instead of failing at restart
    message validation.
  - Renderer console errors after the smoke: none.
- Artifacts:
  - `artifacts/06-resend-before.png`
  - `artifacts/07-resend-after.png`

## 2026-05-31 Claude Terminal PTY Daemon Path Fix

- Root cause: `@superset/host-service` daemon singleton resolved the pty-daemon
  script relative to `import.meta.url`. In Electron development builds,
  electron-vite code-splits host-service modules into `dist/main/chunks`, while
  `pty-daemon.js` is emitted at `dist/main/pty-daemon.js`. The resolver checked
  only the current directory, then fell back to a source layout path, producing
  the invalid `apps/desktop/pty-daemon/dist/pty-daemon.js`.
- Fix: daemon script resolution now checks both `here/pty-daemon.js` and
  `here/../pty-daemon.js` before falling back to `packages/pty-daemon/dist`.
- Regression test:
  - `bun --cwd packages/host-service test src/daemon/singleton.test.ts` passed:
    8 tests.
- Static checks:
  - `bun --cwd packages/host-service test src/daemon/singleton.test.ts src/runtime/chat/chat.test.ts`
    passed: 10 tests.
  - `bun --cwd packages/host-service typecheck` passed.
  - `bun run lint:fix` passed; no fixes required.
  - `bun run lint` passed.
  - `bun run typecheck` passed: 29 packages.
- Desktop Automation CLI smoke:
  - Let `bun run --cwd apps/desktop dev` rebuild and restart Electron after the
    daemon resolver change.
  - In the real V2 workspace, clicked the top `Claude` agent control.
  - Verified the page no longer contained `script not found at` or
    `has the daemon binary been bundled`.
  - Verified host-service log spawned the daemon from
    `apps/desktop/dist/main/pty-daemon.js`, the daemon listened on its Unix
    socket, and bootstrap completed for the daily organization.
  - No screenshot artifact was captured for this smoke because the active
    Claude model-config surface renders local agent env values.
- Spec sync: recorded the electron-vite `dist/main/chunks` gotcha in
  `.trellis/spec/guides/terminal-and-host-runtime.md`.

### Break-Loop Reflection

- Root cause category: implicit assumption plus test coverage gap. The resolver
  assumed compiled host-service modules live beside `pty-daemon.js`, but
  electron-vite can put those modules in `dist/main/chunks`.
- Why it escaped: prior validation proved Claude settings writes and model tabs,
  but did not force the terminal daemon bootstrap path after the Electron bundle
  restarted. Unit tests also covered singleton plumbing, not the bundled
  `chunks` layout.
- Prevention added:
  - unit test for resolving from `dist/main/chunks` to `dist/main/pty-daemon.js`
  - terminal runtime spec guidance requiring bundled path resolver tests
  - terminal/agent desktop smoke guidance to create or attach a real session and
    check daemon bootstrap logs

## 2026-05-31 Model Selector Grouping And Models Panel Cleanup

- Scope:
  - Reworked the shared desktop model catalog helper so Chat and Code model
    selectors use the same model-family grouping, version-desc sorting, and
    punctuation/typo-tolerant search.
  - Grouping now treats GPT and Codex as the same OpenAI family, recognizes GLM
    separately, and avoids confusing provider protocol with model vendor.
  - Workspace Code > Models now uses searchable provider/model popovers for the
    Claude Code Haiku/Sonnet/Opus aliases.
  - Removed the redundant Code Models panel status/header cards:
    `Agent Models`, gateway/provider/model/settings summary, and selected
    provider credential/base URL details.
- Regression tests:
  - `bun test apps/desktop/src/renderer/components/Chat/ChatInterface/utils/modelOptions/modelOptions.test.ts apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceSidebar/components/ModelsTab/ModelsTab.test.ts`
    passed: 12 tests.
- Static checks:
  - `bun --cwd apps/desktop typecheck` passed.
  - `bun run lint` passed.
  - `bun run typecheck` passed: 29 packages.
- Desktop Automation CLI smoke:
  - Verified the real app was on the daily account (`Biang`) before and after
    the smoke.
  - Code Models panel: verified `Agent Models`, `Gateway`, and
    `Credential saved` panel text is absent; opened the Haiku model selector,
    typed `got-5.5`, and confirmed the OpenAI group still shows `gpt-5.5`
    results.
  - Chat model selector: opened the real Chat model picker, typed `glm`, and
    confirmed only the `GLM` group/model results were visible; reopened and
    typed `got-5.5`, confirming the typo still matches `gpt-5.5`.
  - Renderer console errors after the smoke: none.
- Artifacts:
  - `artifacts/08-code-models-search.png`
  - `artifacts/09-chat-model-search.png`

## 2026-05-31 Claude Code Raw Model Env Fix

- Root cause: Claude Code worktree settings were using the internal encoded
  model reference (`superset:...`) that was designed for app-side routing, not
  for user-visible terminal configuration.
- Fix: `saveWorkspaceClaudeConfig` now writes raw provider-local model IDs into
  `.claude/settings.local.json`:
  - `ANTHROPIC_DEFAULT_HAIKU_MODEL`
  - `ANTHROPIC_DEFAULT_SONNET_MODEL`
  - `ANTHROPIC_DEFAULT_OPUS_MODEL`
- Routing remains provider-safe because Claude Code calls the local
  `/model-gateway` with the workspace gateway token; the token binds the request
  to the configured provider, so the raw `gpt-5.5` model name is enough inside
  that worktree.
- Encoded model refs are still accepted for Chat/internal compatibility, but
  should not be written into user-facing Claude Code env values.
- Focused regression tests:
  - `bun --cwd packages/host-service test src/trpc/router/model-providers/model-providers.test.ts src/model-gateway/gateway.test.ts`
    passed: 8 tests.
- Static checks:
  - `bun --cwd packages/host-service typecheck` passed.
  - `bun run typecheck` passed: 29 packages.
- Local settings verification:
  - `/Users/bichengyu/Documents/toolProject/glass-easel-ai/.claude/settings.local.json`
    contains raw `gpt-5.5` values for Haiku/Sonnet/Opus.
  - The checked model env values do not contain `superset:`.

## 2026-05-31 V2 Workspace Switch Update Loop Fix

- Symptom: opening the real V2 workspace showed the app error boundary with
  `Maximum update depth exceeded`.
- Root cause: the shared `@superset/ui/switch` wrapper imported
  `@radix-ui/react-switch`. In the React 19 desktop renderer, Radix Switch's
  callback ref repeatedly called internal `setButton` during the V2 workspace
  Models tab mount path.
- Fix: replaced the shared Switch with a lightweight local accessible
  `button[role="switch"]` implementation that preserves `checked`,
  `defaultChecked`, `onCheckedChange`, `disabled`, `data-state`, and existing
  visual classes.
- Regression coverage:
  - `bun test packages/ui/src/components/ui/switch.test.tsx` passed.
  - `bun --cwd apps/desktop test 'src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceSidebar/components/ModelsTab/ModelsTab.test.ts'`
    passed: 2 tests.
- Static checks:
  - `bun --cwd packages/ui typecheck` passed.
  - `bun --cwd apps/desktop typecheck` passed.
  - `bun run typecheck` passed: 29 packages.
  - `bun run lint` passed.
- Desktop Automation CLI smoke:
  - Restarted `bun run --cwd apps/desktop dev` after clearing
    `apps/desktop/node_modules/.vite/deps`.
  - Verified the real app loads
    `#/v2-workspace/5480dba1-5592-4fb9-bde1-9273dc6ce640` without the error
    boundary.
  - Verified DOM flags:
    `hasErrorPage=false`, `hasMaxUpdateDepth=false`,
    `hasRadixSwitchScript=false`, `hasModelsPanel=true`.
  - Clicked `Save Claude Code Models` in the real Models tab.
  - Verified the worktree settings file still writes raw model IDs and no
    `superset:` values:
    Haiku/Sonnet/Opus are all `gpt-5.5`.
  - Renderer console errors after the smoke: none.
- Artifact:
  - `artifacts/10-switch-loop-fixed.png`

## 2026-05-31 Local Model Provider Icons

- Scope:
  - Replaced remote model/provider icon loading with bundled local SVG assets.
  - Desktop `ModelProviderIcon` now resolves inferred model families through
    `@superset/ui/icons/model-providers` instead of
    `unpkg.com/@lobehub/icons-static-svg`.
  - `@superset/ui` `ModelSelectorLogo` now resolves bundled provider logos
    instead of `https://models.dev/logos/...`.
  - Unknown providers fall back to a local initial badge instead of a broken
    image request.
- Asset notes:
  - Bundled assets live under
    `packages/ui/src/assets/icons/model-providers/`.
  - The local model provider icon directory is 472 KB.
  - `models.dev` `anthropic.svg` timed out during mirroring, so Anthropic falls
    back to the already bundled Lobe `anthropic.svg` asset.
- Regression tests:
  - `bun test packages/ui/src/assets/icons/model-providers/index.test.ts packages/ui/src/components/ai-elements/model-selector.test.tsx apps/desktop/src/renderer/components/ModelProviderIcon/ModelProviderIcon.test.ts`
    passed: 6 tests.
- Static checks:
  - `bun --cwd packages/ui typecheck` passed.
  - `bun --cwd apps/desktop typecheck` passed.
  - `bun run typecheck` passed: 29 packages.
  - `bun run lint` passed.
- Source check:
  - `rg -n "unpkg\\.com/@lobehub|models\\.dev/logos|LOBE_ICON_CDN_BASE|https://models\\.dev" apps/desktop/src packages/ui/src apps/web/src -g '*.tsx' -g '*.ts'`
    returned no implementation matches.
- Desktop Automation CLI smoke:
  - Opened the real V2 workspace Models tab.
  - Verified `Save Claude Code Models` was visible.
  - Verified `remoteModelIconCount=0` for image URLs containing `unpkg.com` or
    `models.dev`.
  - Renderer console errors after the smoke: none.
- Artifact:
  - `artifacts/11-local-model-icons.png`

## 2026-05-31 Model Search Numeric Regression Fix

- Symptom: searching `5.4` in the Chat model picker could show unrelated rows
  because punctuation-insensitive search normalized `5.4` to `54`.
- Root cause: numeric fuzzy matching could consider hidden routing/internal
  fields such as provider ids or encoded model refs. Those fields are useful for
  routing, but they are not what the user is searching for.
- Fix: numeric-only searches now match only user-visible model fields:
  `model.name` and provider-local `modelId`. Text searches still use broader
  provider/family keywords and the `got` to `gpt` typo correction.
- Regression coverage:
  - `bun --cwd apps/desktop test src/renderer/components/Chat/ChatInterface/utils/modelOptions/modelOptions.test.ts src/renderer/components/Chat/ChatInterface/hooks/useSlashCommandExecutor/model-query.test.ts 'src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatPane/components/WorkspaceChatInterface/hooks/useSlashCommandExecutor/model-query.test.ts'`
    passed: 23 tests.
- Desktop Automation CLI smoke:
  - Verified the real app is on the daily account (`Biang`) in the real V2 Chat
    workspace.
  - Opened the Chat model picker and typed `5.4`.
  - Verified the visible options were exactly `gpt-5.4`, `gpt-5.4-mini`, and
    `gpt-5.4-ziyan`.
  - Verified unrelated rows such as `gpt-5.5`, `gpt-5.3`, `deepseek`, and `glm`
    were not visible.
  - Renderer console errors after the smoke: none.
- Spec sync:
  - Recorded the visible-field-only numeric search rule in
    `.trellis/spec/ui/frontend/component-guidelines.md`.
- Artifact:
  - `artifacts/12-model-search-54-filtered.png`
