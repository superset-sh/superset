# Highlight-to-send: text selection as LLM context

This is the local canonical design artifact for the "highlight → send text selection as LLM context" feature (desktop agent). Per user instruction, **Linear is NOT the source of truth for this run** — this markdown file is. The content below was migrated read-only from Linear design doc `837ba6265bb8` (Feature issue PRD-160); no Linear writes were made. The stable workflow id `837ba6265bb8` remains the key used for local `decisions_log` / `crash_resume` state so the agentic-development orchestrator can resume against it.

## Workflow Status

| Phase | Skill | Status | Started | Completed | Output |
| -- | -- | -- | -- | -- | -- |
| 1 | gather-requirements | DONE | 2026-06-23 | 2026-06-23 | Requirements section |
| 2 | investigate-feature | DONE | 2026-06-23 | 2026-06-23 | Investigation section |
| 3 | plan-rollout | DONE | 2026-06-23 | 2026-06-23 | Rollout Strategy section |
| 4 | sketch-test-behaviors | DONE | 2026-06-23 | 2026-06-23 | Test sketches subsection |
| 5 | design-skeleton | DONE | 2026-06-23 | 2026-06-23 | Skeleton plan section |
| 5.5 | open-design-review | DONE | 2026-06-23 | 2026-06-23 | Design review (2 critics + sibling-covered): chat-path correction holds; F-WIRE blocking fixed; F-PARITY/F-NULL fixed; target-default set to active-else-new |
| 6 | verify-rollout-plan | DONE | 2026-06-23 | 2026-06-23 | Verification Status section: PASS (4 markers ABSENT, touched-surface reconciled +2 F-WIRE rows, sequence coherent, 0 orphans) |
| 7 | build-feature | DONE | 2026-06-23 | 2026-06-23 | PR1 built (chain root) — terminal v2 path; PR2 deferred. See Phase 7/8 Children. |
| 8 | validate-tests | DONE | 2026-06-23 | 2026-06-23 | PR1: 25/25 tests pass deterministically (2 runs, no flakes); edges #1/#2/#3 strong, #5 toast-keep covered but supersede-guard untested, #4 refuse-only (structural). Verdict PASS, advisory residue logged. |
| 8.5 | pr-review | DONE | 2026-06-23 | 2026-06-23 | residue file written: .pr-review-residue.json (3 documented). 0 auto-fixable findings (biome/tsc/tests all green) → no fixer commit; 3 judgment-call findings → residue. **All 3 RESOLVED 2026-06-23 in commit `25db9abb7`** (supersede guard extracted+tested, edge #4 refuse-only made explicit+tested+doc-reconciled, selection handler debounced); residue updated to needs_review=false; pushed to PR #5334. |
| 9 | write-pr-description | DONE | 2026-06-23 | 2026-06-23 | PR1 body written to `plans/PR1-description.md` (autonomous mode); 3 decisions surfaced (edge #4 refuse-only, untested #5 supersede guard, test-enforced terminal/chat parity). Run halts here per draft-PR-stop authorization. |
| 10 | land-feature | PENDING |  |  |  |
| 11 | feature-retrospective | PENDING |  |  |  |

### Crash-resume snapshot

* **last_completed_phase:** 8.5 (pr-review / 0 auto-fixes, 3 residue)
* **kickoff_problem_statement:** Wire the unused `TextSelectionPopover` (`packages/ui/src/components/ai-elements/text-selection-popover.tsx`) into the desktop code/file viewer + chat pane so a user highlights a text region and sends it — WITH its file context (path + line range) — as instruction/context to an LLM agent: Claude Code via the terminal adapter, and in-app chat via the chat adapter. Build on the existing attachment/prompt pipeline. (Stated in implementation phrasing; Phase 2 confirmed the carrier is the inline file-context prompt, not the attachment pipeline, and that the popover is not the right data source.)
* **feature_issue:** PRD-160
* **cwd:** /Users/jgreer/.superset/worktrees/superset/jgreer013/code-inspection-context
* **repo:** superset-sh/superset (Bun + Turbo + TypeScript monorepo; apps/desktop is Electron)
* **next_phase:** 9 (write-pr-description)

### Phase 7/8 Children

Strict linear PR chain (replaces Linear child issues for this run). Phases 7/8 track each PR as a child unit. Single ship wave (Wave 1).

| # | Child (PR) | Branch | Stacks on | Wave | Scope | Status |
| -- | -- | -- | -- | -- | -- | -- |
| 1 | PR1 (chain root) | `jgreer013/code-inspection-context` | main | W1 | v2 viewer selection capture + "Send selection to agent" affordance → inline file-context prompt → terminal agent (reuse `useSendToTerminalAgent`/`AgentTarget`); includes deferred registry-row commit. | Phase 7 DONE, Phase 8 DONE (2026-06-23), PR [#5334](https://github.com/superset-sh/superset/pull/5334) (draft, cross-fork from jgreer013/superset) |
| 2 | PR2 (optional) | `jgreer013/highlight-to-llm-chat-and-v1` | PR1 | W1 | NEW chat-targeted send path (Variant B) + optional v1 `FileViewerPane`/`EditorContextMenu` parity. | DEFERRED (not built this run) |

## Requirements

### Feature goal

A user reading code or a file in the Superset desktop app can highlight a text region and send that selection — together with its file context — as an instruction or context to an LLM agent, without manually copying text or hand-attaching files. The two delivery surfaces are Claude Code (via the terminal adapter) and the in-app chat (via the chat adapter). The outcome is "highlight → send to the agent": the selection becomes a first-class piece of LLM context that the agent can act on.

This goal is stated in outcome terms. The kickoff arrived in implementation phrasing ("wire `TextSelectionPopover` into the viewers and feed the attachment pipeline"); the named mechanism is one candidate to confirm in Phase 2, not a committed design (see Inherited assumptions).

### Edge cases

Inferred from the kickoff and the surfaces it names (no user in the loop in autonomous mode). Each is logged with needs_review=true and will be revisited as Phase 2 prior-art / Phase 4 test sketches sharpen them.

1. **Empty or whitespace-only selection.** The popover's selection-change detection may fire on a zero-width or collapsed range (e.g., a double-click that selects nothing, or a click that clears a prior selection). The "send to agent" action must be inert / disabled rather than dispatching an empty context payload.
2. **Very large selection (whole-file or multi-thousand-line highlight).** A user can select an entire large file. The captured region must be bounded or chunked before it becomes a prompt/attachment — otherwise it can blow the agent's context window or the prompt template's size budget, and the terminal adapter would write an unwieldy attachment file.
3. **No active / not-yet-ready agent session to receive the context.** A selection can be made before a terminal or chat session exists (or while one is launching). The flow must define what "send" does with no live target — queue into the launch request, prompt to start a session, or disable the action — rather than silently dropping the selection.
4. **Selection spanning non-source content or lacking a resolvable file path.** Highlights can come from a diff view, a rendered (non-text) preview, search results, or a virtualized/transient buffer with no stable on-disk path or line range. The context payload needs a defined fallback when file path / line range cannot be resolved (send text-only, or refuse).
5. **Concurrent / superseded selections and adapter divergence.** A user can re-highlight before the previous send resolves, or the same selection must serialize differently for the terminal adapter (writes an attachment file under `.superset/attachments/` and appends its path to the prompt) versus the chat adapter (passes `initialFiles` / inline prompt). The two adapters must not diverge on what context the agent actually receives for the same highlight.

### Affected codebase areas

Category-level only (Phase 2 does file-level mapping):

* **Shared UI component library** (`packages/ui` ai-elements) — the currently-unused `TextSelectionPopover` primitive that detects selections and surfaces actions.
* **Desktop renderer code/file viewer surface** (`apps/desktop` renderer) — the host that renders selectable code/file text and must mount the popover and own the "send" action.
* **Desktop in-app chat pane** (`apps/desktop` renderer) — the second delivery surface.
* **Agent launch / prompt-and-attachment pipeline** (`packages/shared` — agent launch request + prompt template; context variables incl. attachments).
* **Agent session orchestrator adapters** (`apps/desktop` renderer — terminal adapter and chat adapter) — the two serialization targets for a selection-as-context.
* **Electron main/renderer IPC and filesystem** — only if a selection-derived attachment must be persisted (e.g., the terminal adapter's `.superset/attachments/` write path crosses the renderer/main boundary).

### Rollout timeline

This is a desktop-app (Electron) + shared-library change shipped as a strict linear PR chain (autonomous Phases 1→9, draft PR, halt for human review; no merge to main, no retro in this run). No backend service, database migration, or API contract is involved, so there is no multi-service deploy ordering. The relevant rollout concern is internal: a `packages/ui` change ships to every consumer of that package, and the desktop renderer/main split means any IPC or filesystem touch (attachment persistence) must land coherently within the same release. Sequence the chain so the shared primitive / payload contract lands before the desktop wiring that consumes it.

### Conceptual I/O sketch

Intent-level (types, not shapes — Phase 2 derives concrete shapes from sibling code).

* **Variant A — highlight → Claude Code (terminal adapter).**
  * Input intent: a highlighted text region + the region's source file path and line range + an optional user instruction.
  * Output intent: that selection injected as agent context — serialized into the launch/prompt pipeline as an attachment (file written under the attachments dir, path appended to the prompt) plus instruction text — so Claude Code receives "here is the highlighted code and what to do with it."
* **Variant B — highlight → in-app chat (chat adapter).**
  * Input intent: the same highlighted region + file path/line range + optional instruction.
  * Output intent: the selection delivered to the chat session as initial context (e.g., `initialFiles` / inline message content) so the in-app agent receives the same "highlighted region + instruction" payload.

### Stack-checklist preview

oumi-stack:rollout-checklist is authored for the oumi Python stack; its core items do not apply to this TypeScript/Electron repo. Recorded per item:

* Database migration — **does not apply** (no DB change; no Drizzle schema touch).
* OpenAPI / API contract — **does not apply** (no API surface change).
* Feature flag / Statsig gating — **does not apply by default**; revisit in Phase 3 only if the team wants the popover behind a flag for staged exposure (needs follow-up if so).
* Cross-repo deploy ordering — **does not apply** (single monorepo).
* Genuine TS/desktop rollout concerns that DO apply: (a) `packages/ui` **consumer blast radius** — the shared `TextSelectionPopover` ships to all consumers; confirm no other consumer regresses. (b) **Electron renderer/main IPC + filesystem** — if a selection becomes a persisted attachment, the write crosses the renderer/main boundary and must be release-coherent. (c) **Strict linear PR-chain ordering** — shared contract before desktop wiring.

### Inherited assumptions

The kickoff encodes a proposed mechanism. Per the inherited-assumption audit, each is a hypothesis for Phase 2 to confirm against source, not a ratified premise:

* **The existing attachment pipeline is the right carrier for an ephemeral text selection.** The kickoff assumes a highlight should flow through the same path as a user-attached file (`.superset/attachments/` write for terminal; `initialFiles` for chat). Whether a transient selection belongs in the attachment channel versus inline prompt text is unsettled — Phase 2 must compare both as candidate patterns.
* `TextSelectionPopover` **is wired into a live, mounted code/file viewer that renders selectable text today.** The kickoff says the popover is "wired up nowhere" and the code inspector is "mostly stubs." Whether a real, mounted viewer surface exists to host the popover (vs. needing to build/enable one) is unconfirmed and gates the feature's scope.

### Decisions log

(Autonomous-mode Decision-grade observations are recorded here; Phase 9 surfaces needs_review items in the PR body.)

**\[investigate-feature | 2026-06-23\] Carrier = inline file-context prompt, NOT the attachment pipeline.** Recommend `formatAgentPromptWithFileContext` (renders `In <path>:L<a>-L<b>: <instruction>` + embedded snippet) over `.superset/attachments/`/`initialFiles`. The attachment channel requires base64 data-URLs, crosses renderer→main FS IPC, and structurally drops the path+line anchor the agent needs (selection becomes an opaque `attachment_N` file). The inline carrier is the in-repo convention (DiffPane composer, PR #4966) and matches VS Code Copilot / Cursor / JetBrains prior art. *needs_review=false* — resolves Phase-1 inherited assumption "attachment pipeline is the right carrier" by superseding it: the answer is the inline prompt path, with attachments reserved for genuine file uploads.

**\[investigate-feature | 2026-06-23\] Viewer host EXISTS and selection is capturable — feature is feasible.** A live CodeMirror 6 file viewer is mounted in both v1 `FileViewerPane` and v2 `FilePane`→`CodeView`→`CodeEditor`; both `CodeEditorAdapter`s already expose `getSelectionLines()` from `view.state.selection.main`, and v1 `useEditorActions.ts` already derives `path:start-end` from it (for clipboard). Line/path/text come from the editor adapter, not the raw `TextSelectionPopover`. *needs_review=false* — resolves Phase-1 inherited assumption "popover is wired into a live mounted viewer": a real viewer exists, but the popover is NOT the right data source (it yields text only). Use the adapter for data; optionally reuse the popover as a positioned button shell.

**\[investigate-feature | 2026-06-23\] Closest sibling = DiffPane inline agent-comment composer (PR #4966/#4977).** `useDiffCommentComposer` + `useSendToTerminalAgent` + `useDiffCommentTarget`. Already ships "highlight region → send with file+line context to an agent," but scoped to diffs and terminal targets. The new feature mirrors its `formatAgentPromptWithFileContext` carrier, `AgentTarget` discriminated union, and toast-on-error/keep-for-retry conventions. *needs_review=false.*

**\[investigate-feature | 2026-06-23\] Consumer-wiring gap: chat Variant B has no production send path.** The only selection→send dispatch (`createNewAgentSession` → `workspaceTrpc.agents.run`, `usePaneRegistry.tsx:180-183`) explicitly rejects non-terminal agents ("Selected agent isn't a terminal agent"). "Highlight → in-app chat" (Variant B) therefore requires a NEW chat-targeted send path (through `chat-adapter.ts` `initialPrompt`/`initialFiles`, or pushing into a chat pane draft). Phase 5 skeleton must scope this; it is not a wiring detail. *needs_review=true* — Phase 5 design decision on how chat send is wired (new adapter route vs. existing-pane draft injection).

**\[investigate-feature | 2026-06-23\] Two file-viewer stacks coexist (v1 screens/main + v2 v2-workspace).** The sibling lives in v2; recommend v2 as the primary host and decide in Phase 5 whether v1 gets parity (a "Send selection to agent" item beside the existing copy-path-with-line action) or is left as-is. *needs_review=true* — Phase 5/Phase 3 scope decision (v2-only vs. both stacks).

**\[sketch-test-behaviors | 2026-06-23\] Test runner = `bun:test` with `it.todo`/`test.todo` sketches (methodology translation).** The eng:sketch-test-behaviors skill prescribes Python/pytest `@pytest.mark.skip` stubs; this repo has no Python test stack. Translated the canonical stub into the in-repo convention confirmed at source: `bun:test` (`packages/shared/src/agent-launch-request.test.ts:1`, `apps/desktop/src/renderer/lib/preset-icon-key.test.ts:1`), using `it.todo(...)`/`test.todo(...)` as the registered-but-unimplemented equivalent, scenario in the title. *needs_review=false* — unambiguous; the framework is uniform across both shared and desktop-renderer tests.

**\[sketch-test-behaviors | 2026-06-23\] Two behaviors were under-specified by Requirements and resolved at sketch time (defaults chosen, flagged for Phase 5).** (1) **Edge case #3 — no live session:** Requirements left "queue / prompt-to-start / disable" open; sketched the *start-a-new-session* default via the existing `AgentTarget {kind:"new"}` path (mirrors the DiffPane sibling's `onCreateNewAgentSession`/`agents.run`), explicitly NOT a silent drop. (2) **Edge case #4 — unresolvable path/line:** Requirements offered "text-only or refuse"; sketched *both as acceptable defined behaviors* with the hard invariant that no malformed `In undefined:LNaN` anchor is ever emitted — Phase 5 picks one. *needs_review=true* — Phase 5 design-skeleton must ratify the no-session dispatch shape and the unresolvable-path fallback (text-only vs. refuse) when it writes the contracts. (3) Also surfaced two **(NEW)** symbols the skeleton must add or the sketches orphan: a public `getSelectionText()`/combined `getSelection()` on `CodeEditorAdapter` (text isn't exposed today, only inside `copy()`/`cut()`), and the `useSendSelectionToAgent` orchestration hook + a large-selection bound helper (edge #2).

**\[sketch-test-behaviors | 2026-06-23\] (autonomous-mode unconditional entry)** Test sketches generated autonomously; reviewer should verify coverage against Phase 6 advisory items. Target test files: `useSendToTerminalAgent.test.ts` (PR1), `CodeView/.../CodeEditorAdapter/CodeEditorAdapter.test.ts` (PR1), `useSendSelectionToAgent/useSendSelectionToAgent.test.tsx` (PR1, NEW hook), `adapters/chat-adapter.test.ts` (PR2), `EditorContextMenu/useEditorActions.test.ts` (PR2, optional v1 parity). *needs_review=false.*

**\[design-skeleton | 2026-06-23\] Selection accessor = ONE combined `CodeEditorAdapter.getSelection(path): CapturedEditorSelection | null`, NOT a separate `getSelectionText()`.** Lines + text + path must be snapshotted from a single `view.state` read; two getters would let a caller observe a torn selection across a re-render (a micro edge-#5). `getSelectionLines()` is kept unchanged because the existing `onCopyPathWithLine` consumer depends on it. `path` is a required parameter (the adapter has no file-path knowledge — the host injects it from `ViewProps.filePath`). *needs_review=false* — interface decision derived from the live adapter internals (`CodeEditorAdapter.ts:56-61, 73, 106`).

**\[design-skeleton | 2026-06-23\] RESOLVES Phase-4 needs_review #4 (unresolvable-path fallback) → text-only-or-refuse, RATIFIED; hard invariant: NEVER emit `In undefined:LNaN`.** Enforced **structurally**, not by runtime guard: `getSelection(path)` takes a required non-optional `path`, so a region with a missing path is unconstructible; the formatter is only ever called with a fully-resolved `AgentPromptFileContext`. In the v1/v2 CodeMirror viewer a non-empty selection always has a resolvable path (host `filePath`) + finite lines, so "unresolvable path" only occurs in hosts with NO adapter (diff/search/rendered-preview) — there the affordance is simply not mounted. The hook's text-only branch (real selection, no on-disk path) bypasses the formatter entirely and emits NO `In <path>:...` header. *needs_review=false* (was true in Phase 4) — the Phase-4 "text-only vs refuse, pick one" question is resolved: the structural design makes the malformed-anchor case impossible, and the residual text-only path is defined.

**\[design-skeleton | 2026-06-23\] RESOLVES Phase-4 needs_review #3 (no-session dispatch shape) → default to `AgentTarget{kind:"new"}`, start a session, RATIFIED; never silent-drop.** When no live terminal session exists, the target resolver (reusing the sibling's `useDiffCommentTarget` priority ladder) yields `{kind:"new", configId, placement}` and `send()` launches via the injected `onCreateNewAgentSession` (mirroring `useDiffCommentComposer.ts:168-181`). If that callback is unwired, the hook toasts "Couldn't start a new agent session" (sibling parity) — still not a silent drop. Chat half (edge #3 for chat): `launchChatAdapter` with no `paneId` calls `addChatTab(...)`, opening a chat pane with the context as `initialPrompt`. *needs_review=false* (was true in Phase 4).

**\[design-skeleton | 2026-06-23\] SUPERSEDES the Phase-2 "chat Variant B has no production send path" framing.** Re-read at source: `launchAgentSession({kind:"chat",...})` (`agent-session-orchestrator.ts:97, 136-138`) already routes to `launchChatAdapter` → `ChatLaunchConfig.initialPrompt` (`chat-adapter.ts:7-33, 90-92`), and is already called from production renderer sites (`OpenInWorkspace.tsx`, `RunInWorkspacePopover.tsx`). The ONLY non-terminal rejection is the DiffPane sibling's `createNewAgentSession`→`agents.run` path (`usePaneRegistry.tsx:180-183`), which PR2 simply does not use. PR2's chat dispatch = construct a `kind:"chat"` request from the SAME formatted string and route it through the existing `launchAgentSession`. This materially de-risks Variant B (no new procedure, no `packages/shared` schema change). *needs_review=true* — confirm with a reviewer that routing selection→chat through `launchAgentSession` (vs. a bespoke procedure) is the intended seam, since the Phase-2 doc framed it as a larger gap.

**\[design-skeleton | 2026-06-23\] Shared formatter needs NO refactor; `boundSelectionSnippet` is a colocated util, not `packages/shared`.** `formatAgentPromptWithFileContext` is already pure, exported, `side`-optional, and consumed by a second caller (the sibling) — it is already the shared seam, and both PR1 (terminal) + PR2 (chat) consume it for byte-identical output (edge #5). The large-selection bound helper has one consumer (the hook) so it stays colocated per the simplification-pass anti-premature-generalization rule; promote to shared only if PR2/v1 needs it. *needs_review=false.*

**\[pr-review | 2026-06-23\] All 3 pr-review residue findings RESOLVED in commit `25db9abb7` (pushed to PR #5334).** (1) **Edge-#5 supersede guard now tested.** renderHook is unavailable in this repo's bun:test harness, so the guard was EXTRACTED into a pure `isStillCurrent(token, currentToken)` (`isStillCurrent.ts`) and the hook now calls it; `isStillCurrent.test.ts` asserts both branches (stale token = no-op, current token = proceeds) plus the full supersede sequence. (2) **Edge #4 reconciled — refuse-only, RATIFIED for PR1.** Reachability verdict: a no-path selection is NOT reachable in PR1 — `ViewProps.filePath` is a required non-optional `string` bound from the pane's real on-disk path (`FilePane.tsx` → `data.filePath`), and `CodeView` only renders registry-routed text documents, so there is no untitled/scratch/in-memory buffer with an empty path. Made the refuse-only branch explicit + tested via `shouldRefuseSelection()` (refuses null/empty AND defensively empty/whitespace path or non-finite lines, so `In undefined:LNaN` can never reach the formatter; `shouldRefuseSelection.test.ts`), and reconciled Contract 1 wording from "text-only-or-refuse" to "PR1: refuse-only; text-only deferred to PR2". (3) **Selection handler debounced.** `CodeEditor`'s `onSelectionChange` notification is now `lodash/debounce`d (120ms trailing, cancelled on unmount) to fire on selection settle, mirroring the DiffPane sibling's `onLineSelectionEnd` cadence rather than every CodeMirror `selectionSet`. Full gate green: 31/31 touched-tree tests pass, typecheck clean, lint exit 0. *needs_review=false.*

**\[post-PR follow-up | 2026-06-23\] Two UX additions to the highlight→send affordance, shipped in commit `7e1cee5a0` (pushed to PR #5334).** (1) **No-agent feedback — never silent-fail.** The empty-ladder case (resolver `resolved === null`: no live terminal agent AND no agent config) previously fell through `dispatchSelection`'s `onMissingLauncher` to a misleading `"Couldn't start a new agent session"` toast. `send()` now classifies the request up front via a NEW pure helper `resolveSendOutcome(region, target) → "dispatch" | "no-agent" | "no-selection"` (`resolveSendOutcome.ts`, tested in `resolveSendOutcome.test.ts`) and, on `"no-agent"`, surfaces a clear actionable sonner toast: `"No agent available to send to. Start an agent in this workspace, or add one in Settings → Agents."` This is parity-plus over the DiffPane composer (whose null-target path shows the generic launcher-failure message). The refuse gate wins ties (`"no-selection"` over `"no-agent"`) so an empty selection never produces a misleading no-agent toast. (2) **Cmd/Ctrl+Enter (Mod-Enter) shortcut** bound in the v2 `CodeEditor` keymap beside `Mod-s`, triggering the same default-target send as the button. `onSendSelection` threaded `CodeView → CodeEditor` (`() => void send({})`), held in `onSendSelectionRef` (mirrors `onSelectionChangeRef`). The keymap entry gates on selection-presence by reusing the adapter's `captureSelection(view.state, "")` (no duplicated empty check): returns `true` to consume the chord ONLY when a non-empty selection exists, else `false` so `Mod-Enter` falls through to default editor behavior (no stray newline). `Mod-Enter` confirmed previously unbound (only `Mod-s` custom; not in `defaultKeymap`). The button stays; the shortcut is additive. Gate green: 38/38 touched-tree tests pass (7 new `resolveSendOutcome` tests), `@superset/desktop` typecheck clean, lint exit 0. Contract 2 in this doc updated to document both. *needs_review=false.*

## Investigation

**Bare goal:** A person reading a file in the desktop app can turn a highlighted region into an instruction the agent acts on, without copying text or hand-attaching files.

Investigation run inline (orchestrator dispatched without the Agent tool). The two Phase-1 inherited assumptions are resolved below under "Open questions resolved."

### Upstream / midstream / downstream map

**Upstream (where a selection originates — the UI host).** Selections are made in a mounted CodeMirror 6 file viewer. Two coexisting stacks: v1 `FileViewerPane` (`apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/FileViewerPane/FileViewerPane.tsx`) and v2 `FilePane` → `CodeView` → `CodeEditor` (`apps/desktop/.../v2-workspace/$workspaceId/hooks/usePaneRegistry/components/FilePane/registry/views/CodeView/components/CodeEditor/CodeEditor.tsx`). Both render via `@codemirror/view` `EditorView` into selectable DOM, and **both already expose a** `CodeEditorAdapter.getSelectionLines(): {startLine,endLine} | null` computed from `view.state.selection.main` (v1: `.../ContentView/components/CodeEditorAdapter/CodeEditorAdapter.ts`; v2: `.../CodeView/components/CodeEditor/CodeEditorAdapter/CodeEditorAdapter.ts`). The unused popover (`packages/ui/src/components/ai-elements/text-selection-popover.tsx`) keys off the raw DOM Selection API (`document.getSelection()`, `selectionchange`, `range.getBoundingClientRect()`) and passes **only the selected text string** to `onClick(text)` — it carries no path/line info. So the upstream host (not the popover) must supply path + line range via the adapter.

**Midstream (transform / carry).** Two candidate carriers exist and are NOT the same channel. (a) The **attachment pipeline**: `packages/shared/src/agent-launch-request.ts#buildPromptAgentLaunchRequest` takes `initialFiles: {data,mediaType,filename?}[]` where `data` MUST be a `data:...;base64,...` URL; for terminal it appends `.superset/attachments/<filename>` paths to the prompt and the terminal adapter writes those files to disk; for chat it forwards `initialFiles`. (b) The **inline file-context prompt**: `apps/desktop/src/renderer/hooks/host-service/useSendToTerminalAgent/useSendToTerminalAgent.ts#formatAgentPromptWithFileContext` renders `In <path>:L<start>-L<end>[ (side)]: <comment>` as plain prompt text. The DiffPane composer (`.../DiffPane/hooks/useDiffCommentComposer/useDiffCommentComposer.ts`) is the only production caller of (b) today.

**Downstream (where it lands — the agent session).** Two adapters under `apps/desktop/src/renderer/lib/agent-session-orchestrator/adapters/`: `terminal-adapter.ts` (writes attachment files via `electronTrpcClient.filesystem.*` renderer→main IPC, then `launchCommandInPane`) and `chat-adapter.ts` (maps to `ChatLaunchConfig`, sets `initialPrompt`/`initialFiles` on a chat pane). The DiffPane send path bypasses both: existing terminal via `workspaceTrpc.terminal.writeInput` (pushes formatted text straight into the live PTY), or new session via `workspaceTrpc.agents.run` (host bakes the prompt into the launch command).

### Sibling reference list

**Closest sibling — DiffPane inline agent-comment composer (PR #4966 / #4977, author Kiet).** `apps/desktop/.../DiffPane/hooks/useDiffCommentComposer/useDiffCommentComposer.ts` + `useSendToTerminalAgent.ts` + `.../AgentCommentComposer/hooks/useDiffCommentTarget/useDiffCommentTarget.ts`. This is "highlight a code region → send it to an agent with file+line context," already shipping in v2 — but scoped to diffs and terminal targets. Contract shape: capture `SelectedLineRange {start,end,side}` on `onLineSelectionEnd`; format with `formatAgentPromptWithFileContext({comment, file:{path,startLine,endLine,side}})`; dispatch to `AgentTarget = {kind:"existing"; terminalId} | {kind:"new"; configId; placement}`. Error handling: toast on failure, composer stays open for retry; `clearIfStillCurrent` guards against a slow send wiping a newer selection (edge case #5). No dedicated test file for the composer hook.

**Secondary sibling — file-viewer editor context menu.** `apps/desktop/.../EditorContextMenu/useEditorActions.ts` already calls `editor.getSelectionLines()` and formats `path:start-end`, but only for *copy-path-with-line* (clipboard) — it does NOT send to an agent. This proves the file viewer can already produce a path+line-range from a selection; the missing piece is the send action, not the capture.

**Carrier sibling — file-attachment flow.** `buildPromptAgentLaunchRequest` + `terminal-adapter.ts#writeAttachmentFiles` + `chat-adapter.ts`. Studied as the kickoff's proposed carrier; rejected for selections (see verdicts).

### Dependency research

No new external dependency is required. The feature reuses already-vendored libraries: `@codemirror/view` + `@codemirror/state` (file-viewer selection + line mapping, already a desktop dep), `@pierre/diffs` (DiffPane only, already vendored), and the shared `packages/ui` primitive. The unused `TextSelectionPopover` is in-repo. Candidate "new dep" = none.

### Prior-art research

How do editors expose "selection → send to AI"? **VS Code / Copilot Chat** and **Cursor** both inject the selection as an *inline, fenced code block with a file:line header* into the chat prompt, not as a file attachment — the model needs the surrounding "this is lines X–Y of foo.ts" framing to act, and a bare attachment file loses that anchor. Source: VS Code Copilot "Add selection to chat" / `#selection` chat variable docs ([code.visualstudio.com/docs/copilot/chat/copilot-chat-context](<http://code.visualstudio.com/docs/copilot/chat/copilot-chat-context>)) and Cursor "@-symbols / selected code" docs ([docs.cursor.com/context](<http://docs.cursor.com/context>)). **JetBrains AI Assistant** likewise sends the highlighted snippet inline with file context. This is **convergent prior art for the inline-prompt carrier**, and it matches what Superset's own DiffPane composer already does via `formatAgentPromptWithFileContext`. Two architectural patterns did surface (inline-quoted vs. attachment-file), so an Alternatives-compared note is included below.

**Alternatives compared (inline file-context prompt vs. attachment file).** Inline (`In path:L10-L20: <instruction>` or a fenced block): preserves path+line anchor, zero IPC/FS, already the in-repo convention, bounded by prompt budget (needs a large-selection guard — edge case #2). Attachment file (`.superset/attachments/attachment_N` + appended path): designed for binary/large uploads, requires base64 data-URL encoding, crosses renderer→main FS IPC, and **drops the line-range/source-path metadata** (the agent sees an opaque `attachment_1` file). Verdict: inline wins for text selections; attachment remains correct for genuine file uploads. The two carriers should stay separate.

### Dependency verdicts

* CodeMirror (`@codemirror/*`): **accept** — already a dependency; line-range capture via existing `getSelectionLines()`.
* `@pierre/diffs`: **accept (no change)** — sibling-only; the new file-viewer path does not need it.
* `TextSelectionPopover` (in-repo): **defer / likely-don't-wire-as-is** — it only yields text, no line range; the host already has a better selection source (`getSelectionLines()`). Revisit if a pure DOM-selection surface with no CodeMirror adapter (e.g., rendered markdown, search results) becomes an in-scope host; for the code viewer it is the wrong primitive. Follow-up: Phase 5 to decide whether to repurpose the popover purely as the floating-action-button UI shell (positioned over the selection) while sourcing path/lines from the adapter, or drop it.

### Files likely to touch

* apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/components/EditorContextMenu/useEditorActions.ts
* apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/components/CodeEditorAdapter/CodeEditorAdapter.ts
* apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/FilePane/registry/views/CodeView/components/CodeEditor/CodeEditor.tsx
* apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/FilePane/registry/views/CodeView/components/CodeEditor/CodeEditorAdapter/CodeEditorAdapter.ts
* apps/desktop/src/renderer/hooks/host-service/useSendToTerminalAgent/useSendToTerminalAgent.ts
* apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/usePaneRegistry.tsx (consumer wiring; see Decisions log — chat target gap)
* packages/ui/src/components/ai-elements/text-selection-popover.tsx (UI shell only, pending Phase 5 decision)
* packages/shared/src/agent-launch-request.ts (only if chat Variant B routes through buildPromptAgentLaunchRequest)
* apps/desktop/src/renderer/lib/agent-session-orchestrator/adapters/chat-adapter.ts (consumer wiring; chat Variant B has no production send path today)

### Sibling reference files

* apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/DiffPane/hooks/useDiffCommentComposer/useDiffCommentComposer.ts
* apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/DiffPane/components/AgentCommentComposer/AgentCommentComposer.tsx
* apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/DiffPane/components/AgentCommentComposer/hooks/useDiffCommentTarget/useDiffCommentTarget.ts
* apps/desktop/src/renderer/hooks/host-service/useSendToTerminalAgent/useSendToTerminalAgent.ts

### Sibling-derived I/O samples

1. Format (sibling, `useSendToTerminalAgent.ts:30-45`): `formatAgentPromptWithFileContext({comment:"refactor this", file:{path:"src/a.ts", startLine:40, endLine:60}})` → `"In src/a.ts:L40-L60: refactor this"` (single line → `L40`).
2. Range capture (sibling, `useDiffCommentComposer.ts:109-119`): pierre `onLineSelectionEnd(range, context)` where `context.type==="diff"` → `setComposer({itemId, range:{start,end,side,endSide}})`.
3. Target dispatch (sibling, `useDiffCommentComposer.ts:168-190`): `target.kind==="new"` → `onCreateNewAgentSession({configId, placement, prompt:text})`; `target.kind==="existing"` → `sendToTerminalAgent({workspaceId, terminalId, text})`. New-session path (`usePaneRegistry.tsx:175-183`) calls `agents.run` and **bails if** `result.kind !== "terminal"`.

### I/O adaptation for this feature

**Variant A — highlight → Claude Code (terminal):** reused = `formatAgentPromptWithFileContext`, `useSendToTerminalAgent`, `AgentTarget`, `getSelectionLines()`; modified = range source is the editor adapter (`getSelectionLines()`) instead of pierre `SelectedLineRange`, and `side` is omitted (single-file viewer, not a diff); added = the *selected text itself* may be embedded (DiffPane sends only path:line + comment, relying on the agent to read the file — for a plain viewer we likely embed the highlighted snippet as a fenced block too, plus the user's optional instruction); removed = pierre `itemId`/`side` plumbing.
**Variant B — highlight → in-app chat:** reused = the same formatted context string; modified = dispatch must target a chat session — `createNewAgentSession`/`agents.run` currently rejects non-terminal agents, so a chat send path must be added (route through `chat-adapter.ts` `initialPrompt`, or push into an existing chat pane's draft input); added = a chat-capable send action absent from the sibling; removed = `terminal.writeInput`.

### Sibling patterns (DiffPane inline agent-comment composer)

* **File organization:** feature-scoped hooks colocated under the pane — `DiffPane/hooks/useDiffCommentComposer/`, `DiffPane/components/AgentCommentComposer/` with nested `hooks/`, `components/` (`useDiffCommentComposer.ts:1-16`, dir layout). One folder per unit + `index.ts` barrel.
* **Test naming + directory:** co-located `*.test.ts` next to source per AGENTS.md; the composer hook itself has no test (gap), but the shared carrier `packages/shared/src/agent-launch-request.test.ts:1` uses `bun:test` `describe`/`test`.
* **Imports:** path aliases `renderer/...`, `shared/...`, `@superset/ui/...` (`useDiffCommentComposer.ts:7-16`); type-only imports use `import type` (`useDiffCommentComposer.ts:1-6`).
* **Type annotations:** discriminated unions for variants — `AgentTarget = {kind:"existing"...} | {kind:"new"...}` (`useDiffCommentTarget.ts:7-9`); string-literal unions over enums — `AgentPromptFileSide = "additions"|"deletions"|"mixed"` (`useSendToTerminalAgent.ts:6`), `placement: "split-pane"|"new-tab"`.
* **Error handling:** `toast.error(...)` on failure, keep UI state for retry; never throw to the render path (`useDiffCommentComposer.ts:184-194`, `useSendToTerminalAgent.ts:76-81`).
* **Comment-docstring style:** short intent-first block comments explaining *why* (the cycle-break getter note `useDiffCommentComposer.ts:48-52`; the gutter-stub note `:121-126`); no redundant restatement.
* **Integration points:** renderer→host via `workspaceTrpc.terminal.writeInput` and `workspaceTrpc.agents.run` (`usePaneRegistry.tsx:119,175`; `useSendToTerminalAgent.ts:66-72`); renderer→main FS via `electronTrpcClient.filesystem.*` (terminal-adapter only). Per AGENTS.md, all Electron IPC goes through tRPC.

### Open questions resolved

**Q1 — Carrier (RESOLVED).** Recommend the **inline file-context prompt carrier** (`formatAgentPromptWithFileContext` → prompt text), NOT the `.superset/attachments/` `initialFiles` pipeline. Rationale: (1) it is the in-repo convention the DiffPane sibling already ships; (2) it preserves the path+line anchor the agent needs, which the attachment channel structurally loses (attachments become opaque `attachment_N` files with no source metadata, and require base64 data-URL encoding designed for binary uploads); (3) it needs zero renderer→main FS IPC; (4) prior art (VS Code Copilot, Cursor, JetBrains) converges on inline-with-file-header. Selection text should be embedded as a fenced block alongside the `In <path>:L<a>-L<b>: <instruction>` header so the agent has the exact snippet plus the anchor. Bound large selections (edge case #2) before formatting. The attachment pipeline stays the carrier for genuine file uploads only.

**Q2 — Viewer host feasibility (RESOLVED, FEASIBLE).** A live, mounted, DOM-selectable code/file viewer exists: the CodeMirror 6 editor rendered by both v1 `FileViewerPane` and v2 `FilePane`→`CodeView`→`CodeEditor`. Text selection IS capturable — and better than the popover's raw DOM path: both `CodeEditorAdapter`s already expose `getSelectionLines()` from `view.state.selection.main`, and v1's `useEditorActions.ts` already turns that into `path:start-end` (for clipboard). Realistic mount points / hosts: **v2** `CodeView`/`CodeEditor` (preferred — it is where the sibling `agents.run` wiring and `usePaneRegistry` live) and **v1** `FileViewerPane`/`EditorContextMenu` (a "Send selection to agent" item alongside the existing copy actions). Selection is NOT capturable for line-mapping from xterm (canvas), webview/BrowserPane (sandboxed), or as line numbers from the raw `TextSelectionPopover` alone. Recommendation: source path+lines+text from the editor adapter; if a floating action UI is wanted, use the popover purely as a positioned button shell, not as the data source.

### Risks / feasibility notes for rollout

* **Chat Variant B is a real gap, not a wiring detail.** The only production send path (`agents.run` via `createNewAgentSession`) explicitly rejects non-terminal agents (`usePaneRegistry.tsx:180-183`). Delivering "highlight → in-app chat" requires a new chat-targeted send path (through `chat-adapter.ts` `initialPrompt`/`initialFiles`, or pushing into an existing chat pane draft). This changes the Phase 5 skeleton scope: the chat adapter is not currently reachable from a selection.
* **Adapter divergence (edge case #5) is structural.** Terminal send = `terminal.writeInput` into a live PTY (raw text, no attachment). Chat send = `ChatLaunchConfig`. The single formatted context string must serialize identically into both, or the two surfaces diverge on what the agent receives.
* **v1/v2 viewer duplication.** Two file-viewer stacks coexist; the skeleton should pick the v2 path as primary (sibling lives there) and decide whether v1 gets parity or is left to the existing context menu.

### Recommended Reviewers (initial)

*No recommended reviewers — please assign manually.*

Note: the suggest-reviewers pool is restricted to the @oumi-ai/louk-at-my-pr team, but this is the superset-sh/superset repo — the file authors are not in that oumi team, so the team intersection is empty (expected). Git-history evidence for manual assignment (commit count across touched + sibling files, 90-day window not applied): **Kiet** (64; authored the DiffPane inline agent-comment composer sibling — PR #4966/#4977 — and `useSendToTerminalAgent`/`TextSelectionPopover`), **Satya Patel** (31; v2 file editor foundation + agent-launch-request), **Avi Peltz** (13). Kiet is the strongest match — primary author of the closest sibling.

### Test sketches

*Reviewed in Phase 5: yes (2026-06-23). Contracts now real — the three (NEW) symbols the sketches referenced are specified in the Skeleton plan: `CodeEditorAdapter.getSelection(path)` (combined accessor, supersedes the sketch's tentative separate `getSelectionText()`), `useSendSelectionToAgent`, and `boundSelectionSnippet`. The `CodeEditorAdapter.test.ts` sketch's `getSelectionText()` reference should be updated in Phase 7 to call the combined `getSelection(path)` instead. No sketch is orphaned; the edge→sketch matrix still holds.*

Behavior-level sketches authored in Phase 4 (sketch-test-behaviors, autonomous mode). **Framework note (repo-convention translation):** the eng:sketch-test-behaviors methodology is authored for a Python/pytest stack; this is the Superset TypeScript monorepo, so the canonical pytest `@pytest.mark.skip` stub is translated into its **`bun:test`** equivalent — `it.todo(...)` (a registered-but-unimplemented test) with the scenario in the title in *"In scenario X, if Y, then Z"* form. This matches the runner used by the two reference tests (`packages/shared/src/agent-prompt-template.test.ts:1`, `packages/shared/src/agent-launch-request.test.ts:1` — both `import { describe, expect, test } from "bun:test"`) and by desktop-renderer tests (`apps/desktop/src/renderer/lib/preset-icon-key.test.ts:1` — `import { describe, expect, it } from "bun:test"`). Sketches are co-located per AGENTS.md (`X.test.ts(x)` beside `X`). These are sketches — Phase 7 fleshes them out test-first.

**Symbol verification (against the active branch):**
- `formatAgentPromptWithFileContext` — EXISTS, `apps/desktop/src/renderer/hooks/host-service/useSendToTerminalAgent/useSendToTerminalAgent.ts:30`. Renders `In <path>:L<a>-L<b>[ (side)]: <comment>`; collapses single-line to `L<a>` (`:35-37`).
- `AgentPromptFileContext` (`useSendToTerminalAgent.ts:8`), `SendToTerminalAgentInput` (`:47`), `useSendToTerminalAgent` (`:65`) — EXIST.
- `getSelectionLines(): EditorSelectionLines | null` — EXISTS on the v2 `CodeEditorAdapter` (`.../CodeView/components/CodeEditor/CodeEditorAdapter/CodeEditorAdapter.ts:56-61`) and v1 adapter; returns `{startLine,endLine}` **only — no text**.
- `AgentTarget = {kind:"existing"; terminalId} | {kind:"new"; configId; placement}` — EXISTS, `.../DiffPane/components/AgentCommentComposer/hooks/useDiffCommentTarget/useDiffCommentTarget.ts:7-9`.
- `clearIfStillCurrent` — EXISTS as the sibling's stale-dispatch guard, `.../useDiffCommentComposer/useDiffCommentComposer.ts:102-107`.
- `ChatLaunchConfig` / `chat-adapter.ts` `toLaunchConfig` — EXIST (`.../adapters/chat-adapter.ts:7`, `shared/tabs-types`).
- **(NEW)** `getSelectionText(): string | null` on `CodeEditorAdapter` — the adapter today exposes line range but the selected text only lives inside `copy()`/`cut()` internals (`CodeEditorAdapter.ts:73,106` via `view.state.sliceDoc`). Phase 5 must add a public getter (or a combined `getSelection(): {startLine,endLine,text} | null`) so the snippet can be embedded. **Phase 5 Skeleton plan MUST add a matching (NEW) interface stub** or this sketch is orphaned.
- **(NEW)** `useSendSelectionToAgent` hook (colocated under the v2 viewer per Rollout) — does NOT exist today (`rg useSendSelectionToAgent` → no matches). Owns: capture via the adapter → `formatAgentPromptWithFileContext` → dispatch via `AgentTarget`, with the large-selection bound, the empty-selection inert guard, the unresolvable-path fallback, and the `clearIfStillCurrent`-style supersede guard. Phase 5 must add its stub.
- **(NEW)** a bound/large-selection helper (working name `boundSelectionForPrompt` / `clampSelectionSnippet`) — does NOT exist; Phase 5 must add it (edge case #2). Whether it lives on the hook or as a pure `packages/shared` util is a Phase 5 decision (see Decisions log below).

The highest-value seam is the **shared formatter** + the **adapter-divergence parity** assertion (edge case #5): the *same* formatted string must serialize identically into the terminal PTY path and the chat `ChatLaunchConfig`. That parity test is the single most important behavior to pin and is sketched first.

---

#### File: `apps/desktop/src/renderer/hooks/host-service/useSendToTerminalAgent/useSendToTerminalAgent.test.ts` — PR1 (chain root)

*Pins the shared inline-context formatter seam (the carrier) and the cross-adapter parity invariant. This is the highest-value unit file — pure, no React, no IPC. `formatAgentPromptWithFileContext` exists today with no test; PR1 adds this file.*

```ts
import { describe, expect, it, test } from "bun:test";
import {
	type AgentPromptFileContext,
	formatAgentPromptWithFileContext,
} from "./useSendToTerminalAgent";

describe("formatAgentPromptWithFileContext (selection carrier)", () => {
	// HAPPY PATH — multi-line selection
	test.todo(
		"In scenario: a viewer selection with path=src/a.ts, startLine=40, endLine=60, and instruction 'refactor this', if the prompt is formatted, then the result is 'In src/a.ts:L40-L60: refactor this'",
	);

	// BOUNDARY — single-line selection collapses the range
	test.todo(
		"In scenario: a selection where startLine===endLine (line 12), if the prompt is formatted, then the range renders as 'L12' (not 'L12-L12')",
	);

	// VARIANT — single-file viewer omits the diff side suffix
	test.todo(
		"In scenario: a file-viewer selection built WITHOUT a `side` field, if the prompt is formatted, then no '(deleted lines)'/'(across...)' suffix is appended (file-viewer is not a diff)",
	);

	// NEW BEHAVIOR — selected snippet embedded alongside the anchor (Investigation Q1: embed fenced block)
	test.todo(
		"In scenario: a selection carrying its captured text (the snippet), if the prompt is formatted for a plain viewer, then the output contains BOTH the 'In <path>:L<a>-L<b>' anchor AND the snippet as a fenced code block (so the agent has the exact lines, not just a pointer)",
	);
});

describe("adapter divergence parity (edge case #5)", () => {
	// THE KEY INVARIANT — one formatted string, two surfaces, trim-normalized equal
	// (NOT byte-identical: terminal appends a trailing \n via normalizeTerminalCommand;
	// chat does initialPrompt?.trim() on both ends in toLaunchConfig).
	test.todo(
		"In scenario: the SAME formatted context string from formatAgentPromptWithFileContext, if it is routed to the terminal path (normalizeTerminalCommand / terminal.writeInput input) AND to the chat path (ChatLaunchConfig.initialPrompt via chat-adapter toLaunchConfig with autoExecute:true), then after normalizing leading/trailing whitespace both adapters carry equal context — the two surfaces never diverge on what the agent receives on the non-draft path",
	);
	// NO-DRAFT-DROP — the draft path must not silently drop the selection
	test.todo(
		"In scenario: a selection sent to chat with autoExecute:false (draft mode) and no taskSlug, if toLaunchConfig runs, then it would set initialPrompt:undefined / return null and DROP the selection — so the selection-send dispatcher must pin autoExecute:true (asserts the selection is never dropped to a draft)",
	);
});
```

Scenarios: happy-path multi-line format; single-line range collapse; single-file `side` omission; (NEW) snippet-embedded fenced block; and the cross-adapter byte-identical parity invariant (edge case #5). — **PR1**

---

#### File: `apps/desktop/.../CodeView/components/CodeEditor/CodeEditorAdapter/CodeEditorAdapter.test.ts` — PR1

*Selection → file-context capture seam. `getSelectionLines()` exists; `getSelectionText()` is (NEW). Full path: `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/FilePane/registry/views/CodeView/components/CodeEditor/CodeEditorAdapter/CodeEditorAdapter.test.ts`. Driven against a real CodeMirror `EditorView` (the dep is already vendored), mirroring how the production adapter reads `view.state`.*

```ts
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "bun:test";
import { createCodeMirrorAdapter } from "./CodeEditorAdapter";

describe("createCodeMirrorAdapter selection capture", () => {
	// HAPPY PATH — a multi-line range yields 1-based start/end lines
	it.todo(
		"In scenario: a doc with a selection spanning lines 3..5, if getSelectionLines() is called, then it returns {startLine:3, endLine:5} (1-based, from view.state.selection.main)",
	);

	// (NEW) capture the selected text so a snippet can be embedded
	it.todo(
		"In scenario: a non-empty selection over 'const x = 1', if getSelectionText() (NEW) is called, then it returns the exact selected substring (sliced from the doc, matching what copy() copies)",
	);

	// BOUNDARY / EDGE CASE #1 — empty (collapsed) selection: getSelectionLines() still
	// returns a non-null {startLine,endLine}, so the inert signal MUST come from
	// getSelection()'s OWN guard (selection.empty OR sliceDoc().trim()===""), not from a
	// null line range.
	it.todo(
		"In scenario: a collapsed cursor (selection.empty === true), if getSelectionLines() is called, then it STILL returns a non-null {startLine,endLine}; and if getSelection(path) (NEW) is called, then it returns null via its own empty/whitespace guard — the signal the send affordance uses to stay inert",
	);

	// EDGE CASE #4 — combined capture surfaces a resolvable region or null
	it.todo(
		"In scenario: a non-empty selection in a viewer with a known file path, if the combined selection is captured, then it yields {path, startLine, endLine, text}; if the host has no resolvable on-disk path/line range, then capture yields null (the unresolvable-path fallback signal)",
	);
});
```

Scenarios: `getSelectionLines` happy-path; (NEW) `getSelectionText` happy-path; empty-selection → null (edge #1); resolvable vs unresolvable-path capture (edge #4). — **PR1**

---

#### File: `apps/desktop/.../CodeView/components/CodeEditor/hooks/useSendSelectionToAgent/useSendSelectionToAgent.test.tsx` — PR1

*The (NEW) dispatch hook — the orchestration seam that wires capture → format → terminal dispatch and owns four of the five edge cases. Colocated under the v2 viewer per Rollout Strategy. React hook test (`renderHook`-style); the sibling `useDiffCommentComposer` has no test today (Investigation gap), so this is net-new coverage.*

```ts
import { describe, expect, it } from "bun:test";
// import { renderHook, act } from "@testing-library/react";
import { useSendSelectionToAgent } from "./useSendSelectionToAgent"; // (NEW)

describe("useSendSelectionToAgent — affordance state (edge case #1)", () => {
	it.todo(
		"In scenario: the current selection is empty / whitespace-only / collapsed, if the hook computes the send affordance, then `canSend` is false and invoking send() is a no-op (no formatAgentPromptWithFileContext call, no terminal.writeInput) — the action is inert, never dispatches an empty payload",
	);
	it.todo(
		"In scenario: a non-empty multi-line selection exists, if the hook computes the affordance, then `canSend` is true",
	);
});

describe("useSendSelectionToAgent — large-selection bound (edge case #2)", () => {
	it.todo(
		"In scenario: a whole-file / multi-thousand-line selection exceeding the prompt-budget threshold, if send() runs, then the embedded snippet is bounded/chunked (truncated with an explicit elision marker) BEFORE formatAgentPromptWithFileContext — the dispatched prompt never exceeds the size budget",
	);
	it.todo(
		"In scenario: a small selection under the threshold, if send() runs, then the snippet is embedded verbatim (no truncation marker)",
	);
});

describe("useSendSelectionToAgent — target resolution (edge case #3)", () => {
	it.todo(
		"In scenario: a live ready terminal agent session exists, if send() runs with target {kind:'existing', terminalId}, then it dispatches through useSendToTerminalAgent.send({workspaceId, terminalId, text}) — into the live PTY",
	);
	it.todo(
		"In scenario: NO live/ready agent session exists, if send() runs, then it follows the defined no-session behavior — starts a new session via AgentTarget {kind:'new', configId, placement} (mirroring the sibling's onCreateNewAgentSession/agents.run path), NOT a silent drop",
	);
});

describe("useSendSelectionToAgent — unresolvable path fallback (edge case #4)", () => {
	it.todo(
		"In scenario: the selection lacks a resolvable on-disk path/line range (diff/search/virtualized buffer → capture returned null path), if send() runs, then it follows the defined fallback — sends text-only (no 'In <path>:L..' anchor) OR refuses with the affordance disabled — never emits a malformed 'In undefined:LNaN' anchor",
	);
});

describe("useSendSelectionToAgent — superseded selection guard (edge case #5)", () => {
	it.todo(
		"In scenario: send() is dispatched for selection A and is still in flight when the user makes a newer selection B, if A's dispatch resolves, then a clearIfStillCurrent-style guard prevents A from clearing/overwriting B (the slow send does not wipe the newer selection)",
	);
	it.todo(
		"In scenario: send() fails (terminal.writeInput rejects), if the error surfaces, then toast.error fires and the selection/affordance is kept for retry (never throws to the render path) — matching the sibling's error convention",
	);
});
```

Scenarios cover edge cases #1 (inert empty), #2 (bound large), #3 (no-session → new AgentTarget), #4 (unresolvable-path fallback), #5 (supersede guard + toast-on-error keep-for-retry). — **PR1**

---

#### File: `apps/desktop/src/renderer/lib/agent-session-orchestrator/adapters/chat-adapter.test.ts` — PR2 (Variant B)

*The NEW chat-targeted send path. Investigation flags this as a real gap: the sole send path (`agents.run` via `createNewAgentSession`) rejects non-terminal agents (`usePaneRegistry.tsx:180-183`), so Variant B needs a chat route. Tests that the selection's formatted context lands in `ChatLaunchConfig` and matches the terminal serialization. There is no chat-adapter test today; PR2 adds this file.*

```ts
import { describe, expect, it } from "bun:test";
import { /* toLaunchConfig or the new selection->chat route */ } from "./chat-adapter";

describe("chat-adapter selection send (Variant B)", () => {
	// HAPPY PATH — selection context reaches the chat session as initialPrompt
	it.todo(
		"In scenario: a captured selection formatted via formatAgentPromptWithFileContext is sent to a chat target, if the chat launch config is built, then ChatLaunchConfig.initialPrompt carries that exact context string (so the in-app agent receives the same 'highlighted region + instruction' payload as terminal)",
	);

	// EDGE CASE #5 (the chat half of adapter divergence)
	it.todo(
		"In scenario: the identical formatted context string is sent to terminal (terminal.writeInput) and to chat (ChatLaunchConfig.initialPrompt with autoExecute:true), if both are dispatched, then after normalizing leading/trailing whitespace the chat-side context equals the terminal-side context (trim-normalized equal, NOT byte-identical — chat trims both ends, terminal appends a trailing newline) — Variant B does not diverge from Variant A on the non-draft path",
	);

	// NO-DRAFT-DROP (the chat serialization caveat)
	it.todo(
		"In scenario: a selection is sent to chat with autoExecute:false (draft) and no taskSlug present, if toLaunchConfig runs, then initialPrompt becomes undefined / the config is null and the selection is DROPPED — so the selection-send path pins autoExecute:true and this test asserts the selection survives (never silently dropped to a draft)",
	);

	// EDGE CASE #3 for chat — no live chat session
	it.todo(
		"In scenario: no live/ready chat session exists when a selection is sent to chat, if dispatch runs, then it follows the defined no-session behavior — opens/launches a chat pane with the context as initialPrompt (draft injection), NOT a silent drop and NOT the 'isn't a terminal agent' rejection",
	);
});
```

Scenarios: chat-side context lands in `ChatLaunchConfig.initialPrompt` (happy path); cross-adapter parity terminal↔chat (edge #5, chat half); no-live-chat-session defined behavior (edge #3 for chat). Edge cases #1/#2/#4 are inherited from the shared capture/format primitive (no re-implementation, per Rollout). — **PR2**

---

#### File (optional, PR2): `apps/desktop/.../EditorContextMenu/useEditorActions.test.ts` — PR2 (v1 parity)

*Optional v1 parity. `useEditorActions.ts` already calls `getSelectionLines()` for copy-path-with-line; PR2 may add a "Send selection to agent" item beside it. Only sketched if Phase 5 decides v1 gets parity (Decisions log: needs_review — v2-only vs both stacks). Full path: `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/components/EditorContextMenu/useEditorActions.test.ts`.*

```ts
import { describe, expect, it } from "bun:test";

describe("useEditorActions — send selection to agent (v1 parity, optional)", () => {
	it.todo(
		"In scenario: a non-empty v1 file-viewer selection, if the 'Send selection to agent' menu action fires, then it dispatches the SAME formatAgentPromptWithFileContext-built context as the v2 path (v1 and v2 produce identical agent context for the same highlight)",
	);
	it.todo(
		"In scenario: an empty v1 selection, if the context menu is opened, then the 'Send selection to agent' item is disabled (edge case #1 parity with v2)",
	);
});
```

Scenarios: v1↔v2 context parity; v1 empty-selection disabled (edge #1). Gated on Phase 5 v1-parity decision. — **PR2 (optional)**

---

**Edge-case → sketch coverage matrix:**

| Edge case (Requirements) | Sketched in | PR |
| -- | -- | -- |
| #1 empty/whitespace/collapsed → inert | `CodeEditorAdapter.test.ts` (null capture) + `useSendSelectionToAgent.test.tsx` (`canSend=false`) | PR1 |
| #2 very large / whole-file → bounded/chunked | `useSendSelectionToAgent.test.tsx` (bound before format) | PR1 |
| #3 no live/ready session → new `{kind:"new"}` (not silent drop) | `useSendSelectionToAgent.test.tsx` (terminal) + `chat-adapter.test.ts` (chat) | PR1 / PR2 |
| #4 unresolvable path/line → text-only fallback or refuse | `CodeEditorAdapter.test.ts` (null path) + `useSendSelectionToAgent.test.tsx` (fallback) | PR1 |
| #5 superseded selection / adapter divergence | `useSendToTerminalAgent.test.ts` (parity) + `useSendSelectionToAgent.test.tsx` (`clearIfStillCurrent`) + `chat-adapter.test.ts` (parity) | PR1 / PR2 |

**Defensive-guard scan:** the only "raise/throw"-style guards in the design surface are (a) the empty-selection inert guard (covered #1), (b) the large-selection bound (covered #2), and (c) the unresolvable-path refusal (covered #4) — each has a triggering scenario above, so no guard is dead-on-arrival.

**Cross-phase numeric-consistency check:** ran a grep of the design-doc H2/H3 sections for shared enumerated source-of-truth counts (PR count, edge-case count, wave count). Counts reconcile across sections: **2 PRs** (Rollout PR-chain table + Phase 7/8 Children + every sketch's PR tag), **5 edge cases** (Requirements + Rollout + the coverage matrix above all enumerate exactly #1–#5), **1 ship wave**. No drift — no needs_review entry warranted on numeric grounds.

## Rollout Strategy

Phase 3 (plan-rollout, autonomous mode). This is a **pure desktop-renderer + shared-UI-library client feature**: no backend service, no database, no API contract, no cross-repo edit. The rollout concern is therefore internal release-coherence within a single Electron app + monorepo package, not multi-service deploy ordering. Per the skill's short-form rule, all four high-risk markers are ABSENT (confirmed one-by-one below), so this is a single ship wave shipped as a strict linear PR chain.

### Touched surface table

Every category emits a row (no omissions). `detect-rollout-items.sh` is the oumi-Python detector and does not map to this TS/Electron repo, so the touched surface is derived from the Investigation upstream/midstream/downstream map (the skill's substitution rule for non-oumi stacks). Production-LOC is the rough size signal for the 500-LOC / 10-file cap; test LOC excluded.

| Area / layer | Files (representative) | What changes | PR |
| -- | -- | -- | -- |
| Desktop renderer — v2 viewer host (capture + affordance) | `apps/desktop/.../v2-workspace/$workspaceId/hooks/usePaneRegistry/components/FilePane/registry/views/CodeView/components/CodeEditor/CodeEditor.tsx`; `.../CodeEditor/CodeEditorAdapter/CodeEditorAdapter.ts` | Mount a "Send selection to agent" affordance over a non-empty CodeMirror selection; source path+lines+text from `getSelectionLines()` (already exposed). New colocated hook (`useSendSelectionToAgent/`). | PR1 |
| Desktop renderer — terminal dispatch (reuse) | `apps/desktop/.../hooks/host-service/useSendToTerminalAgent/useSendToTerminalAgent.ts` (consume, maybe extend `AgentPromptFileContext` to embed snippet) | Build inline file-context prompt via `formatAgentPromptWithFileContext` + dispatch to terminal agent through existing `AgentTarget` union. | PR1 |
| Desktop renderer — new-session wiring (reuse) | `apps/desktop/.../v2-workspace/$workspaceId/hooks/usePaneRegistry/usePaneRegistry.tsx` | Pass the selection-derived prompt into the existing `createNewAgentSession`/`agents.run` terminal path (no change to its non-terminal rejection in PR1). | PR1 |
| Desktop renderer — FileView prop plumbing (F-WIRE, added Phase 5.5) | `apps/desktop/.../FilePane/registry/types.ts` (`ViewProps`) | Add a NEW OPTIONAL `onCreateNewAgentSession?` field to the `ViewProps` interface so the new-session callback can reach `CodeView`. Optional → other renderers (`ImageView`/`MarkdownPreviewView`/etc.) stay source-compatible. Internal, additive, no external consumer → NOT a public-api-change. | PR1 |
| Desktop renderer — FilePane callback forwarding (F-WIRE, added Phase 5.5) | `apps/desktop/.../FilePane/FilePane.tsx` | Accept `createNewAgentSession` from `file.renderPane` and forward it through `<ViewRenderer>` onto `ViewProps` so it reaches `CodeView`. (`CodeView` is not a direct registry child — it is an `activeView.Renderer` rendered by `FilePane`.) | PR1 |
| packages/ui — popover shell (optional, decided Phase 5) | `packages/ui/src/components/ai-elements/text-selection-popover.tsx` | If reused, repurpose purely as a positioned floating-action-button shell (data still sourced from the adapter). May be left untouched if a viewer-local affordance is simpler. | PR1 (if used) |
| Registry-row commit (deferred from Phase 1) | local design doc / workflow registry only | Land the feature-issue registry row alongside the chain-root code. | PR1 |
| Desktop renderer — chat dispatch (NEW path, Variant B) | `apps/desktop/.../lib/agent-session-orchestrator/adapters/chat-adapter.ts`; `usePaneRegistry.tsx` (new chat-targeted send route) | Add a chat-targeted send path (route through `chat-adapter.ts` `initialPrompt`/`initialFiles`, or push into a chat-pane draft), since `agents.run` rejects non-terminal agents today. | PR2 |
| Desktop renderer — v1 viewer parity (optional) | `apps/desktop/.../screens/main/.../FileViewerPane/...`; `.../EditorContextMenu/useEditorActions.ts` | A "Send selection to agent" item beside the existing copy-path-with-line action. | PR2 |
| packages/shared — payload contract | `packages/shared/src/agent-launch-request.ts` | **NOT TOUCHED.** Carrier is the inline prompt that already lives in the desktop renderer (`useSendToTerminalAgent.ts`), not `buildPromptAgentLaunchRequest`. Only touched if chat Variant B is later routed through `buildPromptAgentLaunchRequest` — current plan routes chat through `chat-adapter.ts` directly, so no shared export changes. | none (unless PR2 routes through shared) |
| Electron main / IPC / filesystem | `electronTrpcClient.filesystem.*`, main process | **NOT TOUCHED.** Inline-prompt carrier needs zero renderer→main FS IPC (that path is attachment-only, and attachments are explicitly rejected for selections — Investigation Q1). | none |
| Database / Drizzle schema | — | **NOT APPLICABLE.** No persisted state; a selection is ephemeral prompt text. | none |
| API / OpenAPI / tRPC contract | — | **NOT APPLICABLE.** Reuses existing `workspaceTrpc.terminal.writeInput` / `agents.run` procedures; no new or changed procedure signature in PR1. (PR2 chat route uses the existing chat-adapter surface.) | none |
| Feature flag / Statsig | — | **NOT APPLICABLE.** No staged-exposure gate requested; the affordance ships on by default. | none |

### Boundary scan + Marker scan (four high-risk markers)

Each of the four canonical markers checked explicitly:

* **db-migration — ABSENT.** No Drizzle schema touch, no persisted state; the selection is ephemeral prompt text (Requirements stack-checklist + Investigation confirm no DB change).
* **feature-flag — ABSENT.** No new Statsig gate or runtime config knob; the affordance is unconditionally mounted (no staged-exposure request from the kickoff).
* **cross-repo-change — ABSENT.** All file paths are under the single `superset-sh/superset` monorepo (`apps/desktop`, `packages/ui`, possibly `packages/shared`). One owner/repo.
* **public-api-change — ABSENT.** Confirmed at source: the carrier `formatAgentPromptWithFileContext` already lives in the desktop renderer (`useSendToTerminalAgent.ts:30`), so no new `packages/shared` export is required, and `packages/shared/src/agent-launch-request.ts` is not touched in the planned chain. Even if a `packages/ui` symbol changes (popover shell), an internal monorepo export consumed only within this repo is **not** a public-api-change by this repo's convention (no external package version bump, no OpenAPI, no published-package consumer). If PR2 ever adds a new exported symbol to `packages/shared` consumed cross-package, re-evaluate — but that is internal-monorepo and still classified needs_review at most, per the AUTONOMOUS_MODE additive-downgrade rule, not High-risk.

Zero markers matched → zero High-risk marker entries written. Marker-scan summary: `categories_checked=4, matches=0, table_rows_scanned=11`.

### Deploy sequence / ship waves

**Single ship wave (Wave 1).** There is no backend, DB, API, or independently-deploying service, so there are no compatibility windows (no old-A/new-B pairing to tolerate) and no backfill. The entire feature ships in the desktop app + `packages/ui` together within one release. Both PRs in the chain are Wave 1; the chain is strict-linear (PR2 stacks on PR1) for reviewer-cognitive-load and because PR2's chat route reuses the capture+format primitives introduced in PR1 (overlapping files: `usePaneRegistry.tsx`), which per the skill's anti-pattern rule collapses any shared-file wave to strict-linear regardless.

* **Compatibility windows:** none (single client artifact; no service pair).
* **Backfill plan:** none (no data shape change).
* **Feature flag plan:** none (no gate).
* **Rollback plan:** per-PR git revert of the renderer change; no data loss (ephemeral prompt text only), no migration to reverse, no flag to disable. Time budget: immediate revert, no escalation path needed (client-only).

### PR-chain plan table (strict linear chain — replaces Linear child issues)

**Decision: 2 PRs.** PR1 is the minimal shippable happy path (terminal-only, v2 viewer) and is independently valuable. PR2 is split out because chat Variant B is a **confirmed real gap** (the sole send path `agents.run` rejects non-terminal agents at `usePaneRegistry.tsx:180-181`) requiring a genuinely new dispatch route — not a wiring tweak — and v1 parity is optional polish; bundling either into PR1 would inflate the chain-root diff and couple a proven path to an unproven one. Stacking (not parallel) because PR2 reuses PR1's capture/format primitives and both touch `usePaneRegistry.tsx`.

| PR | Branch | Stacks on | One-line scope | Edge cases it must cover (from Requirements) |
| -- | -- | -- | -- | -- |
| **PR1 (chain root)** | `jgreer013/highlight-to-llm-terminal-v2` | `main` | v2 CodeView/CodeEditor selection capture + "Send selection to agent" affordance → inline file-context prompt (`formatAgentPromptWithFileContext`, snippet embedded) → **terminal** agent via existing `useSendToTerminalAgent`/`AgentTarget`. Includes the deferred registry-row commit. | #1 empty/whitespace selection → affordance inert/disabled; #2 very-large selection → bound/chunk before formatting (prompt-budget guard); #3 no live agent session → defined behavior (queue into new-session launch or disable, mirror sibling's new-vs-existing `AgentTarget`); #4 unresolvable path/line (non-source buffer) → text-only fallback or refuse; #5 superseded selection → `clearIfStillCurrent`-style guard so a slow send doesn't wipe a newer selection. |
| **PR2 (optional)** | `jgreer013/highlight-to-llm-chat-and-v1` | PR1 | Chat "Variant B" dispatch: NEW chat-targeted send path (through `chat-adapter.ts` `initialPrompt`/`initialFiles` or chat-pane draft injection), since `agents.run` rejects non-terminal agents. Plus optional v1 `FileViewerPane`/`EditorContextMenu` parity item. | #5 adapter divergence — the single formatted context string must serialize **identically** into terminal (`terminal.writeInput`/PTY) and chat (`ChatLaunchConfig`) so the two surfaces don't diverge on what the agent receives; #3 no live chat session → defined behavior; plus #1/#2/#4 inherited from the shared capture/format primitive (no re-implementation). |

**Registry-row commit:** lands on PR1 (the chain-root), deferred from Phase 1 per the dispatch instruction.

### Wave-grouped PR index

* **Wave 1 (single wave):** PR1 (`jgreer013/highlight-to-llm-terminal-v2`, root) → PR2 (`jgreer013/highlight-to-llm-chat-and-v1`, stacks on PR1). Strict linear chain.

## Skeleton plan

Phase 5 (design-skeleton, autonomous mode). Interface-first contracts only — **no code, no stub files, no PR** in this phase; Phase 7 writes the implementations in-place. All signatures below were re-derived against the live branch (the issue's "wire the popover / use the attachment pipeline" phrasing was a hypothesis, already superseded by Phase 2). Identifier names are advisory — Phase 7 may rename. Contracts mirror the closest sibling (DiffPane inline agent-comment composer); deliberate divergences carry a one-line note.

### Ground-truth verification (read at Phase 5, against the active branch)

Confirmed signatures before designing (so the contracts attach to real seams, not the doc's prior summary):

* `formatAgentPromptWithFileContext({ comment, file })` — EXISTS, `useSendToTerminalAgent.ts:30-45`. `file: AgentPromptFileContext = { path: string; startLine: number; endLine: number; side?: "additions"|"deletions"|"mixed" }`. Returns `In <path>:L<a>-L<b>[ (side)]: <comment>`; single line collapses to `L<a>` (`:35-37`); **`side` is already optional and omitted for the file-viewer case** — no diff plumbing leaks in. The comment string is interpolated verbatim, so the snippet is embedded by composing it INTO `comment`, not by changing this signature.
* `useSendToTerminalAgent()` → `{ send(input: SendToTerminalAgentInput): Promise<void>; isPending: boolean }`, `SendToTerminalAgentInput = { workspaceId; terminalId; text }` — EXISTS, `:47-87`. `send` toasts on error and **re-throws** (`:79-81`); the hook's trailing-newline normalization is via `normalizeTerminalCommand(text)`.
* `AgentTarget = { kind:"existing"; terminalId } | { kind:"new"; configId; placement }`, `AgentSessionPlacement = "split-pane"|"new-tab"` — EXISTS, `useDiffCommentTarget.ts:5-9`.
* `clearIfStillCurrent(submitted)` supersede guard — EXISTS as a sibling-local `useCallback` over a `composerRef`, `useDiffCommentComposer.ts:99-107` (compares `composerRef.current === submitted`). It is NOT exported; the new hook re-implements the same ref-identity pattern.
* v2 `CodeEditorAdapter` — interface `:11-23` + `createCodeMirrorAdapter(view)` `:25-143`. `getSelectionLines(): EditorSelectionLines` reads `view.state.selection.main` and **always returns a non-null `{startLine,endLine}`** (1-based) — there is NO `.empty` guard inside `getSelectionLines()`, so a collapsed cursor still yields `{startLine,endLine}` (both equal to the cursor's line). Only `copy()`/`cut()` short-circuit on `selection.empty` (`:71, :103`). Selected **text** is reachable only inside `copy()`/`cut()` via `view.state.sliceDoc(selection.from, selection.to)` (`:73, :106`). Consequence: the new `getSelection(path)` must NOT lean on a null from `getSelectionLines()` for empty-selection detection — it introduces its own `selection.empty` + `sliceDoc().trim()===""` null guard as net-new logic.
* v1 `CodeEditorAdapter` — interface-only file (`screens/main/.../ContentView/components/CodeEditorAdapter/CodeEditorAdapter.ts`); the `createCodeMirrorAdapter` impl lives in `screens/main/.../WorkspaceView/components/CodeEditor/CodeEditor.tsx:46` with the **same** `getSelectionLines`/`sliceDoc` internals (`:77-78, :91-94, :122-126`). v1 surfaces the adapter through `useEditorActions({ getEditor, filePath, editable })` → `EditorActions`, which already derives `path:start-end` for `onCopyPathWithLine` (`useEditorActions.ts:52-72`).
* **Chat dispatch — CORRECTION to the Phase-2 framing.** The chat path is NOT a gap at the adapter layer. `launchAgentSession(request, context)` (`agent-session-orchestrator.ts:100-192`) dispatches on `request.kind`: `kind:"chat"` → `launchChatAdapter` → `ChatLaunchConfig.initialPrompt` (`chat-adapter.ts:7-33, 90-92`). The chat `AgentLaunchRequest` shape is the Zod `chatAgentLaunchRequestSchema` (`agent-launch.ts:92-95`): `{ kind:"chat"; workspaceId; chat: { initialPrompt?; initialFiles?; paneId?; sessionId?; model?; autoExecute?; ... } }`. `launchAgentSession` is already called from production renderer sites (`OpenInWorkspace.tsx`, `RunInWorkspacePopover.tsx`, `start-agent-session.ts`). The ONLY thing that rejects non-terminal agents is the DiffPane sibling's `createNewAgentSession` → `agents.run` path (`usePaneRegistry.tsx:175-183`). **So PR2's chat dispatch is: construct a `kind:"chat"` request from the SAME formatted string and route it through the existing, proven `launchAgentSession` — NOT through `agents.run`.** This makes Variant B materially lower-risk than Phase 2 estimated, and the seam already exists.
* Mount point — `CodeView.tsx` (`.../CodeView/CodeView.tsx`) is currently a 20-line pass-through that renders `<CodeEditor>` and does NOT capture `editorRef`. `ViewProps` (`registry/types.ts:33-40`) already supplies `{ document, filePath, workspaceId, isActive, ... }`. So the affordance host has path + workspaceId in hand; it only needs to hold an `editorRef` and mount the action.
* Test framework — `bun:test` (`agent-launch-request.test.ts:1`), confirming the Phase-4 translation.

### Architecture / DI posture

The sibling uses **prop/callback injection**, not class DI — React hooks with injected callbacks (`onCreateNewAgentSession`) and tRPC mutation hooks resolved at the hook boundary. The skeleton follows that exact posture (it is the in-repo convention; abstract-class DI would be a foreign body here). The one shared, pure seam — the formatter — stays a free function so both adapters consume byte-identical output. DI-not-used rationale: matches the closest sibling and the renderer's hook architecture; the only injected dependency is the new-session/chat launcher callback, mirroring `useDiffCommentComposer`'s `onCreateNewAgentSession`.

### Contract 1 — `CodeEditorAdapter` selection accessor (NEW)

**Decision: add ONE combined `getSelection()`, not a separate `getSelectionText()`.** Rationale: the four edge contracts (#1 empty, #4 unresolvable) and the formatter all need lines + text + path **atomically from the same `view.state` read**. Two getters (`getSelectionLines()` already exists; a new `getSelectionText()`) would let a caller observe a torn selection (lines from read A, text from read B) across a re-render — exactly the superseded-selection hazard (#5) in miniature. One getter that snapshots `view.state.selection.main` once is the safe shape. `getSelectionLines()` stays (the existing `onCopyPathWithLine` consumer depends on it); `getSelection()` is added alongside.

Added to the `CodeEditorAdapter` interface (both v2 and the v1 equivalent) and to both `createCodeMirrorAdapter` impls:

```ts
/** A captured, resolved selection ready to anchor an agent prompt.
 *  `path` is supplied by the host (the adapter does not know its own file path);
 *  the adapter fills lines + text from a single view.state read.
 *  NOTE: named `CapturedEditorSelection` (not `EditorSelection`) to avoid
 *  colliding with `@codemirror/state`'s exported `EditorSelection`, which is
 *  already imported in `CodeEditorAdapter.ts`. */
export interface CapturedEditorSelection {
	path: string;
	startLine: number; // 1-based, from view.state.doc.lineAt(...).number
	endLine: number;   // 1-based; equals startLine for a single-line selection
	text: string;      // view.state.sliceDoc(from, to) — the exact highlighted substring
}

export interface CodeEditorAdapter {
	// ...existing members unchanged...
	getSelectionLines(): EditorSelectionLines; // UNCHANGED — kept for onCopyPathWithLine; ALWAYS non-null (no .empty guard; a collapsed cursor still returns {startLine,endLine})
	/** Snapshot the current selection as a prompt-ready region, or null when there
	 *  is nothing sendable. The null is NET-NEW logic in getSelection() — it does NOT
	 *  inherit a null from getSelectionLines() (which never returns null). Returns null
	 *  when selection.empty (collapsed cursor) OR the sliced text is empty/whitespace-only
	 *  (edge #1). `path` is injected by the caller because the adapter has no file-path
	 *  knowledge. */
	getSelection(path: string): CapturedEditorSelection | null; // (NEW)
}
```

**Null/empty contract (edge #1):** `getSelection()` returns `null` iff `view.state.selection.main.empty` OR `sliceDoc(from,to).trim() === ""`. This null is **net-new logic introduced by `getSelection()`** — it is NOT inherited from `getSelectionLines()`, which always returns a non-null `{startLine,endLine}` (the existing getter has no `.empty` guard; only `copy()`/`cut()` check `.empty`). A non-null result guarantees `text` is non-empty and `startLine`/`endLine` are finite, ≥1 integers (never `NaN`) — this is the invariant the hook and formatter rely on.

**Unresolvable-path contract (edge #4) — PR1: REFUSE-ONLY; text-only deferred to PR2. NEVER `In undefined:LNaN`.** Because the adapter only operates over a live CodeMirror `view`, in the v1/v2 code viewer a non-empty selection ALWAYS has a resolvable path (the host's `filePath` from `ViewProps`, which is a required non-optional `string` always bound to a real on-disk file path) and finite lines. The "unresolvable path" case (diff/search-result/virtualized/rendered-preview buffer) is a host that has NO CodeMirror adapter at all — so the affordance is simply not mounted there (it cannot construct `getSelection(path)` without a path). The contract is therefore enforced **structurally**: `path` is a required non-optional parameter of `getSelection(path)`, so it is impossible to produce a region with a missing path. **In PR1 the shipped behavior is refuse-only**: `useSendSelectionToAgent.send()` runs `shouldRefuseSelection(region)` and is a no-op when the capture is null/empty (edge #1) OR — defensively — has an empty/whitespace `path` or non-finite line range (edge #4). The text-only fallback (a real selection but no on-disk path) is **not built in PR1** — it is **deferred to PR2 hosts** that lack a CodeMirror adapter; until then such a selection is refused, not sent text-only. **Hard invariant: no code path ever interpolates `undefined`/`NaN` into the anchor** — the formatter is only ever called with a fully-resolved `AgentPromptFileContext`, the refuse gate rejects any malformed region, and there is no text-only branch in PR1 to bypass it.

### Contract 2 — `useSendSelectionToAgent` hook (NEW)

Colocated under the v2 viewer: `.../CodeView/components/CodeEditor/hooks/useSendSelectionToAgent/`. This is the orchestration seam; it owns four of the five edge cases. Mirrors `useDiffCommentComposer`'s submit/dispatch/guard shape.

```ts
interface UseSendSelectionToAgentArgs {
	workspaceId: string;
	filePath: string;
	/** Stable getter for the live adapter (mirrors useEditorActions' getEditor). */
	getEditor: () => CodeEditorAdapter | null | undefined;
	/** New-terminal-session launcher — injected, mirrors the sibling's
	 *  onCreateNewAgentSession (usePaneRegistry.createNewAgentSession). */
	onCreateNewAgentSession?: (
		input: { configId: string; placement: AgentSessionPlacement; prompt: string },
	) => Promise<{ terminalId: string } | null>;
}

interface SendSelectionInput {
	/** Optional user instruction; when absent, a default verb is used (see below). */
	instruction?: string;
	/** Optional target OVERRIDE. When omitted (the common case), the hook resolves
	 *  the DEFAULT target = the active/open agent, else a new session (see
	 *  "Default target resolution" below). Pass this only to force a specific
	 *  destination, e.g. an explicit "send to NEW session" menu item. */
	target?: AgentTarget;
}

interface UseSendSelectionToAgentResult {
	/** True iff getEditor()?.getSelection(filePath) is non-null right now. Drives
	 *  the affordance's disabled state (edge #1). ADVISORY UI hint only: `send()`
	 *  re-captures the selection at dispatch time and that capture is authoritative,
	 *  so no caller may assume the button-state region equals the dispatched region
	 *  (canSend and send() read getSelection() separately — a display-vs-dispatch gap). */
	canSend: boolean;
	send: (input: SendSelectionInput) => Promise<void>;
	isPending: boolean;
}

export function useSendSelectionToAgent(
	args: UseSendSelectionToAgentArgs,
): UseSendSelectionToAgentResult;
```

What `send()` composes, in order:
1. Capture `region = getEditor()?.getSelection(filePath)`. If `shouldRefuseSelection(region)` → **no-op** (edge #1 null/empty AND edge #4 unresolvable path/non-finite lines, refuse-only in PR1; never calls the formatter, never dispatches).
2. **Bound** the snippet via `boundSelectionSnippet(region.text)` (Contract 3) BEFORE formatting (edge #2).
3. Build the prompt by composing the snippet into `comment`, then calling the existing `formatAgentPromptWithFileContext({ comment, file: { path, startLine, endLine } })` (no `side`). The `comment` = `instruction ?? DEFAULT_INSTRUCTION` followed by a fenced code block of the bounded snippet — so the output carries BOTH the `In <path>:L<a>-L<b>: <instruction>` anchor AND the exact lines (Phase-2 Q1 prior-art convergence).
4. Dispatch via `AgentTarget` exactly as the sibling (`useDiffCommentComposer.ts:168-194`): `kind:"existing"` → `useSendToTerminalAgent().send({ workspaceId, terminalId, text })`; `kind:"new"` → `onCreateNewAgentSession({ configId, placement, prompt: text })`.
5. On success, run a `clearIfStillCurrent`-style ref-identity guard (edge #5) so a slow dispatch for selection A does not clear/overwrite a newer selection B. On error, the terminal hook already toasts + re-throws; `send()` catches, keeps state for retry, does not rethrow to render (matches `useDiffCommentComposer.ts:191-194`).

**Default target resolution — USER-CONFIRMED (2026-06-23): route into the active/open agent by default; new session only when none is open.** When `SendSelectionInput.target` is omitted (the common path), `send()` resolves the target via the sibling's `useDiffCommentTarget` priority ladder (alive/active terminal → most-recent session → last config → first config). The FIRST rung — an alive/active agent — is the default: the selection is dispatched into that already-open session via `useSendToTerminalAgent().send({ workspaceId, terminalId, text })` (i.e. `terminal.writeInput`), so the highlight becomes the **next turn of the conversation the user already has open** — preserving continuity and avoiding session sprawl. Only when no agent session is alive does the ladder fall through to a new session.

**No-session fallback (edge #3) — never silent-drop.** When no live session exists, the resolver yields `{kind:"new", configId, placement}` and `send()` launches a fresh session via the injected `onCreateNewAgentSession`. If `onCreateNewAgentSession` is absent (not wired) the hook toasts "Couldn't start a new agent session" exactly like the sibling (`useDiffCommentComposer.ts:169-172`) — still not a silent drop.

**No-agent feedback (edge #3, no-target sub-case) — never silent-fail.** Distinct from the unwired-launcher case above: when the target ladder yields **null** (no live terminal agent AND no agent config at all — `useDiffCommentTarget.resolved === null`), there is a sendable selection but nowhere to send it. `send()` surfaces a clear, actionable toast — `"No agent available to send to. Start an agent in this workspace, or add one in Settings → Agents."` (sonner `toast.error`) — instead of the misleading "couldn't start a new session" error. This is **parity-plus over the DiffPane composer**, whose null-target path collapses to the generic launcher-failure message. The decision is made by a pure classifier, `resolveSendOutcome(region, target) → "dispatch" | "no-agent" | "no-selection"` (`resolveSendOutcome.ts`), so the no-agent branch is unit-tested (`resolveSendOutcome.test.ts`) without a renderHook harness: `region` sendable + `target === null` ⇒ `"no-agent"`; refuse gate wins when both fail (`"no-selection"` over `"no-agent"`).

**Keyboard shortcut — Cmd/Ctrl+Enter (Mod-Enter).** In addition to the floating "Send selection to agent" button, the v2 `CodeEditor` binds `Mod-Enter` in its CodeMirror keymap (alongside the existing `Mod-s` save binding) to trigger the same default-target send. `CodeView` threads `onSendSelection={() => void send({})}` into `<CodeEditor>`, held in `onSendSelectionRef` (mirroring `onSelectionChangeRef`) so the chord always calls the latest handler. The keymap entry gates on selection-presence by reusing the adapter's `captureSelection(view.state, "")` (path arg irrelevant to its null decision — no duplicated empty check): it returns `true` (consuming the chord, no stray newline) ONLY when a non-empty selection exists, and `false` otherwise so `Mod-Enter` falls through to default editor behavior. The button stays; the shortcut is an addition. `Mod-Enter` was confirmed unbound in this editor before the change (only `Mod-s` was custom-bound; `Mod-Enter` is not in `defaultKeymap`).

**Chat (PR2) mirrors this default.** The chat dispatch (Contract 5) likewise defaults to the active/open chat pane (inject the context as its next turn / draft) and falls back to opening a new chat pane with the context as `initialPrompt` only when none is open — the same active-else-new policy as the terminal path.

`DEFAULT_INSTRUCTION` (when the user gives no instruction) is a named constant (e.g. `"Here is the selected code:"`) so the prompt is never an empty-comment `In <path>:L<a>-L<b>: ` with a dangling colon.

### Contract 3 — Large-selection bound helper (NEW)

**Decision: pure free function, line-cap primary + char-cap backstop, with an explicit truncation marker.** Placed as a colocated util beside the hook (`.../useSendSelectionToAgent/boundSelectionSnippet.ts`) rather than `packages/shared` — it has exactly one consumer (the hook) and the simplification pass forbids generalizing for a hypothetical second consumer. If PR2's chat path or v1 parity needs it, promote then.

```ts
export const SELECTION_MAX_LINES = 400;       // primary cap
export const SELECTION_MAX_CHARS = 20_000;    // backstop for very long single lines
// Marker carries the KEPT range explicitly so the agent sees exactly which lines
// it has and which it must re-read from disk, e.g.
//   "\n… [selection truncated — kept lines L40-L439 of L40-L1200]\n"
export const SELECTION_TRUNCATION_MARKER = "\n… [selection truncated — kept lines L<a>-L<a+kept-1> of L<a>-L<b>]\n";

/** Bound a selected snippet to the prompt budget before it is embedded.
 *  Truncation keeps the HEAD of the selection (where the user started the
 *  highlight) and appends an explicit, human-readable elision marker so the
 *  agent knows the snippet is partial. Returns { text, truncated }. */
export function boundSelectionSnippet(raw: string): { text: string; truncated: boolean };
```

Policy: cap at `SELECTION_MAX_LINES` lines; if the head-bounded result still exceeds `SELECTION_MAX_CHARS`, hard-cut at the char cap. Either truncation appends `SELECTION_TRUNCATION_MARKER` (with the kept range filled in). A selection under both caps is returned verbatim with `truncated:false` (no marker). **Head-keep is a documented heuristic, not a guarantee** — keeping the head (where the user began the highlight, the likeliest intent anchor) is a best-effort choice; the actual safety net is that the full `L<a>-L<b>` anchor in the prompt always reflects the COMPLETE selected range AND the truncation marker carries the kept sub-range, so the agent always knows the snippet is partial and can re-read the rest from disk. The line/endLine anchor in the prompt therefore always reflects the FULL selected range, never the truncated extent.

### Contract 4 — Shared formatter seam (CONFIRMED, reused as-is for both PRs)

`formatAgentPromptWithFileContext` is **already the right shared seam** and needs **no refactor**. Its current signature (`{comment, file}` → string, `side` optional) cleanly supports the file-viewer case (omit `side`) and the chat case (chat consumes the same returned string). Both PR1 (terminal) and PR2 (chat) call this SAME function with the SAME args and embed the SAME bounded snippet. The edge-#5 parity invariant is therefore: the two surfaces are **trim-normalized equal on the default (non-draft) path** — NOT byte-identical. The divergence is transport-layer AND is not a pure trailing-newline diff: terminal serialization appends a trailing `\n` via `normalizeTerminalCommand`, while chat serialization does `initialPrompt?.trim()` (trims BOTH ends) inside `toLaunchConfig`. So after normalizing leading/trailing whitespace the two are equal; a raw byte comparison would spuriously fail. (See Contract 5 for the draft-mode caveat — `autoExecute === false` nulls `initialPrompt` and `toLaunchConfig` can return null with no `taskSlug`, which would DROP the selection; the parity guarantee holds only on the non-draft path.) The guarantee is enforced by both surfaces sharing one formatter rather than re-serializing. **No minimal refactor required** — the function is already pure, already exported from `useSendToTerminalAgent.ts`, and already consumed by a second caller (the DiffPane sibling), proving reuse works. (Note: it lives in `useSendToTerminalAgent.ts` not `packages/shared`; that is fine — chat-side code in PR2 imports it from the same renderer module, no cross-package export needed, so this stays NOT a public-api-change.)

### Contract 5 — Chat dispatch (PR2)

The chat-targeted send does NOT go through `agents.run` (terminal-only). It constructs a `kind:"chat"` `AgentLaunchRequest` from the SAME formatted string and routes it through the existing `launchAgentSession`:

```ts
// New thin dispatcher (colocated with the chat affordance, PR2). Reuses the
// SAME formatted `text` the terminal path uses — no re-serialization.
async function sendSelectionToChat(args: {
	workspaceId: string;
	text: string;          // formatAgentPromptWithFileContext output (already bounded)
	paneId?: string;       // when present → reuse/convert that pane (chat-adapter.ts:49-69)
}): Promise<AgentLaunchResult> {
	return launchAgentSession(
		{
			kind: "chat",
			workspaceId: args.workspaceId,
			// autoExecute is pinned to the NON-DRAFT value (true) for a selection send.
			// Do NOT omit-into-draft: when autoExecute===false, chat serialization sets
			// initialPrompt: undefined (draft mode) and toLaunchConfig can return null when
			// no taskSlug is present — either path DROPS the selection. Pinning true keeps
			// initialPrompt populated and the selection delivered.
			chat: { initialPrompt: args.text, paneId: args.paneId, autoExecute: true },
		},
		{ source: "file-viewer-selection" }, // AgentSessionLaunchContext
	);
}
```

`launchChatAdapter` already maps `initialPrompt` into `ChatLaunchConfig.initialPrompt` (`chat-adapter.ts:7-33, 90-92`) and handles pane reuse vs. new-tab. **No-chat-session (edge #3 for chat):** when no `paneId` is supplied, `launchChatAdapter` calls `tabs.addChatTab(...)` — opens a chat pane with the context as `initialPrompt`, NOT a silent drop and NOT the "isn't a terminal agent" rejection. **No-draft-drop invariant:** the selection send MUST NOT be converted to a draft. Chat serialization sets `initialPrompt: undefined` when `autoExecute === false` (draft mode), and `toLaunchConfig` can return `null` when no `taskSlug` is present — either path silently DROPS the selection. The dispatcher therefore pins `autoExecute: true` (above) and the selection is sent even when no `taskSlug` exists. The unit `chat-adapter.test.ts` (PR2) pins that the chat-side `initialPrompt` is **trim-normalized equal** to the terminal-side `text` (edge-#5 parity, chat half) AND that the selection is not dropped when no `taskSlug` is present. **Phase-2 resolution:** the "chat has no production send path" framing is downgraded — the adapter+orchestrator path is complete and reachable; PR2 only adds a selection-originated caller. (Logged in Decisions log.)

**Decision (parity enforcement) — test-enforced, not type-enforced.** `AgentTarget` is terminal-only (`{kind:"existing"} | {kind:"new"}`); chat is reached via the separate `sendSelectionToChat` function above, so terminal/chat parity is a *convention*, not a structural type guarantee. For the minimal-shippable PR2, this parity is **test-enforced** — the `chat-adapter.test.ts` parity sketch asserts the chat-side `initialPrompt` is trim-normalized equal to the terminal-side `text`. It is deliberately NOT type-enforced via an `AgentTarget {kind:"chat"}` arm. Extending `AgentTarget` with a `{kind:"chat"}` arm to make parity structural (one dispatch union, both surfaces) is a possible follow-up; the design is left as-is for PR2 to keep the chain-root diff small and avoid re-shaping the sibling's terminal-only union.

### File-by-file plan

**PR1 (chain root) — terminal, v2 viewer:**

| File | Add/Modify | Contract | Test sketch coverage |
| -- | -- | -- | -- |
| `.../CodeView/components/CodeEditor/CodeEditorAdapter/CodeEditorAdapter.ts` | Modify (interface + impl: add `getSelection(path)` + `CapturedEditorSelection` type) | Contract 1 | `CodeEditorAdapter.test.ts` (PR1) |
| `.../CodeView/components/CodeEditor/hooks/useSendSelectionToAgent/useSendSelectionToAgent.ts` | Add (NEW hook) | Contract 2 | `useSendSelectionToAgent.test.tsx` (PR1) |
| `.../CodeView/components/CodeEditor/hooks/useSendSelectionToAgent/boundSelectionSnippet.ts` | Add (NEW util) | Contract 3 | `useSendSelectionToAgent.test.tsx` bound cases (PR1) |
| `.../CodeView/CodeView.tsx` | Modify (hold `editorRef`, mount affordance, pass `filePath`/`workspaceId`; read `onCreateNewAgentSession` off `ViewProps`) | Consumer mount | (covered via hook test + manual) |
| `.../FilePane/registry/types.ts` (`ViewProps`) | Modify (add a NEW OPTIONAL `onCreateNewAgentSession?` field to the `ViewProps` interface — see note) | Contract 2 wiring | — |
| `.../FilePane/FilePane.tsx` | Modify (accept `createNewAgentSession` from `file.renderPane` and forward it through `<ViewRenderer>` onto `ViewProps` so it reaches `CodeView`) | Contract 2 wiring | — |
| `.../useSendToTerminalAgent/useSendToTerminalAgent.ts` | (Consume only — formatter already supports the file-viewer case; **likely unchanged**) | Contract 4 | `useSendToTerminalAgent.test.ts` (PR1, new file for existing fn) |
| `.../usePaneRegistry/usePaneRegistry.tsx` | (Reuse `createNewAgentSession`; pass it into `<FilePane>` via `file.renderPane` — NOT directly to `CodeView`, which is not a registry child) | Contract 2 wiring | — |

> **Note — `ViewProps` contract widening:** adding `onCreateNewAgentSession?` to `ViewProps` widens the interface shared by ALL FileView renderers (`ImageView`/`MarkdownPreviewView`/etc.), not just `CodeView`. Keep it OPTIONAL so the other renderers ignore it and stay source-compatible; only `CodeView` consumes it.

**PR2 (stacks on PR1) — chat + optional v1 parity:**

| File | Add/Modify | Contract | Test sketch coverage |
| -- | -- | -- | -- |
| chat dispatcher (colocated, e.g. `.../useSendSelectionToAgent/sendSelectionToChat.ts` or extend the hook with a chat target) | Add (NEW) | Contract 5 | `chat-adapter.test.ts` (PR2) |
| `.../adapters/chat-adapter.ts` | (Consume only — `initialPrompt` path already complete; **likely unchanged**) | Contract 5 | `chat-adapter.test.ts` (PR2) |
| v1 `screens/main/.../ContentView/components/CodeEditorAdapter/CodeEditorAdapter.ts` + impl in `screens/main/.../WorkspaceView/components/CodeEditor/CodeEditor.tsx` | Modify (add `getSelection(path)` parity) | Contract 1 (v1) | `useEditorActions.test.ts` (PR2, optional) |
| `.../EditorContextMenu/useEditorActions.ts` | Modify (add `onSendSelectionToAgent` action beside `onCopyPathWithLine`) | Consumer mount (v1) | `useEditorActions.test.ts` (PR2, optional) |

### Consumer-completeness check (every call site that must change for the affordance to be reachable)

1. **PR1 — v2 mount (the load-bearing one):** `CodeView.tsx` must change from a pass-through to a host that (a) creates an `editorRef: MutableRefObject<CodeEditorAdapter|null>` and passes it to `<CodeEditor editorRef={...}>` (the prop already exists, `CodeEditor.tsx:50`), (b) calls `useSendSelectionToAgent({ workspaceId, filePath, getEditor: () => editorRef.current, onCreateNewAgentSession })`, and (c) renders the "Send selection to agent" affordance bound to `canSend`/`send`. **Without this change the hook is defined but unreachable** — this is the single must-change consumer for PR1.
2. **PR1 — new-session callback wiring:** `usePaneRegistry.tsx`'s existing `createNewAgentSession` (`:165-205`) must be threaded into `CodeView`/the hook as `onCreateNewAgentSession`. **CORRECTION:** this does NOT reach `CodeView` "the same way the DiffPane gets it." `DiffPane` is constructed directly in the registry (`usePaneRegistry.tsx` `diff.renderPane`), so it receives `createNewAgentSession` as a direct prop. `CodeView` is NOT a direct registry child — it is an `activeView.Renderer` rendered by `FilePane` (`FilePane.tsx`) via `<ViewRenderer>`, and the `ViewProps` interface (`registry/types.ts`) has NO agent-launch field today. So the callback must instead be threaded: registry `file.renderPane` → `<FilePane>` → a NEW optional field on `ViewProps` → forwarded through `FilePane`'s `<ViewRenderer>` → `CodeView`. If not threaded, edge #3's new-session branch toasts instead of launching.
3. **Affordance UI shell:** a positioned button/menu item. Two acceptable mounts (Phase-7 picks): a context-menu item (cheapest — v2 may gain a CodeView context menu, or reuse the existing `MenuActionConfig` system), or the repurposed `TextSelectionPopover` as a floating button shell positioned over the selection (data still from the adapter, per Phase-2 dep verdict). Either way the click handler calls `send(...)`.
4. **PR2 — v1 parity (optional, gated):** `EditorContextMenu`/`useEditorActions.ts` adds a `onSendSelectionToAgent` action beside the existing `onCopyPathWithLine`; the v1 `EditorContextMenu` component must render the new item. Without it, v1 has capture but no send.
5. **PR2 — chat target reachability:** the affordance (or its target picker) must offer a chat target that calls `sendSelectionToChat` → `launchAgentSession({kind:"chat"})`. Without a chat-target option in the UI, Variant B is defined but unreachable.

### Planned PR sequence (interfaces-first within the chain)

The repo convention is colocated-hook + free-function, not a separate published interface package, so "interfaces first" maps to **ordering within PR1**: land Contract 1 (adapter `getSelection`) + Contract 3 (bound util) + Contract 4 (formatter, unchanged) as the lowest layer, then Contract 2 (hook) consuming them, then the `CodeView` mount. PR1 is independently shippable (terminal-only, v2). PR2 stacks on PR1 and reuses Contracts 1/3/4 verbatim, adding only Contract 5 (chat dispatch) + optional v1 parity. This matches the Rollout Strategy single-wave strict-linear chain; no new deploy step is introduced (no service the Rollout didn't include → no Phase-3 rework directive needed).

### Alternatives considered

* **Two getters (`getSelectionLines()` + new `getSelectionText()`) vs. one combined `getSelection(path)`.** Rejected two-getter: a caller could read lines and text across a re-render and observe a torn selection (a micro version of edge #5). One atomic snapshot is safer and is what the formatter needs anyway. Kept `getSelectionLines()` only because an existing consumer (`onCopyPathWithLine`) depends on it.
* **Attachment-pipeline carrier (`.superset/attachments/` + `initialFiles`) vs. inline prompt.** Rejected (Phase-2 Q1, ratified here): attachments drop the path+line anchor, require base64 data-URLs, and cross renderer→main FS IPC. Inline `formatAgentPromptWithFileContext` preserves the anchor, needs zero IPC, and is the in-repo + prior-art convention.
* **Chat via a new `agents.run`-style procedure vs. the existing `launchAgentSession({kind:"chat"})`.** Rejected the new procedure: the orchestrator already routes `kind:"chat"` to a complete `launchChatAdapter`. Reusing it keeps terminal/chat byte-identical (one formatter, one launcher entrypoint) and avoids touching `packages/shared` schemas.
* **`boundSelectionSnippet` in `packages/shared` vs. colocated util.** Rejected shared: one consumer today; the simplification pass forbids premature generalization. Promote when PR2/v1 needs it.
* **Truncate head vs. tail vs. middle-elision.** Chose head-keep (where the user began the highlight is most likely the intent anchor) with an explicit marker; full line range still recorded so the agent can read the remainder from disk.

### Design summary (for review issue)

#### Customer-facing experience

A person reading code in the desktop file viewer can highlight any region and send it — with its file path and line range — straight to an LLM agent (Claude Code in the terminal, or the in-app chat), without copying text or hand-attaching files. The highlighted lines arrive as the agent's context with an `In <file>:L<a>-L<b>` anchor plus the exact snippet, so the agent knows precisely what to act on. If no agent session is open, sending starts one rather than dropping the request.

#### Frontend

A new `getSelection(path)` accessor on the CodeMirror editor adapter snapshots the highlighted region (lines + text) in one read; a new `useSendSelectionToAgent` hook composes that into the existing shared prompt formatter and dispatches via the existing `AgentTarget` union (existing terminal, or a freshly launched session). The `CodeView` host — today a pass-through — gains an editor ref and mounts the "Send selection to agent" affordance. Empty selections disable the action; oversized selections are bounded with an explicit truncation marker before sending.

#### Science

N/A — no model, training, evaluation, or data-science component; this is a UI + prompt-plumbing change only.

#### Backend

N/A — no backend service, database, API, or IPC change. The terminal path reuses the existing `terminal.writeInput`/`agents.run` procedures and the chat path reuses the existing `launchAgentSession({kind:"chat"})` orchestrator; no new or changed procedure signature, no `packages/shared` export change.

### Files likely to touch (final)

* apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/FilePane/registry/views/CodeView/components/CodeEditor/CodeEditorAdapter/CodeEditorAdapter.ts
* apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/FilePane/registry/views/CodeView/components/CodeEditor/hooks/useSendSelectionToAgent/useSendSelectionToAgent.ts
* apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/FilePane/registry/views/CodeView/components/CodeEditor/hooks/useSendSelectionToAgent/boundSelectionSnippet.ts
* apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/FilePane/registry/views/CodeView/CodeView.tsx
* apps/desktop/src/renderer/hooks/host-service/useSendToTerminalAgent/useSendToTerminalAgent.ts
* apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/usePaneRegistry.tsx
* apps/desktop/src/renderer/lib/agent-session-orchestrator/adapters/chat-adapter.ts (PR2 — consume; likely unchanged)
* apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/components/CodeEditorAdapter/CodeEditorAdapter.ts (PR2 — v1 parity, optional)
* apps/desktop/src/renderer/screens/main/components/WorkspaceView/components/CodeEditor/CodeEditor.tsx (PR2 — v1 adapter impl, optional)
* apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/components/EditorContextMenu/useEditorActions.ts (PR2 — v1 parity, optional)

### Recommended Reviewers (final)

*No recommended reviewers from eng:suggest-reviewers — the pool is restricted to the @oumi-ai/louk-at-my-pr team, but this is the superset-sh/superset repo (empty team intersection, expected; not an error).* Git-history evidence for manual assignment (unchanged from Phase 2): **Kiet** (authored the DiffPane inline agent-comment composer sibling + `useSendToTerminalAgent`/`TextSelectionPopover` — strongest match), **Satya Patel** (v2 file editor foundation + agent-launch-request), **Avi Peltz**. No diff from the Phase-2 guess.

## Verification Status

Phase 6 (verify-rollout-plan, autonomous mode `dispatch-autonomous=true`). **Verdict: PASS.** This is a client-only desktop (Electron renderer) + shared-UI-library feature — no backend, DB, API, or cross-repo surface — so the five-check matrix is scoped accordingly (Checks 2/4/5 below are N/A and explicitly recorded, not omitted). Verified 2026-06-23 against the live branch `jgreer013/code-inspection-context`.

### High-risk marker gate (the halt gate)

Re-verified each of the four canonical markers against the FINAL design (Skeleton plan + the Phase-5.5-amended file-by-file plan), not just the Phase-3 boundary scan. All four ABSENT → the autonomous halt does NOT fire.

* **db-migration — ABSENT.** No Drizzle schema touch, no persisted state. A selection is ephemeral prompt text; nothing in any contract writes a row.
* **feature-flag — ABSENT.** No Statsig gate, no runtime config knob. The affordance is unconditionally mounted (no staged-exposure request).
* **cross-repo-change — ABSENT.** Every path in the final file-by-file plan is under the single `superset-sh/superset` monorepo (`apps/desktop`, optionally `packages/ui`). One owner, one repo.
* **public-api-change — ABSENT.** Two candidates were examined explicitly against source and both cleared:
  1. The carrier `formatAgentPromptWithFileContext` already lives in the desktop renderer (`useSendToTerminalAgent.ts:30`) and `packages/shared/src/agent-launch-request.ts` is NOT touched (Touched-surface table; Contract 4 note) — no new shared export.
  2. **PR1 widens `ViewProps`** (`registry/types.ts:33-40`) with an OPTIONAL additive `onCreateNewAgentSession?` field (F-WIRE). **Ruling: this is NOT a public-api-change.** `ViewProps` is an internal renderer interface (`Renderer: ComponentType<ViewProps>`, confirmed at source lines 30/33-40) consumed only within this repo; the field is optional and additive, so all sibling renderers (`ImageView`/`MarkdownPreviewView`/etc.) stay source-compatible; there is no published-package version bump, no OpenAPI, no external consumer. By this repo's convention an internal, optional, additive field on an internal interface is not a public API change. **Confirmed, not disputed.** (If a FUTURE PR adds a new *exported* `packages/shared` symbol consumed cross-package, re-evaluate — but that is internal-monorepo and `needs_review` at most, never High-risk, per the AUTONOMOUS_MODE additive-downgrade rule.)

Marker scan: `categories_checked=4, matches=0`. Zero High-risk `needs_review` entries from Phase 3 in the decisions_log → halt sequence skipped, normal phase-exit ritual runs.

### Touched-surface vs file-plan reconciliation (Check 1)

**Reconciliation NEEDED and APPLIED.** The Phase-5.5 design review (finding F-WIRE) added two files to PR1's file-by-file plan that the Phase-3 Rollout touched-surface table did not yet list: `FilePane/registry/types.ts` (the `ViewProps` widening) and `FilePane.tsx` (callback forwarding). Both were confirmed to exist on the branch. A stale touched-surface would have misled Phase 7, so the Rollout `### Touched surface table` was edited to add two new rows (FileView prop plumbing + FilePane callback forwarding, both PR1, both marked "F-WIRE, added Phase 5.5"). After the edit, the Rollout touched-surface table is consistent with the Skeleton file-by-file plan. No other declared-but-undetected or detected-but-undeclared surface remains.

| detect category (substitution-mapped to TS/Electron) | Status |
| -- | -- |
| Desktop renderer — v2 viewer capture/affordance (`CodeView.tsx`, `CodeEditorAdapter.ts`, new hook + bound util) | affected — declared (PR1) |
| Desktop renderer — terminal dispatch reuse (`useSendToTerminalAgent.ts`) | affected — declared (PR1) |
| Desktop renderer — new-session wiring (`usePaneRegistry.tsx`) | affected — declared (PR1) |
| Desktop renderer — FileView prop plumbing (`ViewProps`/`registry/types.ts`) | affected — declared after reconciliation (PR1, F-WIRE) |
| Desktop renderer — FilePane callback forwarding (`FilePane.tsx`) | affected — declared after reconciliation (PR1, F-WIRE) |
| Desktop renderer — chat dispatch (`chat-adapter.ts`, new dispatcher) | affected — declared (PR2) |
| Desktop renderer — v1 viewer parity (`FileViewerPane`/`useEditorActions.ts`) | affected — declared (PR2, optional) |
| `packages/ui` popover shell | affected-but-optional — declared (PR1 if used) |
| `packages/shared` payload contract (`agent-launch-request.ts`) | not-affected — declared NOT TOUCHED |
| Electron main / IPC / filesystem | not-affected — declared NOT TOUCHED |
| Database / Drizzle schema | not-applicable |
| API / OpenAPI / tRPC contract | not-applicable (reuses existing procedures) |
| Feature flag / Statsig | not-applicable |

### Sequence coherence (Check 2)

**COHERENT.** Single ship wave (Wave 1), strict-linear 2-PR chain.

* **PR1** (`jgreer013/highlight-to-llm-terminal-v2`, chain root, on `main`) is terminal-only + v2-viewer and **independently shippable** — it delivers the whole happy path without PR2.
* **PR2** (`jgreer013/highlight-to-llm-chat-and-v1`) stacks on PR1 and reuses Contracts 1/3/4 verbatim, adding only Contract 5 (chat) + optional v1 parity.
* Strict-linear (not parallel) is correct: PR2 reuses PR1's capture/format primitives and both touch `usePaneRegistry.tsx`, so the shared-file overlap collapses to a linear chain.
* **No deploy-ordering hazard:** no backend/DB/API/independently-deploying service → no compatibility windows, no backfill, no flag, no out-of-order deploy risk. Both PRs ship in one client artifact. Rollback = per-PR git revert (ephemeral prompt text only).

### No orphaned contracts (Check 3)

**PASS — zero orphans.** Every NEW symbol in the skeleton maps to a file in a PR AND to a test sketch:

| NEW symbol | Contract | File (PR) | Test sketch |
| -- | -- | -- | -- |
| `getSelection(path)` / `CapturedEditorSelection` | Contract 1 | `CodeEditorAdapter.ts` (PR1) | `CodeEditorAdapter.test.ts` (PR1) |
| `useSendSelectionToAgent` | Contract 2 | `useSendSelectionToAgent.ts` (PR1) | `useSendSelectionToAgent.test.tsx` (PR1) |
| `boundSelectionSnippet` | Contract 3 | `boundSelectionSnippet.ts` (PR1) | bound cases in `useSendSelectionToAgent.test.tsx` (PR1) |
| `sendSelectionToChat` | Contract 5 | `sendSelectionToChat.ts` (PR2) | `chat-adapter.test.ts` (PR2) |

(`formatAgentPromptWithFileContext`, Contract 4, is CONFIRMED-existing/reused, not a new symbol; it gains a new test file `useSendToTerminalAgent.test.ts` in PR1.) The Phase-4→5 sketch note's tentative separate `getSelectionText()` was superseded by the combined `getSelection(path)` — the `CodeEditorAdapter.test.ts` sketch reference to `getSelectionText()` is flagged in the doc for Phase 7 to retarget; it is not an orphan (the symbol is folded into `getSelection`).

### Overall

**PASS.** Markers all ABSENT (no halt). Touched-surface reconciled (2 F-WIRE rows added). Sequence coherent. No orphaned contracts. Proceed to Phase 7 (build-feature).

_Verified 2026-06-23._
