# Skills in Chat

Upstream `@mastra/core` (1.26.0-alpha+) ships native `search_skills` and `load_skill` tools. The agent decides autonomously when to discover and load a skill based on the user's message and the `SKILL.md` files found in the configured skill paths.

## Where upstream looks for skills

`mastracode`'s `skillPaths` covers both project-local and user-global dirs:

- `.mastracode/skills/`
- `.claude/skills/`
- `.agents/skills/`

Drop a `SKILL.md` (or a dir containing one) in any of those paths and the agent will discover it on next turn.

## UI rendering

When the agent invokes `load_skill` (or the legacy `skill`) tool, the chat renders a dedicated `SkillToolCall` row (ZapIcon, "Loading skill" description). See `apps/desktop/.../ToolCallBlock/components/SkillToolCall/` — it fires automatically once the workspace is on mastracode ≥ 0.15.

## What this repo intentionally does *not* do

An earlier version of this integration extracted custom `/command` chips from the user's message and forwarded them as `preloadSkills` metadata to `sendMessage`. That mechanism depended on a mastra fork (`superset-sh/mastra#9`) that never landed — upstream chose agent-autonomous skill discovery instead. The preload wiring has been removed; `/command` chips serialize to plain `/command` text on send and the agent handles them via its normal tool-choice path.
