# Slack agent implementation status

Source: the workspace's `plans/20260908-slack-agent-plan.html` (v13). The
published page at https://app.superset.sh/page/slack-agent-plan-98cwoq could not
be retrieved from this environment, so parity with the published version is
unverified.

## Implemented foundation

- Mentions and DMs share the same handler, linked-user identity lookup, Pro
  gate, image ingestion, execution guard, output and error handling.
- Thread context walks Slack's chronological cursor pages, retains the latest
  20 messages, and excludes the triggering message and later messages by
  timestamp. It no longer assumes the final returned message is the trigger.
- QStash publishes use Slack's event ID for deduplication. A failed publish
  returns 503 so Slack can retry; a retry header alone is not grounds to drop
  a delivery whose first publish may have failed. Edited, deleted and bot DMs
  cannot launch the agent.
- The existing `ingest.webhook_events` unique constraint reserves tool
  execution by team/channel/message timestamp. Duplicate QStash deliveries
  cannot execute that message again. Reservation IDs are namespaced so they
  do not collide with automation ingestion. No migration is required for this
  foundation.
- Sonnet 5 is the default and a picker option. Existing explicit model
  preferences remain honored. Supported Sonnet/Opus choices use adaptive
  thinking; Haiku does not. The static system prompt has a cache breakpoint.
- The loop handles refusal, output truncation, iteration limits and missing
  answers without presenting unfinished text as success. It preserves
  completed action records after a subsequent model failure. MCP errors are
  passed back as errors; failed writes do not become successful action records.
- Full assistant content, including signed thinking and server tool blocks,
  survives continuation. Obsolete v1 action parsing and progress entries are
  removed.
- Slack tools require explicit opt-in at both discovery and execution. Deletes,
  terminal writes, task updates, automation mutations and unknown tools remain
  unavailable until the approval flow exists.
- Each image is limited to 5 MiB; total binary input is limited to 20 MiB and
  20 images. Metadata, response headers and streamed byte counts enforce the
  limits before unbounded buffering. Downloads have a timeout.
- Both jobs have a 300-second duration budget, reject invalid JSON cleanly,
  and handle channels that cannot receive replies. The agent checks a
  240-second loop budget and bounds model requests.
- Slack status replaces the Thinking placeholder. Final replies are new
  messages with Markdown blocks; long replies split at Slack's 12,000-character
  limit. The existing Changes message still lists successful actions.

## Validation

- Focused Slack unit tests cover routing and retry behavior, signature checks,
  malformed job payloads, thread pagination, model requests, tool policy,
  failed tools, stop conditions, shared-handler identity/deduplication, image
  boundaries and long output.
- API TypeScript check, Biome checks for changed Slack code, and
  `bun run check:i18n` pass. Catalog regeneration produces no diff.
- No live Slack messages, model requests, database writes or deployment were
  used for validation. The execution guard's database operation is typechecked;
  it still needs integration verification on an isolated development database.

## Remaining work and blockers

This is not the complete four-phase implementation. Persistent thread/channel
sessions, follow-up queues, plugin credential bridging, channel participation
and back-off, memory and settings, approval buttons, the durable outbox,
workspace watches/completion callbacks, assistant lifecycle events, restart,
streaming/checklists and the additional plugins remain unimplemented.

The database workflow requires a new Neon branch before schema/migration work.
`neonctl branches list` using the workspace configuration exited with status 1
without a diagnostic; an isolated branch could not be established. No schema
or migration files were changed. Once access is available, follow
`.agents/skills/db-migrations/SKILL.md` to create the isolated branch and build
the persistent-session/outbox tables.

The plan also gates channel cloud work on sandbox lifecycle, credentials and
version-handshake work. Those dependencies have not been changed or verified
here. The plan's six open product decisions remain unresolved.

### Delivery recovery limitation

Execution is conservative after a reservation: a crashed worker or an ambiguous
Slack send does not cause tools to replay. A successful send marks the record
processed; a failed delivery marks it failed; a hard crash can leave it pending.
These records need inspection before recovery. Tool results and reply bodies
are not persisted, so this is not an exactly-once outbox and it cannot recover
an unsent reply automatically. Gate/connect prompts before execution reservation
are also not covered by the execution guard. The persistent outbox phase must
address recovery without rerunning side effects.

## Review fixes (2026-09-15)

Applied after review of the foundation above; 46 Slack tests pass, tsc and biome clean.

- Channels get progress again. `assistant.threads.setStatus` is DM-only
  (`method_not_supported_for_channel_type` elsewhere), so channel threads
  post a placeholder that carries progress and is deleted once the final
  reply exists. DMs keep the assistant status.
- The execution claim now happens before image preflight and mention
  resolution, and preflight shares the 240-second run budget (image
  downloads are capped at the remaining time). A claim that finds a
  `pending` row older than six minutes flips it to `failed`, posts a
  "lost track" notice, clears the placeholder or status and removes the
  reaction; a plain duplicate still exits silently.
- Model calls: 120-second per-call timeout and one retry for 429/5xx while
  the budget can absorb it, instead of 45 seconds and none.
- Stop reasons, deadline and empty answers use static copy via
  `SlackAgentError`; only raw API errors still go through the Haiku rewrite.
- `web_search_20260209` on Sonnet/Opus, the basic variant only on Haiku 4.5.
  Progress map lists `agents_create`; the prompt no longer advertises task
  updates.
