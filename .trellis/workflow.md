# Channel-Driven Sub-Agent Dispatch Workflow

---

## Core Principles

1. **Plan before code** — define the task, planning artifacts, and acceptance criteria before implementation.
2. **The main session coordinates** — the main session clarifies requirements, plans the task, dispatches workers, updates specs, commits, and finishes the work.
3. **Implementation and checking run in channel workers** — use `trellis channel spawn` for implement/check workers by default instead of host-native sub-agents.
4. **Pass context explicitly** — worker context order is `jsonl entries -> prd.md -> design.md -> implement.md`.
5. **Keep results auditable** — use `trellis channel messages --raw` for worker events; pretty output is an operator dashboard and may truncate progress.
6. **Persist decisions** — requirements, research, plans, and review conclusions belong in task files.

---

## Trellis System

### Developer Identity

Initialize your identity on first use:

```bash
python3 ./.trellis/scripts/init_developer.py <your-name>
```

### Spec System

`.trellis/spec/` stores project engineering guidelines. Before writing code, load the package/layer specs relevant to the task:

```bash
python3 ./.trellis/scripts/get_context.py --mode packages
```

### Task System

Each task has its own directory under `.trellis/tasks/{MM-DD-name}/` with `task.json`, `prd.md`, optional `design.md`, optional `implement.md`, optional `research/`, and `implement.jsonl` / `check.jsonl`.

Common commands:

```bash
python3 ./.trellis/scripts/task.py create "<title>" [--slug <name>] [--parent <dir>]
python3 ./.trellis/scripts/task.py start <name>
python3 ./.trellis/scripts/task.py current --source
python3 ./.trellis/scripts/task.py finish
python3 ./.trellis/scripts/task.py archive <name>
python3 ./.trellis/scripts/task.py validate <name>
```

### Channel System

Channels are the worker collaboration and event-audit layer. Use `--ephemeral` for temporary implementation/check channels. Use `--type forum` for durable discussion boards; a `thread` is an item inside a forum.

Stable worker handles:

- `implement` — implementation worker
- `check` — default check worker
- `check-cc` — Claude check worker
- `check-cx` — Codex check worker

---

<!--
  WORKFLOW-STATE BREADCRUMB CONTRACT

  [workflow-state:STATUS] blocks are the single source for per-turn prompt injection.
  Do not delete tags or change tag syntax. The body can change; parsers should not.
-->

## Phase Index

```
Phase 1: Plan    -> classify, get task-creation consent, then write planning artifacts
Phase 2: Execute -> implement/check through trellis channel workers
Phase 3: Finish  -> verify, update spec, commit, and wrap up
```

### Request Triage

- Simple conversation or small task: ask only whether this turn should create a Trellis task. If the user says no, skip Trellis for this session.
- Complex task: ask whether you may create a Trellis task and enter planning. If the user says no, do not do broad inline implementation.
- User approval to create a task is not approval to start implementation. Implementation waits until artifacts are reviewed and `task.py start` has run.

### Planning Artifacts

- `prd.md` — requirements, constraints, and acceptance criteria.
- `design.md` — technical design for complex tasks.
- `implement.md` — execution plan, validation commands, review gates, and rollback points for complex tasks.
- `implement.jsonl` / `check.jsonl` — worker context manifests. Put spec and research files here, not code files.

Lightweight tasks may be PRD-only. Complex tasks must have `prd.md`, `design.md`, and `implement.md` before `task.py start`.

### Parent / Child Task Trees

Use a parent task when one request contains several independently verifiable deliverables. Child tasks own deliverables that can be planned, implemented, checked, and archived independently. Parent/child structure is not a dependency system; dependencies must be written in the child `prd.md` / `implement.md`.

[workflow-state:no_task]
No active task. First classify the current turn and ask for task-creation consent before creating any Trellis task.
Simple conversation / small task: ask only whether this turn should create a Trellis task. If the user says no, skip Trellis for this session.
Complex task: ask the user if you can create a Trellis task and enter the planning phase. If the user says no, explain, clarify scope, or suggest a smaller split.
[/workflow-state:no_task]

### Phase 1: Plan

