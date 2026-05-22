---
source: ticket
improvement_id: SUPER-869
ticket_id: SUPER-869
ticket_url: https://linear.app/superset-sh/issue/SUPER-869/add-factory-droid-as-a-terminal-agent-preset
tracker: linear
status: binding
chosen_option: moderate
loc_budget: 50
task_chunks: 1
investigator_specialist: code-reviewer
challenger_specialist: security-reviewer
---

# SUPER-869: Add Factory Droid as a terminal agent preset

## Improvement goal

Factory Droid is partially integrated (desktop wrapper + hooks + agent-identity recognition) but missing from the two static preset registries that feed the terminal preset picker UI. Adding it makes Droid discoverable as a first-class preset alongside Claude, Codex, Gemini, Amp, and Copilot.

## Evidence

The gap is confirmed by direct file inspection:

1. **Droid exists in agent-identity.ts:16** — `agentId: BuiltinAgentId | "droid"` shows Droid is recognized as a valid agent process identity but is handled as an out-of-band exception rather than a built-in.
2. **Droid exists in agent-wrappers-droid.ts** — full wrapper implementation at `apps/desktop/src/main/lib/agent-setup/agent-wrappers-droid.ts` (209 lines) manages `~/.factory/settings.json` hooks.
3. **Droid is ABSENT from HOST_AGENT_PRESETS** — `packages/shared/src/host-agent-presets.ts:33-132` lists 9 presets. No "droid" entry.
4. **Droid is ABSENT from BUILTIN_TERMINAL_AGENTS** — `packages/shared/src/builtin-terminal-agents.ts:59-134` lists the same 9 agents. No "droid" entry.
5. **Droid has NO preset icon** — `packages/ui/src/assets/icons/preset-icons/` contains SVGs for all 9 presets. No droid.svg or droid-white.svg.

## Root cause

Droid was integrated bottom-up (desktop wrapper first) but the two static preset registries that power the UI picker were never updated. The `agent-identity.ts` type union explicitly punts with `| "droid"` instead of deriving it from the built-in set.

## Binding scope (chosen: moderate)

### Acceptance criteria

- `HOST_AGENT_PRESETS` array contains a `droid` entry with `command: "droid"`, `args: ["--auto", "medium"]`, `promptTransport: "argv"`, `promptArgs: []`
- `BUILTIN_TERMINAL_AGENTS` array contains a `droid` entry with `command: "droid --auto medium"`, `promptCommand: "droid --auto medium"`
- `agent-identity.ts` no longer has the `| "droid"` union escape hatch — `BuiltinAgentId` derives from the array
- `PRESET_ICONS` map in `index.ts` contains a `droid` entry with light and dark icon variants
- SVGs render correctly at 16x16 and 32x32
- TypeScript compiles without errors
- Existing tests pass

### Files in scope

- `packages/shared/src/host-agent-presets.ts` — add droid entry
- `packages/shared/src/builtin-terminal-agents.ts` — add droid entry
- `packages/shared/src/agent-identity.ts:16` — simplify type union
- `packages/ui/src/assets/icons/preset-icons/droid.svg` — new icon
- `packages/ui/src/assets/icons/preset-icons/droid-white.svg` — dark theme variant
- `packages/ui/src/assets/icons/preset-icons/index.ts` — register in PRESET_ICONS

### Out of scope

- Changes to agent-wrappers-droid.ts (already works)
- Changes to desktop agent-setup flow
- Adding droid to DEFAULT_PRESET_IDS / includeInDefaultTerminalPresets
- Factory CLI installation or authentication flow

### Risks

- Medium: SVG icon needs to be sourced or created (Factory branding asset). Placeholder geometric design as fallback.

## Considered alternatives

- **minimum** — Add droid to registries + type cleanup only (no icon). Rejected: user chose moderate for visual parity with other presets.
- **strategic** — Moderate + seed as default preset for new users. Rejected: challenger flagged this as a product decision requiring separate sign-off, not an engineering call to bundle.

## Challenger notes

**Evidence re-verified.** All 5 citations confirmed against source. Minimum resolves the problem causally — no smaller option possible. No scope creep in moderate beyond the icon assets (branding polish). Strategic's `includeInDefaultTerminalPresets` is a product decision, not engineering. No security surface in this change — `--auto medium` is correct, not `--skip-permissions-unsafe`.

## Scope amendments

(None)

## Deferred follow-ups

See `.spec/improvements/SUPER-869/follow-ups.md`
