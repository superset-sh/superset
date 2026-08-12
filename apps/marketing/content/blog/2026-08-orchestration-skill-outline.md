# Blog outline: the orchestrator is now an agent

Draft outline for a post on the `superset-orchestration` skill (PR #6088,
registry: superset-sh/skills). Companion to the 2026-08-02 changelog. This file
is `.md` so the blog loader ignores it; the real post ships as `.mdx`.

Suggested frontmatter:

- title: "The Orchestrator Is Now an Agent"
- description: "Our new orchestration skill lets Claude Code or Codex coordinate a fleet of Superset agents: a workspace per worker, follow-ups over real terminals, structured results back."
- category: Product
- relatedSlugs: agent-orchestration-not-another-agent, parallel-coding-agents-guide, roadmap-to-100-agents

## 1. You became the orchestrator. That's the new bottleneck.

- Callback to the February post ("You Don't Need Another AI Coding Agent — You
  Need an Orchestrator"): agents got good, the workflow around them didn't.
- Superset solved the running-in-parallel half. The remaining half: a human
  still assigns tasks, checks panes, relays context between agents.
- Thesis: the coordinator should be an agent too. Now it is.

## 2. What shipped

- The `superset-orchestration` skill. One install, any agent that reads skills
  becomes a coordinator: `npx skills add superset-sh/skills` (Claude Code can
  also use the plugin: `/plugin marketplace add superset-sh/superset`).
- Coordinator: Claude Code, Codex, others. Workers: any mix of agents Superset
  runs (Claude Code, Codex, Gemini, Grok, Kimi...).
- Asset: 5-10s recording of a coordinator prompt fanning out to 3 workers,
  sidebar filling with workspaces + agent chips.

## 3. How it works: a protocol over the CLI

- Superset is the transport, the coordinator owns the plan. No new daemon, no
  framework: the skill drives `superset` CLI commands.
- One isolated worktree workspace per worker (`agents create`), so workers
  can't step on each other.
- Follow-ups and supervision over real terminals: `terminals list/read/send/close`.
- Workers report structured DONE/BLOCKED envelopes; the coordinator tracks
  dependencies and completion, retries or reassigns.
- Asset: annotated diagram, coordinator ↔ CLI ↔ N workspaces.

## 4. Walkthrough: one prompt, three workers

- Real transcript, e.g. "split this migration across three workers and merge
  the results": show the coordinator's actual CLI calls, one worker hitting
  BLOCKED, the coordinator unblocking it over `terminals send`.
- Mixed-fleet variant: Claude Code coordinating Codex workers (that's the
  smoke test we ship).
- Asset: trimmed terminal recording or screenshot series per phase.

## 5. Patterns that work (and what to avoid)

- Fan-out/fan-in for independent tasks (tests, lint debt, codemods).
- Pipeline handoff: worker A's branch handed to worker B with terminal context.
- Remote dispatch: workers on an offline-until-woken host, coordinator polls.
- Anti-patterns: don't orchestrate serial work, don't share one workspace,
  keep the coordinator out of the workers' diffs.

## 6. Why terminals and not an agent API

- Workers behave exactly as they do when you run them by hand: same TUIs, same
  config, no special build, no vendor lock-in.
- Everything is visible in Superset: panes adopt automatically, so you can
  watch any worker and take over mid-run. The human stays one click away.

## 7. Try it

- Install commands, link to the skill in superset-sh/skills, the changelog
  entry, and docs.superset.sh.
- Prompt starters: three copy-pasteable coordinator prompts.

## 8. What's next

- Native orchestration primitives in the product (the current skill is a
  protocol convention; dependency tracking and fleet views can move into
  Superset itself).
- Invite feedback from people running big fleets.
