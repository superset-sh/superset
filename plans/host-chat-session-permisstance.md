# Claude Agent SDK session persistence and privacy follow-up

> **Status: hypothetical fallback; not approved for implementation.** This plan was written against the [direct Claude Agent SDK harness](./session-harness-claude-agent-sdk.md), which was **not** selected — the shipped implementation is the ACP harness ([session-harness-acp.md](./session-harness-acp.md)). The managers, routes, and screens named below do not exist in the codebase. Kept only in case the direct-SDK path is revisited.

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: this plan follows `AGENTS.md` and the ExecPlan template in `.agents/commands/create-plan.md`.

## Purpose / Big Picture

Superset should eventually let a user find a Claude session after the desktop host restarts and, when the user explicitly opts in, see a short-lived cross-device preview while that host is offline. The implementation must preserve the Claude installation's native transcript as conversation truth, avoid uploading sensitive execution data by default, and make every remote retention choice visible and reversible.

The proposed product has three deliberately separate layers. A host-local binding can reconnect a Superset session to a Claude-native transcript on the same machine. A remote Superset directory can contain only coarse metadata needed to identify sessions across devices. A separate, optional remote cache can retain an allowlisted subset of text for a bounded time-to-live, abbreviated as TTL, after which reads treat it as deleted even if asynchronous physical cleanup has not yet run.

This plan must not turn the Superset cloud into a second Claude transcript store. Tool calls, tool results, images, attachments, hidden reasoning, system prompts, permission payloads, local file paths, raw errors, and raw SDK event objects are outside the proposed remote cache.

## Assumptions

The currently executing direct-SDK plan remains live-only. `ClaudeSessionManager` owns sessions in memory, `sessions.list` reports those live runtimes, mobile does not register Claude sessions in cloud `chat_sessions`, and a host-service restart clears the list.

Claude's JSONL files under the user's Claude configuration directory remain the authoritative durable transcript. Superset reads them through Claude Agent SDK helpers such as `getSessionMessages`; Superset does not copy the full transcript into host SQLite or cloud Postgres.

The remote cache is off by default. Enabling it requires an explicit user or organization choice with a plain-language disclosure that even ordinary user and assistant text can contain source code, credentials, file contents, or other sensitive material. Automated secret redaction is defense in depth, not a security boundary and not a substitute for opt-in.

No implementation may delete a Claude-native transcript unless Superset can prove it created or owns that transcript and the user explicitly requests deletion. Removing a Superset binding or cloud cache must not silently delete user-owned Claude data.

## Open Questions

- Q1, host-local ownership: Should host-local persistence be enabled by default because it never leaves the machine, or should it also require opt-in? This affects the settings UX, migration defaults, and acceptance tests. Decision Log placeholder D6.

- Q2, logical session versus attempt: Should one Superset session point to one Claude-native ID forever, or may explicit Retry create multiple native attempts under one logical session? If attempts are retained, the plan must define which attempt opens by default and how older attempts remain inspectable. Decision Log placeholder D7.

- Q3, remote directory consent: Is coarse remote metadata part of the normal Superset cross-device product, or independently opt-in? The minimum candidate fields are Superset session ID, organization/user/workspace/host IDs, harness kind, a neutral or user-entered title, coarse lifecycle state, and timestamps. Decision Log placeholder D8.

- Q4, cache contents: Is the allowlist limited to a locally generated summary, or may it include user text and assistant text? A summary is smaller but still sensitive and costs model work; raw text is useful but carries more risk. Decision Log placeholder D9.

- Q5, TTL: What are the default, minimum, and maximum retention periods? The implementation needs both logical expiry at read time and reliable physical deletion. Decision Log placeholder D10.

- Q6, encryption: Is ordinary server-side encryption at rest sufficient, or must cached text be end-to-end encrypted so Superset's servers cannot read it? End-to-end encryption changes search, Electric sync, key recovery, organization administration, and multi-device onboarding. Decision Log placeholder D11.

- Q7, opt-out and deletion: Does disabling cache delete existing cached rows immediately, and what audit evidence proves deletion without retaining the sensitive content itself? Decision Log placeholder D12.