- 1.0 Create task `[required · once]`
- 1.1 Requirement exploration `[required · repeatable]`
- 1.2 Research `[optional · repeatable]`
- 1.3 Configure context `[conditional · once]`
- 1.4 Activate task `[required · once]`
- 1.5 Completion criteria

[workflow-state:planning]
Load `trellis-brainstorm`; stay in planning.
Lightweight: `prd.md` can be enough. Complex: finish `prd.md`, `design.md`, and `implement.md`; ask for review before `task.py start`.
Multi-deliverable scope: consider a parent task plus independently verifiable child tasks; dependencies must be written in child artifacts, not implied by tree position.
Channel-worker mode: curate `implement.jsonl` and `check.jsonl` as spec/research manifests before start.
[/workflow-state:planning]

[workflow-state:planning-inline]
Load `trellis-brainstorm`; stay in planning.
Lightweight: `prd.md` can be enough. Complex: finish `prd.md`, `design.md`, and `implement.md`; ask for review before `task.py start`.
Multi-deliverable scope: consider a parent task plus independently verifiable child tasks; dependencies must be written in child artifacts, not implied by tree position.
Inline mode: skip jsonl curation; Phase 2 reads artifacts/specs via `trellis-before-dev`.
[/workflow-state:planning-inline]

### Phase 2: Execute

- 2.1 Implement `[required · repeatable]`
- 2.2 Quality check `[required · repeatable]`
- 2.3 Rollback `[on demand]`

Channel-driven sub-agent dispatch is the default execution model for this workflow. The main session uses `trellis channel create`, `trellis channel spawn`, `trellis channel send`, and `trellis channel wait` to coordinate workers. Fall back to native host sub-agents only when the user explicitly asks for native dispatch or a host-only capability is required.

[workflow-state:in_progress]
Flow: channel-driven `implement` worker -> channel-driven `check` worker -> `trellis-update-spec` -> commit (Phase 3.4) -> `/trellis:finish-work`.
Main-session default: use `trellis channel spawn` with `.trellis/agents/implement.md` and `.trellis/agents/check.md`; do not use native Claude Task / Codex sub_agent unless explicitly requested or host-only tools require it.
Worker context order: jsonl entries -> `prd.md` -> `design.md if present` -> `implement.md if present`. Use stable worker handles such as `implement`, `check`, `check-cx`, `check-cc`; read results with `trellis channel messages --raw` when precision matters.
[/workflow-state:in_progress]

[workflow-state:in_progress-inline]
Flow: `trellis-before-dev` -> edit -> channel-driven `check` worker -> validation -> `trellis-update-spec` -> commit (Phase 3.4) -> `/trellis:finish-work`.
Inline implementation is allowed only when the user asked for it or the change is too small to justify a worker. After editing, prefer `trellis channel spawn --agent check` for independent review.
Read context before editing: `prd.md` -> `design.md if present` -> `implement.md if present`, plus relevant spec/research loaded by skills.
[/workflow-state:in_progress-inline]

### Phase 3: Finish

- 3.1 Quality verification `[required · repeatable]`
- 3.2 Debug retrospective `[on demand]`
- 3.3 Spec update `[required · once]`
- 3.4 Commit changes `[required · once]`
- 3.5 Wrap-up reminder

[workflow-state:completed]
Code committed. Run `/trellis:finish-work`; if dirty, return to Phase 3.4 first.
[/workflow-state:completed]

---

## Rules

1. Identify the current Phase, then continue from the next step in that Phase.
2. Run steps in order inside each Phase; `[required]` steps cannot be skipped.
3. Phase 2 uses channel workers by default. Do not implement large changes directly in the main session unless the user asked for inline work or the task is small enough.
4. Worker briefs must state the active task, goal, editable scope, validation commands, and forbidden actions.
5. `trellis channel messages --raw` is the precise audit path; pretty output is only for quick status checks.
6. After a worker completes, the main session integrates the result and runs check workers when needed. Final judgment stays with the main session.

### Active Task Routing

[Claude Code, Cursor, OpenCode, codex-sub-agent, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi]

- Planning or unclear requirements -> `trellis-brainstorm`.
- `in_progress` implementation -> `trellis channel spawn --agent implement`.
- `in_progress` quality check -> `trellis channel spawn --agent check`.
- Repeated debugging -> `trellis-break-loop`; spec updates -> `trellis-update-spec`.

