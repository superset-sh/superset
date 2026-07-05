# Agent preset import — learnings (v2-only)

Branch: `agent-presets-import`. Captures what worked, what didn't, and the
landmines so the next attempt is faster. **Scope: v2 only — v1 stays
untouched.**

## Goal (one line)

Let users import their enabled agents (from `/settings/agents`) as terminal
presets, and have edits to the agent's command in `/settings/agents`
propagate to the preset everywhere it's used.

## Final architecture (lean, "live link with snapshot fallback")

One optional field on the v2 preset:

```ts
agentId?: string;
```

If set, the preset is live-linked to that agent definition. The launcher
and the editor dialog look the agent up in `getAgentPresets` and use its
current `command`. The stored `commands` array is kept as a snapshot
fallback for when the agent is missing or disabled.

**Crucially**: do **not** add a `kind: "commands" | "agent"` discriminator,
do **not** extract a `@superset/shared/agent-preset-resolution` package, do
**not** ship a separate resolver test file. `agentId?` is sufficient — the
inline lookup is two lines.

## Why this shape

Tried first: snapshot-only on pill click (just copy the command into the
preset, no link). User correctly pushed back: editing the agent in
`/settings/agents` should update existing presets. Live link wins on
correctness.

Tried second: discriminated union with `kind`, dedicated resolver package,
banner with deep-link to a specific agent. User correctly pushed back:
over-engineered. The `kind` discriminator is redundant once `agentId?`
exists; a deep-link to the agent settings page requires the agents page to
support a search param, which it doesn't (yet).

## Files to touch

### v2 schema

- `apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema.ts`
  — `v2TerminalPresetSchema` gets `agentId: z.string().optional()`. That's
  it.

### v2 default seeding (open design choice)

`v2TerminalPresets` is a `localStorageCollectionOptions` collection (per-org
key `v2-terminal-presets-{organizationId}`). It populates from the v1→v2
migration shim. Since v1 isn't being changed, v1 defaults stay at the 5
default-tagged agents with no `agentId`. v2 needs to end up with all 10
builtins linked.

Pick one:

1. **Augment the migration shim** —
   `apps/desktop/src/renderer/routes/_authenticated/hooks/useMigrateV1PresetsToV2/useMigrateV1PresetsToV2.ts`
   copies v1 verbatim, then for any builtin terminal agent (`AGENT_TYPES`)
   not already present by name, append a v2-only row with `agentId`,
   `name=AGENT_LABELS[id]`, `description=AGENT_PRESET_DESCRIPTIONS[id]`,
   `commands=[AGENT_PRESET_COMMANDS[id][0]]`. Single one-time write per org
   (the migration marker already gates it).
2. **Separate v2 seeder** — a small hook that runs alongside (or after) the
   migration and inserts missing builtin agent-linked rows. Same idea, just
   factored out.

Either way, do **not** modify v1's `DEFAULT_PRESETS` or v1's
`createTerminalPreset` schema.

### Settings search / visibility

- `apps/desktop/src/renderer/routes/_authenticated/settings/utils/settings-search/settings-search.ts`
  — `TERMINAL_QUICK_ADD` is currently variant-tagged `"v1"`, which makes
  `getVisibleItemsForSection` strip it in v2 mode (the dropdown never
  renders). Change to `"shared"` (or `"v2"`).

### UI — settings page (v2 surface)

- `apps/desktop/src/renderer/routes/_authenticated/settings/terminal/components/TerminalSettings/TerminalSettings.tsx`
  — page width `max-w-4xl` → `max-w-6xl`.
- `.../components/PresetsSection/components/PresetsTable/PresetsTable.tsx`
  — drop `max-h-[420px]` so the list expands to natural height.
- `.../components/PresetRow/PresetRow.tsx` — add an icon column. Resolve
  via `getPresetIcon(preset.name, isDark)` first, fall back to
  `getPresetIcon(preset.agentId, isDark)`, then `<HiMiniCommandLine>`.
  (PresetRow is shared; in v1 mode `preset.agentId` is undefined so it
  cleanly falls through to the name lookup.)
- `.../components/V2PresetsSection/V2PresetsSection.tsx`:
  - Pull agents via `electronTrpc.settings.getAgentPresets.useQuery()`
    (this hook works in `/settings/*` because it is **not** inside
    `WorkspaceTrpcProvider`).
  - Build `quickAddAgents` from agents where `kind === "terminal"` and
    `enabled` and `command.trim()` is non-empty.
  - Dedupe quick-add by `agentId` (not by name) so deleting a preset frees
    the pill again.
  - Pass the dropdown into the section header next to "Add preset".
  - Pass `agents` prop to `PresetEditorDialog`.
- `.../components/PresetsSection/components/QuickAddPresets/QuickAddPresets.tsx`
  — render as a `DropdownMenu` triggered by a single button labeled
  "Import agent". Each menu item shows icon + label + description, and is
  disabled with a check mark when already added.