- Q8, multiple hosts: A Claude transcript is machine-local. The plan must decide what a session means if its workspace moves to another host or a user has two hosts for the same project. Decision Log placeholder D13.

## Progress

- [x] (2026-07-10) Separated this work from the live-only direct-SDK v1 plan.
- [x] (2026-07-10) Recorded the initial three-tier direction: host-local binding, remote metadata directory, and opt-in TTL text cache.
- [x] (2026-07-10) Established the initial remote denylist: no tool calls/results, images, attachments, hidden reasoning, system prompts, permission/dialog payloads, local paths, raw errors, or raw SDK events.
- [ ] Run the data-classification and SDK-native-persistence spike in Milestone 0.
- [ ] Resolve Q1-Q8 and update the Decision Log before production schema work.
- [ ] Implement and validate host-local bindings behind the agreed policy.
- [ ] Implement the minimal remote session directory behind the agreed policy.
- [ ] Implement the opt-in TTL cache only if its privacy and encryption design is approved.
- [ ] Complete security, retention, mobile, host-restart, and cross-organization acceptance tests.

## Surprises & Discoveries

- Observation: The ACP v1 implementation did not persist ACP sessions in cloud `chat_sessions` or host SQLite. Mobile merged ordinary Electric-backed chat rows with a live list fetched from the host, and process death removed ACP sessions from that list.
  Evidence: `apps/mobile/screens/(authenticated)/workspace/[id]/chat/ChatSessionsScreen.tsx` and `packages/host-service/src/runtime/acp-sessions/acp-sessions.ts` in the ACP implementation trajectory.

- Observation: A durable mapping becomes necessary only when Superset keeps a stable logical session ID while a retry or other lifecycle operation changes the active Claude-native ID. If one public session always equals one native attempt, SDK-native ID lookup may eliminate the mapping.
  Evidence: `Options.sessionId`, `Options.resume`, `getSessionInfo`, and `listSessions` in the installed Claude Agent SDK declarations.

- Observation: A content-type denylist applied after accepting arbitrary SDK payloads is too fragile. New SDK variants could bypass it. The remote cache should instead accept only a small, versioned allowlist of purpose-built cache entry types.
  Evidence: the SDK event union includes tool, image, system, dialog, elicitation, and future informational variants that should never be serialized wholesale to the cloud.

## Decision Log

- Decision D1: Keep the current direct-SDK v1 live-only and place persistence in this separate follow-up plan.
  Rationale: The live runtime, relay transport, approvals, interruption, and mobile UI can be validated without prematurely choosing a data-retention model.
  Date/Author: 2026-07-10, Kirill and Codex.

- Decision D2: Treat Claude-native JSONL as transcript truth; neither host SQLite nor cloud Postgres stores a second full transcript.
  Rationale: Duplicate transcripts introduce drift, deletion ambiguity, larger breach impact, and avoidable storage complexity.
  Date/Author: 2026-07-10, Kirill and Codex.

- Decision D3: Separate host-local recovery data, remote directory metadata, and remote cached content into independent schemas and policies.
  Rationale: They solve different problems and carry substantially different privacy risks. Enabling one must not silently enable another.
  Date/Author: 2026-07-10, Kirill and Codex.

- Decision D4: Remote cached content is opt-in and structurally allowlisted. Raw SDK event objects are never accepted by the cache API.
  Rationale: Unknown future event variants must fail closed instead of being uploaded accidentally.
  Date/Author: 2026-07-10, Kirill and Codex.

- Decision D5: Tool calls and results, images, attachments, hidden reasoning, system prompts, permission/dialog/elicitation payloads, local paths, and raw errors are never stored in the remote cache.
  Rationale: These categories have high sensitivity, large payloads, or both, and are unnecessary for a high-level offline session preview.
  Date/Author: 2026-07-10, Kirill and Codex.

- Decision D6: Host-local persistence default and consent model.
  Rationale: Pending Q1.
  Date/Author: pending.

- Decision D7: Logical-session and native-attempt cardinality.
  Rationale: Pending Q2.
  Date/Author: pending.