[/Claude Code, Cursor, OpenCode, codex-sub-agent, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi]

[codex-inline, Kilo, Antigravity, Windsurf]

- Planning or unclear requirements -> `trellis-brainstorm`.
- Before editing -> `trellis-before-dev`; after editing -> prefer a channel-driven `check` worker.
- Repeated debugging -> `trellis-break-loop`; spec updates -> `trellis-update-spec`.

[/codex-inline, Kilo, Antigravity, Windsurf]

---

## Phase 1: Plan

Goal: clarify requirements, get task-creation consent, and produce planning artifacts that must be reviewed before implementation.

#### 1.0 Create task `[required · once]`

Create the task directory only after task-creation consent:

```bash
python3 ./.trellis/scripts/task.py create "<task title>" --slug <name>
```

Run only `create` here. Do not also run `start`. `start` switches status to `in_progress`, which moves the breadcrumb into execution.

#### 1.1 Requirement exploration `[required · repeatable]`

Load `trellis-brainstorm` and write user requirements into `prd.md`. Complex tasks also need `design.md` and `implement.md`.

Requirements:

- Ask one question at a time.
- Prefer researching over asking for information that can be discovered.
- Update task artifacts immediately when requirements change.
- Split broad work into parent task + child tasks.
- Keep `prd.md` focused on requirements and acceptance criteria, not implementation checklists.

#### 1.2 Research `[optional · repeatable]`

When research is needed, write results to `{TASK_DIR}/research/`. Research files must be usable by later workers.

For desktop-facing requirements, research must also identify whether the behavior crosses Electron startup, preload IPC, auth persistence, host-service, terminal/runtime, or V2 route boundaries. If it does, planning must include a real desktop acceptance strategy from `.trellis/spec/guides/desktop-acceptance-tdd.md`.

#### 1.3 Configure context `[conditional · once]`

Curate worker context manifests:

- `implement.jsonl` — specs and research needed by the implementation worker.
- `check.jsonl` — quality specs, test specs, and research needed by the check worker.

Do not put code files in jsonl. Workers read code during execution.

#### 1.4 Activate task `[required · once]`

After artifact review, start the task:

```bash
python3 ./.trellis/scripts/task.py start <task-dir>
```

#### 1.5 Completion criteria

| Condition | Required |
| --- | :---: |
| `prd.md` exists | yes |
| user confirms task should enter implementation | yes |
| `task.py start` has run | yes |
| `design.md` exists for complex tasks | yes |
| `implement.md` exists for complex tasks | yes |
| desktop-facing task names Desktop Automation CLI acceptance or explains why lower-level tests are enough | yes |
| `implement.jsonl` / `check.jsonl` curated when needed | recommended |

---

## Phase 2: Execute

Goal: the main session turns reviewed planning artifacts into checked code through channel workers.

#### 2.1 Implement `[required · repeatable]`

[Claude Code, Cursor, OpenCode, codex-sub-agent, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi]

Use channel-driven implement dispatch:

```bash
TASK=.trellis/tasks/<active-task>
trellis channel create impl-<topic> --task "$TASK" --by main --ephemeral
trellis channel spawn impl-<topic> \
  --agent implement \
  --as implement \
  --jsonl "$TASK/implement.jsonl" \
  --file "$TASK/prd.md" \
  --file "$TASK/design.md" \
  --file "$TASK/implement.md" \
  --cwd "$PWD" \
  --timeout 60m
trellis channel send impl-<topic> --as main --to implement --text-file /tmp/implement-brief.md
trellis channel wait impl-<topic> --as main --kind done --from implement --timeout 60m
trellis channel messages impl-<topic> --raw --from implement --last 20
```

Omit the `design.md` or `implement.md` `--file` when the file does not exist. The brief must state the worker goal, forbidden actions, validation commands, and expected completion summary.

Native sub-agent fallback is allowed only when the user explicitly asks for it or a host-only capability is required.

[/Claude Code, Cursor, OpenCode, codex-sub-agent, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi]

[codex-inline, Kilo, Antigravity, Windsurf]

