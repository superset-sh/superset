---
source: ticket
improvement_id: SUPER-869
ticket_id: SUPER-869
ticket_url: https://linear.app/superset-sh/issue/SUPER-869/add-factory-droid-as-a-terminal-agent-preset
tracker: linear
status: proposal
investigator_specialist: code-reviewer
challenger_specialist: security-reviewer
---

# SUPER-869: Add Factory Droid as a terminal agent preset

## Improvement goal

Factory Droid is partially integrated (desktop wrapper + hooks + agent-identity recognition) but missing from the two static preset registries that feed the terminal preset picker UI. Adding it makes Droid discoverable as a first-class preset alongside Claude, Codex, Gemini, Amp, and Copilot.

## Evidence

The gap is confirmed by direct file inspection:

1. **Droid exists in agent-identity.ts:16** — `agentId: BuiltinAgentId | "droid"` shows Droid is recognized as a valid agent process identity but is handled as an out-of-band exception rather than a built-in.
2. **Droid exists in agent-wrappers-droid.ts** — full wrapper implementation at `apps/desktop/src/main/lib/agent-setup/agent-wrappers-droid.ts` (209 lines) manages `~/.factory/settings.json` hooks with SessionStart, SessionEnd, UserPromptSubmit, Notification, Stop, and PostToolUse events.
3. **Droid is ABSENT from HOST_AGENT_PRESETS** — `packages/shared/src/host-agent-presets.ts:33-132` lists 9 presets (claude, amp, codex, gemini, mastracode, opencode, pi, copilot, cursor-agent). No "droid" entry.
4. **Droid is ABSENT from BUILTIN_TERMINAL_AGENTS** — `packages/shared/src/builtin-terminal-agents.ts:59-134` lists the same 9 agents. No "droid" entry.
5. **Droid has NO preset icon** — `packages/ui/src/assets/icons/preset-icons/` contains SVGs for all 9 presets. No droid.svg or droid-white.svg.

## Root cause

Droid was integrated bottom-up (desktop wrapper first) but the two static preset registries that power the UI picker were never updated. The `agent-identity.ts` type union explicitly punts with `| "droid"` instead of deriving it from the built-in set.

## Option 1: minimum — Add droid preset entries to both registries + type cleanup

One-line: Add droid to HOST_AGENT_PRESETS and BUILTIN_TERMINAL_AGENTS with `--auto medium`, simplify agent-identity type union.

Files in scope:
- `packages/shared/src/host-agent-presets.ts` — add droid entry after cursor-agent (line ~131)
- `packages/shared/src/builtin-terminal-agents.ts` — add droid entry after cursor-agent (line ~133)
- `packages/shared/src/agent-identity.ts:16` — simplify `BuiltinAgentId | "droid"` to just `BuiltinAgentId`

LOC budget: ~30 lines added, 1 line changed

Acceptance criteria:
- `HOST_AGENT_PRESETS` array contains a `droid` entry with `command: "droid"`, `args: ["--auto", "medium"]`, `promptTransport: "argv"`, `promptArgs: []`
- `BUILTIN_TERMINAL_AGENTS` array contains a `droid` entry with matching command
- `agent-identity.ts` no longer has the `| "droid"` union escape hatch
- TypeScript compiles without errors
- Existing tests pass (preset resolution, agent catalog, agent identity)

Out of scope:
- Droid icon SVG (preset will render with a generic fallback icon)
- Changes to agent-wrappers-droid.ts (already works)
- Changes to desktop agent-setup flow

Risks:
- Low: Without a custom icon, droid shows a generic placeholder in the preset picker. Cosmetic only.

## Option 2: moderate — minimum + droid icon

One-line: Add droid preset entries, type cleanup, and add a branded SVG icon to the preset-icons directory.

Files in scope:
- Same as minimum
- `packages/ui/src/assets/icons/preset-icons/droid.svg` — new branded icon
- `packages/ui/src/assets/icons/preset-icons/droid-white.svg` — dark theme variant
- `packages/ui/src/assets/icons/preset-icons/index.ts` — register both in PRESET_ICONS map

LOC budget: ~50 lines added/changed, plus 2 SVG assets

Acceptance criteria:
- All minimum ACs
- `PRESET_ICONS` map in `index.ts` contains a `droid` entry with light and dark icon variants
- SVGs render correctly at 16x16 and 32x32

Out of scope:
- Changes to agent-wrappers-droid.ts
- Changes to desktop agent-setup flow

Risks:
- Medium: SVG icon needs to be sourced or created (Factory branding asset). May need design review.
- Low: If Factory doesn't provide a suitable icon, a placeholder geometric design would be needed.

## Option 3: strategic — moderate + includeInDefaultTerminalPresets

One-line: Add droid as a full preset with icon AND seed it into the default preset list shown to new users.

Files in scope:
- Same as moderate
- `packages/shared/src/host-agent-presets.ts` — add `"droid"` to `DEFAULT_PRESET_IDS` set
- `packages/shared/src/builtin-terminal-agents.ts` — set `includeInDefaultTerminalPresets: true` on droid entry

LOC budget: ~55 lines added/changed, plus 2 SVG assets

Acceptance criteria:
- All moderate ACs
- Droid appears in `getDefaultSeedPresets()` output
- Droid entry has `includeInDefaultTerminalPresets: true`
- New users see Droid in their initial preset list alongside Claude, Codex, Gemini, Amp, Copilot

Out of scope:
- Changes to agent-wrappers-droid.ts
- Changes to desktop agent-setup flow
- Factory CLI installation or authentication flow

Risks:
- Medium: Same SVG icon risk as moderate.
- Medium: Droid is a newer/commercial product. Seeding it as a default preset means all new users see it. May want product sign-off before making it default.
- Low: Users who don't have droid installed will see it in the picker but get a "command not found" error. This is the same behavior as any other uninstalled preset.

## Considered alternatives

(To be populated after human decision)

## Challenger notes

(To be populated by challenger)

## Scope amendments

(Empty — populated later if needed)

## Deferred follow-ups

See `.spec/improvements/SUPER-869/follow-ups.md`
