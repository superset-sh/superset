# Zano Work and A2A Research

## Source Scope

Reference clone: `/tmp/zano-source`

Commit inspected: `10dc35ff075cd4dafceef5cd261a1c2feddd455b`

Key files inspected:

- `README.md`
- `AGENTS.md`
- `apps/omni/src/system-prompt.ts`
- `apps/omni/src/a2a-protocol.ts`
- `apps/omni/src/omni.ts`
- `packages/db/src/schema.sql`
- `packages/db/src/collaboration.sql`
- `packages/db/src/activity.sql`

## Product Model

Zano's core product model is not just a task board. It is a shared collaboration space where humans and AI agents work together in channels, DMs, threads, and task threads.

Important primitives:

- `agents`: persistent agent identities with status, ownership, lineage, and workspace memory.
- `channels`: public/private/DM spaces.
- `channel_members`: humans and agents as first-class participants.
- `messages`: chat plus thread support.
- `tasks`: work items that can be created from messages and linked to assignees/reviewers.
- `task_comments`, `task_artifacts`, `task_events`, `task_specs`, `task_plans`, `task_steps`, `task_verifications`, `task_agent_runs`, `task_reviews`: a rich task collaboration and execution history.
- `member_activity_events`: unified activity feed across messages, threads, tasks, agents, memberships, and more.

For Superset, this means Zano is strongest as a reference for the future `Work` surface, not as a reason to create a second Task system.

## A2A Protocol Findings

`apps/omni/src/a2a-protocol.ts` is especially relevant.

It defines:

- conversation spaces: DM, thread, task thread, project channel, general channel
- message intents: request, question, handoff, blocker, decision needed, review needed, verification needed, correction, assignment, escalation, status, result, decision, ack, thanks, chatter
- activation reasons: direct mention, DM recipient, thread participant, task owner, handoff target, blocker owner, review owner, verification owner, domain fit, channel broadcast, and others
- activation strength: strong, medium, weak
- agent decision modes: reply and work, work silently, reply only, observe, skip
- topic keys and cooldown keys for loop control
- activation envelopes that tell an agent why it was activated and what visible behavior is expected

This is a strong pattern for Superset Work:

- A2A routing should be service-level infrastructure, not React component state.
- Agents should not wake up just because a message exists. Wakeup needs intent, participant context, task ownership, and loop controls.
- Agents should be allowed to work silently and only report useful evidence, blockers, decisions, handoffs, or results.
- Task-bound threads should have stronger activation semantics than general channels.

## Mapping to Superset

| Zano | Superset target |
| --- | --- |
| Channel / DM / thread | Work room, task thread, project channel |
| Task | Canonical Superset Task |
| Task comments/events/artifacts | Task Activity Foundation |
| Task specs/plans/steps/verifications | Generic Work workflow template engine |
| Task agent runs/reviews | Code and Work agent execution history |
| Omni local runtime | Superset host-service / terminal / agent CLI layer |
| Zano CLI used by agents | Superset agent tool bridge / future Work CLI |
| A2A activation protocol | Work agent routing and loop control |

## Code and Work Task Boundary

Do not create separate Code tasks and Work tasks.

Recommended model:

- `Task` is the durable work item.
- `Code` is an execution cockpit for a task.
- `Work` is a collaboration and workflow cockpit for a task.
- Code writes workspace/session/terminal/diff/review artifacts back to Task activity.
- Work writes messages/events/decisions/evidence/review approvals back to Task activity.

This keeps the product center stable: one task, multiple operating surfaces.

## Risks

- Zano uses Supabase, RLS, and a separate Omni runtime. Superset should not port those mechanics directly into the current Electron/Drizzle/Electric architecture.
- Full A2A can become noisy without cooldowns, hop limits, and decision modes.
- Agent identity and human identity must be modeled carefully before agent assignees/reviewers become first-class.
- Task activity should be append-only where possible so Code and Work can share evidence without overwriting each other.

## Recommendation

Use Zano for Work inspiration, especially:

1. task-bound collaboration rooms and threads
2. human and agent participants
3. message-to-task and message-to-event transitions
4. task activity timeline
5. A2A intent classification and loop control
6. agent run/review/evidence records

Keep the current task effort focused on Task Core first. Add Work as a child task after the canonical Task model is strong.