- Decision D8: Remote directory consent and exact metadata.
  Rationale: Pending Q3.
  Date/Author: pending.

- Decision D9: Remote cache content allowlist.
  Rationale: Pending Q4.
  Date/Author: pending.

- Decision D10: TTL bounds and physical deletion service level.
  Rationale: Pending Q5.
  Date/Author: pending.

- Decision D11: Remote cache encryption and key ownership.
  Rationale: Pending Q6.
  Date/Author: pending.

- Decision D12: Opt-out deletion and audit semantics.
  Rationale: Pending Q7.
  Date/Author: pending.

- Decision D13: Cross-host ownership and migration behavior.
  Rationale: Pending Q8.
  Date/Author: pending.

## Outcomes & Retrospective

This follow-up has not been implemented. Its present outcome is a clear boundary: the direct-SDK v1 remains simple and live-only while persistence receives a separate privacy and state-ownership review.

## Context and Orientation

Superset is a Bun and Turborepo monorepo. The affected applications are `apps/desktop`, which starts a host-service child process on the user's machine; `apps/mobile`, which reaches that host through the relay; and potentially `apps/api`, which serves authenticated cloud operations. The affected packages are `packages/host-service`, `packages/session-protocol`, `packages/db`, and `packages/trpc`.

The active runtime lives in `packages/host-service/src/runtime/sessions/sessions.ts`. Each live `ManagedSession` owns an SDK Query, an asynchronous input queue, current controls and pending callbacks, a bounded sequence journal, and WebSocket subscribers. The sequence journal repairs brief client disconnections; it is not durable history.

The shared wire contract lives in `packages/session-protocol`. Mobile calls host tRPC procedures through `apps/mobile/lib/host-service/sessions-client.ts`, attaches to the sequence WebSocket, reads native history, and folds those inputs into a renderable timeline in `apps/mobile/screens/(authenticated)/workspace/[id]/claude/[sessionId]/hooks/useClaudeSessionThread/useClaudeSessionThread.ts`.

The host's existing local SQLite schema is `packages/host-service/src/db/schema.ts`. It stores machine-owned workspace and terminal data. A future local binding belongs here only after Q1, Q2, and Q8 are resolved. It must not contain message bodies or journal frames.

The cloud schema is `packages/db/src/schema/schema.ts`, and authenticated application procedures live in `packages/trpc/src/router`. Existing mastra chat rows use cloud `chat_sessions` and Electric sync. A future Claude directory should use an explicit harness/runtime discriminator rather than a magic title. Cloud migration work must follow `AGENTS.md`: create a Neon branch, modify Drizzle schema source, and ask the user to run `drizzle-kit generate`; never hand-edit generated files and never touch production data without explicit confirmation.

The privacy hierarchy is:

    authoritative live execution: host SDK Query
    authoritative durable content: Claude-native JSONL on that host
    host-local recovery pointer: optional Superset-to-native binding
    remote directory: optional/coarse Superset metadata
    remote content cache: optional, expiring, incomplete text projection

Lower entries in this hierarchy must never overwrite or contradict higher entries. A stale cloud status cannot resurrect a process. A cached preview cannot answer a permission request. A remote directory row cannot prove that a native transcript still exists on its original host.

## Plan of Work

### Milestone 0: Classify data and prove SDK-native recovery boundaries

Time-box a read-only spike to one working day. Capture representative SDK messages for ordinary text, partial streaming, Bash and file tools, AskUserQuestion, ExitPlanMode, user dialogs, MCP elicitation, images, attachments, errors, interruption, and retry. For each shape, identify the fields that would cross a proposed directory or cache boundary. The spike must use synthetic markers rather than real source code or credentials.

In the same spike, exercise `sessionId`, `resume`, `getSessionInfo`, `listSessions`, and multiple fresh attempts against a temporary workspace. Determine whether the public Superset ID can equal the native Claude ID, what metadata Claude already persists, and which controls are restored by native resume without a Superset record. Do not add production tables during this milestone.