- `.../components/PresetsSection/components/PresetEditorDialog/PresetEditorDialog.tsx`
  — when `preset.agentId` is set:
  - Replace the editable `name`/`description`/`commands` rows with a
    banner ("Linked to {agent.label}. Edit the command in Agents settings
    → Open" linking to `/settings/agents`) plus a read-only commands view
    showing the live command.
  - Keep `cwd`, `projectIds`, `executionMode`, autoApply rows editable.
  - Fall back to `preset.name` / `preset.commands` when the live agent is
    missing or disabled.

  This component is shared with v1, but v1 callers don't pass `agents` and
  no v1 row has `agentId`, so the new branch is dormant in v1.

### v2 launcher (the tRPC trap lives here)

- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useV2PresetExecution/useV2PresetExecution.ts`
  - Build an `agentCommandsById: Map<string, string>` from `agents` (only
    `kind === "terminal" && enabled` with non-empty `command`).
  - At launch, resolve commands as `preset.agentId ? [agentCommandsById.get(id) ?? preset.commands[0]] : preset.commands`.
  - Then call `state.addTab(...)` / `state.addPane(...)` with
    `makeTerminalPane(terminalId, presetName, command)` — `initialCommand`
    rides on pane data. **Single subscriber:** `TerminalPane` is the only
    place that calls `terminal.createSession`. Do NOT pre-create from
    `executePreset`. Do NOT fire-and-forget. Do NOT introduce a parallel
    mutation. Same path as `useWorkspacePaneOpeners.addTerminalTab`, just
    with a command attached.

## The tRPC routing trap (read this first)

`useV2PresetExecution` runs **inside `WorkspaceTrpcProvider`**, which routes
tRPC calls to the workspace HTTP server. The settings router lives on the
main-process electron client. So this:

```ts
// BROKEN inside WorkspaceTrpcProvider — silent 404
electronTrpc.settings.getAgentPresets.useQuery();
```

resolves to `[]` forever and the live link silently fails. Use the vanilla
client via `@tanstack/react-query`:

```ts
import { useQuery } from "@tanstack/react-query";
import { electronTrpcClient } from "renderer/lib/trpc-client";

const { data: agents = [] } = useQuery({
  queryKey: ["v2-preset-execution", "agent-presets"],
  queryFn: () => electronTrpcClient.settings.getAgentPresets.query(),
  staleTime: 30_000,
});
```

This is the same pattern `useMigrateV1PresetsToV2` uses, with a comment
documenting the same trap. The settings page (`/settings/*`) is outside
`WorkspaceTrpcProvider`, so the React-hook form works there fine.

## Single-subscriber rule for terminal launches

Server (`packages/host-service/src/terminal/terminal.ts`) IS idempotent by
`terminalId` (lines 599-603) and `queueInitialCommand` is single-fire (line
474). So calling `createSession` twice with the same `terminalId` doesn't
double-execute. **But:** doing so is still confusing, hard to reason about,
and creates parallel work. Don't.

What I tried that the user rejected:

1. Pre-create the session from `executePreset` (await + addTab) — adds an
   async hop and a second subscriber.
2. Fire-and-forget `createSession` from `executePreset` alongside
   `TerminalPane`'s mount-time call — two subscribers race, even when the
   server dedupes.

What works: put `initialCommand` on pane data, let `TerminalPane`'s
`useRef(paneData.initialCommand)` + `useEffect`-driven `createSession`
handle it. Same code path as a regular tab open.

## Things that look like bugs but aren't

- "Cannot run preset / Linked agent is disabled or missing" toast firing
  while the agent is enabled — caused by the tRPC routing trap above. Fix
  the routing, the toast goes quiet. If you want a toast at all, trigger
  it only when `commands.length === 0` (no live agent + empty snapshot).
  Don't claim "agent is disabled" — you usually just haven't loaded the
  agents query yet.
- v2 default presets without `agentId` — comes from v1's default seed
  flowing through the migration shim. Handled by the v2 seeder; not a v1
  bug.

## Order of operations for the rewrite

1. v2 schema: add `agentId?` to `v2TerminalPresetSchema`.
2. Settings search: flip `TERMINAL_QUICK_ADD` variant from `"v1"` to
   `"shared"`.
3. v2 default seeding: pick one of the two options above and implement.
4. `QuickAddPresets`: dropdown that takes `QuickAddAgentPill[]` with
   `agentId`, `label`, `description`, `commands`.
5. `V2PresetsSection`: agents query (electron React hook is fine here),
   `quickAddAgents`, dedupe by `agentId`, place dropdown next to "Add
   preset", pass `agents` to dialog.
6. `PresetEditorDialog`: `agents?` prop, live lookup when `preset.agentId`
   is set, banner + read-only commands branch.
7. `PresetRow`: icon column.
8. `PresetsTable`: drop max-h.
9. `TerminalSettings`: `max-w-6xl`.
10. `useV2PresetExecution`: vanilla `electronTrpcClient` via `useQuery`,
    `agentCommandsById` map, resolve at launch, pass `initialCommand` on
    pane data, **single subscriber**.

## Out of scope / explicitly deferred

- Anything in v1 — schema, router, defaults, launcher, settings UI all
  stay as-is.
- Deep-linking the "Open" button to a specific agent on `/settings/agents`
  (route doesn't accept an agent search param yet).
- A "broken link" badge on the preset row when the live agent is missing
  (the dialog banner covers it).
- Healing existing user rows that already have empty `commands` from an
  earlier broken iteration — clearing localStorage works.
