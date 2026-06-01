# Trellis Workflow Productization Research

## Source Scope

Reference clone: `/tmp/trellis-v060-beta`

Branch: `feat/v0.6.0-beta`

Commit inspected: `30beb8e3ed379b7ef9270e14d4b406fc330044d2`

Key files inspected:

- `README.md`
- `README_CN.md`
- `.trellis/workflow.md`
- `drafts/v0.5.0-forum-post.md`
- `drafts/v0.5.0-beta-forum-post.md`
- `.codex/config.toml`
- `.codex/hooks.json`
- `.agents/skills/*/SKILL.md` in the installed Superset Trellis setup

## Trellis Model

Trellis is a development harness for AI coding tools.

It provides:

- `.trellis/spec/`: scoped team/project coding guidelines.
- `.trellis/tasks/`: task PRDs, design notes, implementation plans, research, context manifests, and task state.
- `.trellis/workspace/`: developer journals, decisions, and session continuity.
- `.trellis/workflow.md`: source-of-truth lifecycle for planning, execution, checking, finishing, and knowledge capture.
- platform adapters: hooks, skills, commands, prompts, and agents for tools such as Claude Code, Cursor, Codex, OpenCode, Qoder, Kiro, and others.

Recent Trellis versions are skill-first:

- Most behavior is triggered through skills.
- Hooks inject session context and workflow-state breadcrumbs.
- `workflow.md` is the single source of truth for phase routing and per-turn workflow-state hints.
- Tasks move through planning, execution, checking, spec update, commit, and finish.

## What Should Be Productized

Trellis has several ideas that belong in Superset Work:

- explicit task PRD/brief before execution
- scoped context instead of giant prompts
- workflow phases with visible next actions
- artifacts that survive conversation compaction
- quality gates and evidence
- implementation/check separation
- retrospectives and reusable knowledge capture
- session journals and handoff notes

These are not inherently development-only. They can become generic Work concepts if abstracted properly.

## What Should Not Be Hard-coded

Trellis should not become the universal Work workflow.

Reasons:

- Trellis is optimized for software delivery.
- Superset Work may be used by non-developers: customer support, operations, sales, content, research, design, data analysis, and internal admin teams.
- Non-development workflows may not need PRD/design/implement/check/spec-update/commit.
- Forcing every task into Trellis phases would make Work feel like an AI IDE rather than a general internet factory.

## Recommended Product Abstraction

Use a generic workflow template model:

- `workflowTemplate`
  - domain: software, support, sales, operations, content, research, custom
  - name and description
  - default participant roles
  - phases
  - prompts
  - quality gates
  - artifact types
  - escalation/review policy
- `workflowPhase`
  - title
  - purpose
  - required inputs
  - expected outputs
  - completion criteria
- `workflowStep`
  - assignee role
  - action prompt
  - tool/command requirements
  - evidence requirement
  - verification rule
- `workflowRun`
  - task id
  - template id/version
  - phase/step state
  - events, artifacts, checks, and approvals

Then ship Trellis as the first built-in software-delivery template:

- Brainstorm/PRD
- Design
- Implementation plan
- Code execution
- Quality check
- Debug retrospective when needed
- Knowledge capture
- Commit/wrap-up

## Non-development Template Examples

Customer support:

- understand issue
- collect account/context
- reproduce or verify
- propose answer/fix
- user approval
- resolution summary

Sales:

- qualify lead
- research account
- draft outreach
- human review
- send/follow-up
- capture result

Content:

- brief
- outline
- draft
- review
- publish
- performance note

Operations:

- intake
- triage
- execute checklist
- verify outcome
- document incident/decision

## Superset Implications

- Work should have a generic process engine.
- Trellis-inspired UI copy should live inside the software-delivery template, not the Work shell.
- Task data should store the selected workflow template/run, but the canonical task remains the same.
- Code can be the execution surface for software-delivery tasks. Other templates may use different tools or no terminal at all.
- Model/provider/agent settings should be reusable across workflow templates.

## Recommendation

Do not port Trellis as-is into Work.

Build Work around generic task-bound collaboration plus workflow templates. Use Trellis as the first software-delivery template because it gives Superset a strong developer workflow, but keep the template system open enough for non-developer internet-factory workflows.