Acceptance is a completed data-classification section in this plan, resolved evidence for Q2, and a test transcript showing exactly which state survives process restart. No user data may appear in the artifact.

### Milestone 1: Add the smallest host-local recovery binding

After Q1, Q2, and Q8 are resolved, add only the local fields necessary to find the active native transcript and verify workspace/host ownership. The likely location is `packages/host-service/src/db/schema.ts`, but the schema must follow the chosen one-to-one or one-to-many attempt model. Do not store messages, tool payloads, images, errors, journals, or copies of Claude JSONL.

Refactor `ClaudeSessionManager.create` into an explicit create-or-resume operation. A missing or deleted native transcript must produce a visible terminal state and must never silently attach to an unrelated transcript. Retry must either allocate a new public session or record a new owned attempt according to D7. Unit tests must prove that a binding cannot cross workspaces or hosts.

Acceptance requires a real host-service restart against a throwaway workspace: the same session reappears only on its owning host, native history is read through the SDK, and no message content exists in host SQLite.

### Milestone 2: Add a coarse remote Superset session directory

After D8 is resolved, add a first-class cloud session record or extend the appropriate existing record with an explicit runtime kind. The schema must avoid native Claude IDs, cwd values, local paths, prompt-derived automatic titles, raw errors, permission state, and content. Prefer a neutral title until the user explicitly names a session.

Writes must be authenticated and idempotent. The organization, user, workspace, and host ownership checks must match existing Superset access rules. Mobile should merge directory records with live host state: live host state wins when connected; otherwise the directory row is shown as offline or not running and every mutation is disabled.

Acceptance requires two authenticated devices in the same organization to see the same high-level row, a user in another organization to receive no row, and a host-offline device to show no fabricated live status or content.

### Milestone 3: Add the opt-in TTL text cache

Do not begin until D9-D12 are resolved. Define a versioned cache-entry schema that can represent only approved content kinds. The initial candidate allowlist is locally generated `session_summary`, `user_text`, and `assistant_text`; implementation may narrow this further but may not widen it without a new decision entry. The ingestion API must reject unknown kinds and any object containing tool, image, attachment, system, reasoning, permission, dialog, elicitation, path, or raw-error payloads.

Each entry needs a stable idempotency key, organization/user/session ownership, creation time, and `expiresAt`. Reads must filter `expiresAt <= now` so expired content disappears immediately. A background deletion job must physically remove expired rows and expose aggregate success/failure metrics without logging content. Cache writes must have strict byte and entry-count limits.

The setting UI must state what is cached, where it is stored, the selected TTL, and what is never cached. It must offer immediate opt-out and deletion. If D11 chooses end-to-end encryption, perform encryption on the trusted client or host before upload and specify device key distribution and recovery before implementation.

Acceptance uses unique synthetic secret markers. With caching disabled, no content rows are written. With caching enabled, allowlisted text is visible to an authorized second device until expiry. Tool inputs/results, image data, attachment metadata, raw errors, and a marker placed only inside those denied categories are absent from the database, API responses, logs, and analytics. Disabling the setting makes cached content unreadable immediately and triggers physical deletion.

### Milestone 4: Complete mobile offline, privacy, and recovery UX

Update the mobile session list and thread screen to distinguish live host truth, host-local resumable state, remote metadata, and expired or unavailable cache state. Cached content must be visibly labeled as an incomplete, expiring preview. It must never render a tool approval, imply that a tool ran, or enable composer and action controls while the host is offline.

Use Maestro on a real iOS simulator to prove default live-only behavior, opted-in remote directory behavior, opted-in cached preview, expiry, opt-out deletion, host restart/resume, and cross-organization denial. Relaunch the application between steps to avoid passing solely through in-memory React state.

## Concrete Steps

All commands run from the repository root unless stated otherwise. Milestone 0 starts with focused discovery and tests:

    rg -n "sessionId|resume|getSessionInfo|listSessions|getSessionMessages" packages/host-service/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts
    bun test packages/host-service/src/runtime/sessions
    bun run --filter @superset/host-service typecheck

