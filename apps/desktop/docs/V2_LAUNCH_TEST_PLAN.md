# V2 Launch Dispatch — Test Plan

Checklist for verifying the V2 workspace launch pipeline end-to-end.
Pair with `V2_LAUNCH_CONTEXT.md` for architectural background and
`v2-launch-test-artifacts/` for copy-pasteable sample data.

## Setup

1. `bun dev` at the repo root.
2. Ensure your active org has V2 cloud enabled (or you're testing a V2
   project).
3. Settings → Agents: confirm **Claude** is enabled. For chat-agent
   tests, enable **Superset Chat**.
4. (Optional) Open devtools console and filter by `[v2-launch]` to trace
   dispatch. `collections` is exposed globally for pending-row inspection:
   ```js
   collections.pendingWorkspaces.toArray()
   ```

## A. Happy-path — terminal agent (Claude)

- [ ] **A1. Prompt only** — "add a README explaining this repo." Claude pane
      opens. The command includes the prompt. No errors.
- [ ] **A2. Prompt + text attachment** — drag `v2-launch-test-artifacts/trace.log`
      into the modal. After launch: verify `.superset/attachments/trace.log`
      exists in the worktree (terminal: `ls .superset/attachments/`).
      Claude prompt contains `![trace.log](.superset/attachments/trace.log)`.
- [ ] **A3. Prompt + image** — drag `v2-launch-test-artifacts/sample.png`.
      Same as A2 with the image.
- [ ] **A4. Duplicate filename** — drag `trace.log` twice. Both files exist;
      second is named `trace_1.log`. Prompt references both.
- [ ] **A5. Prompt + linked GitHub issue** — paste a real issue URL from the
      picker. Claude prompt contains `# <issue title>`.
- [ ] **A6. Prompt + linked PR** — paste a PR URL. Prompt contains
      `# <PR title>` and `Branch: \`<branch>\``.
- [ ] **A7. Prompt + internal task** — link a task from the picker.
      Prompt contains `# Task <id> — <title>`.
- [ ] **A8. Multi-source** — prompt + task + 2 issues + PR + 2 attachments.
      All appear in the prompt, ordered:
      user-prompt → tasks → issues → prs → attachment list.
- [ ] **A9. Rich-editor multimodal** — if the editor supports inline image
      drops, drop an image between two text chunks. Image ref sits inline,
      not appended at the end.

## B. Happy-path — chat agent (Superset Chat)

Disable Claude (or set Superset Chat as preferred via order in settings).

- [ ] **B1. Prompt only** — chat pane opens; first user message = prompt;
      agent response streams.
- [ ] **B2. Prompt + attachment** — first message carries the file
      (visible in the message bubble).
- [ ] **B3. Prompt + linked issue** — first message contains the issue
      title block.
- [ ] **B4. Retry on send failure** — block network before submit, wait
      for V2 chat retry loop, unblock. Message eventually sends.
      `pending.chatLaunch` only clears after success.

## C. Pending-row lifecycle

- [ ] **C1. Field clears after consume** — devtools console after launch:
      ```js
      collections.pendingWorkspaces.toArray()
        .find(r => r.workspaceId === '<WS-ID>')
      ```
      `terminalLaunch` / `chatLaunch` are `null`.
- [ ] **C2. No re-fire on revisit** — navigate out and back to the
      workspace. No duplicate pane.
- [ ] **C3. Crash-safe** — submit, quit app before workspace opens.
      Reopen app, navigate to `/v2-workspace/<ID>`. Pane still opens.
      Pending row cleared after.
- [ ] **C4. Concurrent creates** — submit two workspaces in rapid
      succession (different projects). Both pending rows dispatch
      independently; no cross-contamination.

## D. Failure paths

- [ ] **D1. create fails** — kill host-service, submit. Pending page shows
      "failed" with retry. No launch stashed. Retry after restart works.
- [ ] **D2. Attachment write fails** — manually `chmod` the worktree
      read-only, submit with attachments. Dispatch logs warning; pane
      still opens; files missing (expected degradation).
- [ ] **D3. `ensureSession` fails** — stop host-service after create but
      before navigation. Consume hook logs warning. `terminalLaunch`
      stays set. Restart host-service, refresh. Consume re-fires.
- [ ] **D4. Agent disabled mid-flow** — enable agent, start submit, disable
      before create completes. Pending page finishes. No pane opens.
      Pending row `terminalLaunch` stays null.
- [ ] **D5. No enabled agents** — disable all agents in settings. Submit.
      Workspace creates. No pane opens. Expected.

## E. Source-mapping edge cases

- [ ] **E1. Empty prompt, attachments only** — submit with only a file,
      no text. Terminal opens with the no-prompt command
      (`claude --dangerously-skip-permissions`).
- [ ] **E2. Whitespace-only prompt** — `"   \n  "`. Treated as empty.
- [ ] **E3. Multiple linked issues** — 2+ github issues. Both render in
      order.
- [ ] **E4. Task + issue together** — `taskSlug` = task's slug (task
      wins). Both bodies render.
- [ ] **E5. Duplicate issue URL** — link same issue twice. Deduped.
- [ ] **E6. PR only** — no prompt, no issues, just a linked PR. Launch
      succeeds; prompt = PR block.

## F. Custom / non-default agents

- [ ] **F1. Codex (terminal)** — disable Claude, enable Codex. Submit.
      Codex pane runs prompt.
- [ ] **F2. Custom terminal agent** — create one in settings with command
      `echo` (simple test). Submit. Pane runs `echo <prompt>`.
- [ ] **F3. Custom `contextPromptTemplateUser`** — settings → Claude →
      override user template to `"PREFIX {{userPrompt}} SUFFIX"`. Submit.
      Command contains `PREFIX <prompt> SUFFIX`.

## G. Cross-pane behavior

- [ ] **G1. Setup script + agent** — project has a setup script, submit.
      Setup script pane **and** agent pane both appear as separate panes.
      (This was the V1-bus bug that triggered the rewrite — if agent
      appears but setup script merges into same pane, regression.)
- [ ] **G2. Presets + agent** — configure a default preset that
      auto-applies. Submit. Preset terminals + agent terminal all
      coexist.
- [ ] **G3. Chat + terminal presets** — chat agent + preset terminals.
      Both appear.

## H. V1 regression

- [ ] **H1. V1 workspace creation still works** — create via the V1
      modal (old workspace view, not V2 dashboard). V1 dispatch via
      `WorkspaceInitEffects` + `useTabsStore` unchanged. Agent runs
      as before.

## Priority

If time-limited, run these first:

- A1, A2 — minimum happy path terminal
- A8 — multi-source terminal
- B1 — minimum happy path chat
- C1 — field clears
- G1 — setup-script regression
- H1 — V1 regression
