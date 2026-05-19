# Team Contributions

This PRD was synthesized from the work of three specialist planners running in parallel against the 2026-05-18 v2 red-hat review. No interactive `kb-prd-plan` team-collaboration phases were run (the user opted for direct planner dispatch); planner outputs were merged into the functional groups by the PRD owner.

## Phase 1 — User Personas (skipped)

Skipped at user request along with the four mandatory human signals. Roles in `02-roles.md` are derived from the red-hat review's stakeholder inferences (User, Developer, Operator, Reviewer) rather than fresh persona work. Re-elicit if scope grows beyond polish.

## Phase 2 — Architecture (planner-driven, no live team)

The three planners produced layer-scoped architecture findings:

### react-vite-planner (renderer)
- **Group**: V2 Renderer Polish (`V2UI`)
- **UCs proposed**: 10 (7 admitted to this PRD; 3 deferred to a follow-up cleanup PRD)
- **Components touched**: `useWorkspaceChatDisplay`, `ChatPaneInterface`, `WorkspaceClientProvider`, `optimisticUserMessage`, `PendingQuestionMessage`, `messageListHelpers`, `ChatPane` + `ChatPaneTitle`
- **New utilities introduced**: shared `useChatPaneController` provider, `useLatestRef`-style ref helper for unmount cleanup, adaptive-fps wrapper consuming `displayState.isRunning` + `document.visibilityState`, consolidated `getActiveTurnAssistantPredicate`, reference-counted cache entry
- **Cross-layer flags**: `commands.stop()` on unmount must coordinate with host-service drain (UC-V2UI-07 ↔ UC-HOST-08); `useChatDisplay` removes `abort` field once host-service commits to `stop`-only (UC-V2UI-01 area ↔ UC-RUN-02); idle polling rate depends on host-service tolerating 1 fps polling (and points toward future WS subscription)

### electron-planner (non-renderer dataflow + supervisor)
- **Group**: Host-Service Lifecycle & IPC Security Hardening (`HOST`)
- **UCs proposed**: 16 (10 admitted; 6 deferred — port TOCTOU, tunnel hardening, test auth-bypass cleanup, etc.)
- **Components touched**: `preload/index.ts`, `lib/trpc/index.ts`, `host-service-coordinator/index.ts`, `main/lib/host-service-coordinator.ts`, `main/lib/host-service-manifest.ts`, `main/lib/host-service-utils.ts`, `main/host-service/index.ts`, `packages/host-service/src/app.ts`, `tunnel/tunnel-client.ts`, `notifications/notifications.ts`, `no-electron-coupling.test.ts`
- **New tRPC primitives**: `protectedProcedure`, `orgScopedProcedure` (UC-HOST-03)
- **Supervisor work**: pane-close drain on `before-quit` (UC-HOST-08); deferred to follow-up: crash circuit breaker mirroring `DaemonSupervisor`
- **New secure-storage layer**: Electron `safeStorage` wrapper at `apps/desktop/src/main/lib/secure-storage.ts` (UC-HOST-05)
- **Cross-layer flags**: ChatService extraction (UC-HOST-09) requires mastra to consume credentials via IPC handshake (`creds.refresh` channel); per-session ownership (UC-RUN-06) needs window-claim plumbing from Electron main; preload allowlist (UC-HOST-01) requires renderer sweep to enumerate v1 + v2 channels

### mastra-planner (Mastra runtime)
- **Groups proposed**: Group A (`RUN`) v2 Mastra Runtime Polish — 13 UCs; Group B (`OBS`) Agent Observability & Guardrails — 6 UCs
- **UCs admitted to this PRD**: 8 from Group A; the entire `OBS` group is **deferred to a separate PRD** (greenfield observability infra is its own initiative)
- **Components touched**: `runtime/chat/chat.ts`, `trpc/router/chat/chat.ts`, `trpc/index.ts`, `providers/model-providers/utils/runtime-env/runtime-env.ts`, `LocalModelProvider`, `resolveAnthropicCredential`, `app.ts`, `no-electron-coupling.test.ts`, `title-generation.ts`
- **Two confirmed Category-3 stubs surfaced**: `abort: async () => undefined` (UC-RUN-02), `getMcpOverview` returning hardcoded `never[]` (UC-RUN-03)
- **Critical multi-tenant fix**: per-invocation credential scoping (UC-RUN-01) — the v1 `process.env` race is worse in v2's long-running Bun process serving concurrent sessions
- **Feature regression flagged**: v2 silently dropped session title generation (UC-RUN-07)
- **Cross-layer flags**: `stop`-only contract (UC-RUN-02 ↔ UC-V2UI-01 area); per-session ownership (UC-RUN-06 ↔ window-claim plumbing); ChatService relocation (UC-RUN coordinates with UC-HOST-09); OAuth refresh consumes the `creds.refresh` IPC channel

## Phase 3 — UI Infrastructure (skipped)

Skipped. This PRD does not introduce new UI tokens, new design libraries, or new component primitives — all work reuses the existing `@superset/ui` patterns. UC-V2UI-04 (`select-text cursor-text` on error UI) reuses the existing chat error token set and applies the project's selectable-text rule per `apps/desktop/AGENTS.md`. If implementers find hardcoded hex/spacing during the work, they should flag those as token-extraction opportunities per the project's Modular-First rule.

## Phase 4 — Holdout Scenarios (deferred)

Deferred. The kb-prd-plan default generates 3-5 hidden scenarios per UC into `.spec/scenarios/{uc-id}/*.scenario.md`. With 25 UCs that would be 75-125 scenario files, and the polish UCs are themselves remediations of red-hat findings (each UC has its evidence baked into the source file:line citation). Recommend re-running the scenario phase only for the security-critical UCs (UC-HOST-01, 02, 04; UC-RUN-01, 06) where adversarial scenarios add real value.

## Phase 5 — Synthesis (this PRD)

Synthesis distilled the three planner outputs through these rules:
1. **Stub fixes are uncuttable** (SUPREME RULE compliance): UC-RUN-02 and UC-RUN-03 are non-negotiable.
2. **CRITICAL findings are uncuttable**: UC-RUN-01 (process.env race), UC-HOST-01/02/04 (authorization gaps), UC-HOST-09 (architectural).
3. **Cross-layer pairs were not merged into single UCs** (each layer owns its half with cross-references): abort/stop, pane-close drain, session ownership, ChatService extraction.
4. **OBS group deferred** as a separate PRD because observability + evals is greenfield infra, not polish of existing surfaces.
5. **Lower-severity items deferred** to a follow-up cleanup PRD: V2-L1, V2-L4–L8; V2-M6, M8 (full circuit breaker), M9, M13, M14, M15, M16.
6. **UC count ceiling enforced** at 25 (kb-prd-plan limit) by deferring lower-severity items rather than splitting the PRD.