Before any cloud schema generation, create a disposable Neon branch and update local root environment files to target it. Modify only `packages/db/src/schema/`; then ask the user to run the required Drizzle generation command. Do not run a production migration.

After each implementation milestone, run focused package checks before the full repository gates:

    bun run lint:fix
    bun run lint
    bun run typecheck
    bun run test
    bun run --cwd apps/mobile typecheck
    bun run --cwd apps/mobile test --pass-with-no-tests

Expected result: every command exits zero with no Biome warnings. Database integration tests use only disposable local or Neon-branch data.

## Validation and Acceptance

The default installation must remain live-only until the relevant settings are enabled. A privacy regression test must inspect database rows and captured logs directly; screenshots alone are insufficient evidence that excluded payloads were not stored.

Host-local acceptance requires killing only the test host-service process, starting a fresh manager against the same host database and temporary Claude directory, and proving that the intended native transcript resumes. It must also prove negative paths: a different workspace or host cannot claim the binding, and a deleted native transcript does not silently become a new attempt under the old identity.

Remote-directory acceptance requires authenticated ownership checks, offline rendering, and no content-bearing fields. Cache acceptance requires opt-in, expiry, physical deletion, byte limits, cross-organization denial, and structural exclusion of every forbidden content category.

The final validation report must list exact commands, test counts, simulator flow artifacts, TTL values, database queries used to prove absence, and any untested platform. Do not call the work complete from mocks or schema inspection alone.

## Idempotence and Recovery

All directory and cache writes must be idempotent. Replaying a host update or reconnecting the relay cannot create duplicate sessions or duplicate cache entries. Use stable keys and compare a monotonic version or attempt epoch so delayed updates cannot overwrite newer state.

Expired cache entries are unavailable at read time even if the deletion worker is delayed. Retrying physical cleanup is safe. Revoking consent prevents new writes before deletion begins.

Removing a Superset directory, binding, or cache record never deletes Claude-native data automatically. Native transcript deletion is a separate, explicit operation with proven ownership and confirmation. This mirrors the general safety rule that Superset deletes or overwrites only state it can prove it created.

## Artifacts and Notes

The privacy classification produced in Milestone 0 should use synthetic examples in this form:

    allowed candidate:
      kind: assistant_text
      text: REMOTE_TEXT_ALLOWED_MARKER
      expiresAt: 2026-07-11T00:00:00Z

    structurally rejected:
      kind: tool_result
      content: REMOTE_TOOL_SECRET_MUST_NEVER_APPEAR

The validation report must demonstrate that the allowed marker exists only during the configured TTL and that the rejected marker is absent from storage, responses, logs, analytics, crash reports, and mobile persistence.

## Interfaces and Dependencies

Continue using the Claude Agent SDK for native session discovery and transcript reads, Drizzle for host-local and cloud schemas, tRPC for authenticated mutations and queries, Electric only for approved cloud directory fields, and the existing relay for host transport. Do not introduce ACP, a second transcript library, or a generic raw-event upload endpoint.

The host-local interface should expose purpose-specific operations rather than a broad state store. Its final shape depends on D7, but it should resemble:

    interface ClaudeSessionBindingStore {
      getOwnedBinding(input: {
        supersetSessionId: string;
        workspaceId: string;
        hostId: string;
      }): ClaudeSessionBinding | null;

      setActiveAttempt(binding: ClaudeSessionBinding): void;
      deleteBinding(input: { supersetSessionId: string }): void;
    }

The remote cache boundary must accept a closed union of approved projections, never `SDKMessage` or `SessionEventEnvelope`:

    type RemoteCacheEntry =
      | { kind: "session_summary"; text: string }
      | { kind: "user_text"; text: string }
      | { kind: "assistant_text"; text: string };

This is an illustrative upper bound, not approval to store all three kinds. D9 may narrow it to summaries only. The server validates the union again even when the host has already validated it.

Revision note (2026-07-10): created as an adjacent follow-up after deliberately removing Claude session persistence from the active direct-SDK v1. The plan separates host-local recovery, coarse remote session metadata, and an opt-in TTL cache so privacy and state ownership can be decided before implementation.