1. Load `trellis-before-dev`.
2. Read `prd.md`, then `design.md` if present, then `implement.md` if present.
3. Read relevant research.
4. Small changes may be implemented inline; larger changes should still use a channel worker.
5. After implementation, enter channel-driven check.

[/codex-inline, Kilo, Antigravity, Windsurf]

#### 2.2 Quality check `[required · repeatable]`

[Claude Code, Cursor, OpenCode, codex-sub-agent, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi]

Use channel-driven check dispatch:

```bash
TASK=.trellis/tasks/<active-task>
trellis channel create cr-<topic> --task "$TASK" --by main --ephemeral
trellis channel spawn cr-<topic> \
  --agent check \
  --as check \
  --jsonl "$TASK/check.jsonl" \
  --file "$TASK/prd.md" \
  --file "$TASK/design.md" \
  --file "$TASK/implement.md" \
  --cwd "$PWD" \
  --timeout 30m
trellis channel send cr-<topic> --as main --to check --text-file /tmp/check-brief.md
trellis channel wait cr-<topic> --as main --kind done --from check --timeout 30m
trellis channel messages cr-<topic> --raw --from check --last 40
```

For independent cross-provider review, spawn `check-cc` and `check-cx` in the same channel:

```bash
trellis channel spawn cr-<topic> --agent check --provider claude --as check-cc --cwd "$PWD" --timeout 30m
trellis channel spawn cr-<topic> --agent check --provider codex --as check-cx --cwd "$PWD" --timeout 30m
trellis channel send cr-<topic> --as main --to check-cc --text-file /tmp/check-brief.md
trellis channel send cr-<topic> --as main --to check-cx --text-file /tmp/check-brief.md
trellis channel wait cr-<topic> --as main --kind done --from check-cc,check-cx --all --timeout 30m
```

Check workers should directly fix clear issues. The main session reads raw events and makes the final judgment.

[/Claude Code, Cursor, OpenCode, codex-sub-agent, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi]

[codex-inline, Kilo, Antigravity, Windsurf]

Load `trellis-check` or use a channel-driven check worker. If issues are found, fix and re-check until green.

[/codex-inline, Kilo, Antigravity, Windsurf]

#### 2.3 Rollback `[on demand]`

- If check finds a PRD defect -> return to Phase 1, fix artifacts, then execute again.
- If an implement worker goes off-track -> narrow the brief, redispatch, or revert that work.
- If more research is needed -> write to `{TASK_DIR}/research/`, then redispatch.

---

## Phase 3: Finish

Goal: verify quality, capture lessons, and commit the work.

#### 3.1 Quality verification `[required · repeatable]`

Load `trellis-check` or dispatch a channel-driven check worker for final verification:

- spec compliance
- lint / type-check / tests
- cross-layer consistency
- task artifact alignment
- desktop-facing acceptance: Desktop Automation CLI real app checks, screenshots/reports, and non-brittle assertions per `.trellis/spec/guides/desktop-acceptance-tdd.md`, or an explicit documented skip rationale

#### 3.2 Debug retrospective `[on demand]`

If the same class of issue recurred, load `trellis-break-loop` and record root cause plus prevention.

#### 3.3 Spec update `[required · once]`

Load `trellis-update-spec` and decide whether new patterns, pitfalls, or technical decisions should be written back to `.trellis/spec/`.

#### 3.4 Commit changes `[required · once]`

The main session commits work changes. Before committing, separate AI-edited files from unknown dirty files.

```bash
git status --porcelain
git log --oneline -5
```

Do not amend. Do not push.

#### 3.5 Wrap-up reminder

After committing, remind the user to run `/trellis:finish-work` to archive the task and record the session.

---

## Customizing Trellis

This workflow is customized through `.trellis/workflow.md`. Scripts parse tags and headings; they do not store fallback prose.

### Change a step

Edit the corresponding Phase 1 / 2 / 3 step body.

### Change per-turn prompt text

Edit the body of the matching `[workflow-state:STATUS]` block. Do not change tag names or syntax.

### Add a custom status

Add:

```text
[workflow-state:my-status]
...
[/workflow-state:my-status]
```

A lifecycle hook or script must write `task.json.status` to that value, otherwise the block is never read.
