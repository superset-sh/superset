# Agent Settings as Catalog + Local Overrides

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` should be updated as implementation proceeds.

Reference branch: `kitenite/please-add-a-new-settings-sect`


## Purpose / Big Picture

Add a first-class desktop Agent settings section that lets users control:

1. which terminal agents appear in launcher dropdowns
2. the command used when launching an agent without a task prompt
3. the command used when launching an agent with a task prompt
4. the task prompt template used by task-driven launch surfaces

The correct implementation should be:

1. device-local, because agent binaries, flags, and safety posture are machine-specific
2. centrally defined, so every launch surface compiles launch requests the same way
3. extensible, so adding a new built-in agent or a new launch surface does not require touching persistence, migrations, UI, and command builders in multiple places
4. side-effect free on read, so loading settings never mutates the database


## Current State

The current branch already introduces the core user-facing feature:

1. a new settings route and UI under [AgentSettings.tsx](/Users/kietho/.superset/worktrees/superset/kitenite/kitenite/please-add-a-new-settings-sect/apps/desktop/src/renderer/routes/_authenticated/settings/agent/components/AgentSettings/AgentSettings.tsx)
2. local SQLite storage for agent presets in [schema.ts](/Users/kietho/.superset/worktrees/superset/kitenite/kitenite/please-add-a-new-settings-sect/packages/local-db/src/schema/schema.ts)
3. Zod typing for agent presets in [zod.ts](/Users/kietho/.superset/worktrees/superset/kitenite/kitenite/please-add-a-new-settings-sect/packages/local-db/src/schema/zod.ts)
4. Electron tRPC procedures in [settings/index.ts](/Users/kietho/.superset/worktrees/superset/kitenite/kitenite/please-add-a-new-settings-sect/apps/desktop/src/lib/trpc/routers/settings/index.ts)
5. shared launch builders and persisted launch preferences used by:
   - [PromptGroup.tsx](/Users/kietho/.superset/worktrees/superset/kitenite/kitenite/please-add-a-new-settings-sect/apps/desktop/src/renderer/components/NewWorkspaceModal/components/PromptGroup/PromptGroup.tsx)
   - [OpenInWorkspace.tsx](/Users/kietho/.superset/worktrees/superset/kitenite/kitenite/please-add-a-new-settings-sect/apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/$taskId/components/PropertiesSidebar/components/OpenInWorkspace/OpenInWorkspace.tsx)
   - [RunInWorkspacePopover.tsx](/Users/kietho/.superset/worktrees/superset/kitenite/kitenite/please-add-a-new-settings-sect/apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TasksTopBar/components/RunInWorkspacePopover/RunInWorkspacePopover.tsx)

The recent refactor improved blast radius meaningfully by introducing:

1. [agent-launch-request.ts](/Users/kietho/.superset/worktrees/superset/kitenite/kitenite/please-add-a-new-settings-sect/apps/desktop/src/shared/utils/agent-launch-request.ts)
2. [useAgentLaunchPreferences.ts](/Users/kietho/.superset/worktrees/superset/kitenite/kitenite/please-add-a-new-settings-sect/apps/desktop/src/renderer/hooks/useAgentLaunchPreferences/useAgentLaunchPreferences.ts)

That is a good incremental step, but it is still not the design I would consider final.


## Problems With the Current Branch Design

### 1. The persisted model stores full preset snapshots instead of overrides

Today the branch persists a fully materialized `AgentPreset[]` plus an `agentPresetsInitialized` flag in local SQLite. That creates unnecessary coupling between:

1. static built-in defaults
2. persisted device-local changes
3. initialization semantics

This makes future changes awkward:

1. changing a built-in default does not naturally flow to users who have no override for that field
2. adding a new field requires touching initialization, normalization, and reset logic everywhere
3. resetting to default means copying a full object back into storage instead of deleting the override

### 2. Reads have hidden write behavior

`getAgentPresets` currently initializes defaults on first read in [settings/index.ts](/Users/kietho/.superset/worktrees/superset/kitenite/kitenite/please-add-a-new-settings-sect/apps/desktop/src/lib/trpc/routers/settings/index.ts).

That is a bad long-term contract because:

1. queries should not mutate storage
2. debugging becomes harder when simply opening settings changes local state
3. tests need to account for initialization side effects rather than pure reads

### 3. The settings UI saves field-by-field on blur

The current UI in [AgentSettings.tsx](/Users/kietho/.superset/worktrees/superset/kitenite/kitenite/please-add-a-new-settings-sect/apps/desktop/src/renderer/routes/_authenticated/settings/agent/components/AgentSettings/AgentSettings.tsx) issues a mutation per field blur.

That is serviceable, but it is not the best editor model for multi-field command configuration. These fields are interdependent:

1. `command`
2. `promptCommand`
3. `promptCommandSuffix`
4. `taskPromptTemplate`
5. `enabled`

Saving them one field at a time produces unnecessary mutation volume and awkward rollback logic.

### 4. `superset-chat` is still implicitly tied to Claude defaults

The current launch builder uses Claude’s template as the fallback for `superset-chat`. That works mechanically, but it is the wrong ownership boundary:

1. `superset-chat` should own its own default task prompt contract
2. changing Claude defaults should not implicitly change chat behavior

### 5. Agent definition and agent override concerns are still mixed

Today the system conceptually mixes:

1. the built-in agent catalog
2. the mutable per-device override state
3. the resolved runtime preset
4. the launch-request compiler

Those should be separate layers.


## Goals

1. Make agent defaults declarative and centralized.
2. Persist only device-local overrides, not duplicated defaults.
3. Eliminate database writes during read paths.
4. Make reset behavior remove overrides instead of re-copying defaults.
5. Make all renderer launch surfaces depend on one launch-request builder layer.
6. Make adding a new built-in agent a mostly catalog-only change.
7. Make settings editing atomic at the card level.
8. Keep implementation local to desktop and local SQLite. No cloud sync in this PR.


## Non-Goals

1. User-defined arbitrary custom agents.
2. Cross-device syncing of agent settings.
3. Server-side launch orchestration changes.
4. Replacing `superset-chat` itself.
5. Designing a plugin system for external launchers.


## Design Principles

### Principle 1: Device-local agent behavior stays local

Agent launch commands frequently encode:

1. local binary names
2. machine-specific flags
3. user-specific safety posture
4. local filesystem conventions

These should remain in desktop local storage, not shared cloud state.

### Principle 2: Persist deltas, not materialized defaults

The system should store only what the user changed. Defaults belong in code.

### Principle 3: Reads are pure

`getAgentPresets()` should never write. The absence of overrides should be a valid state.

### Principle 4: UI surfaces do not compile shell strings directly

Every renderer surface should consume a central launch builder and hand it:

1. selected agent
2. source
3. task or prompt input
4. runtime preferences

### Principle 5: Save units should reflect user intent

Agent settings edits should be saved per agent card, not one field blur at a time.


## Proposed Architecture

The correct design is a four-layer model.

### Layer 1: Static Agent Catalog

Create a built-in catalog in shared code, for example:

`packages/shared/src/agent-catalog.ts`

Each catalog entry should describe immutable built-in behavior:

1. `id`
2. `defaultLabel`
3. `defaultDescription`
4. `defaultCommand`
5. `defaultPromptCommand`
6. `defaultPromptCommandSuffix`
7. `defaultTaskPromptTemplate`
8. `defaultEnabled`
9. `launchMode`
10. `supportsTaskPrompt`
11. `supportsNoPromptLaunch`

The key idea is that built-in defaults live here and nowhere else.

### Layer 2: Persisted Local Overrides

Persist only mutable local overrides in local SQLite.

Preferred schema:

1. replace `agentPresets` with `agentPresetOverrides`
2. remove `agentPresetsInitialized`
3. store a JSON wrapper object with versioning

Recommended shape:

```ts
type AgentPresetOverride = {
  id: AgentPresetId;
  enabled?: boolean;
  label?: string;
  description?: string | null;
  command?: string;
  promptCommand?: string;
  promptCommandSuffix?: string | null;
  taskPromptTemplate?: string;
};

type AgentPresetOverrideEnvelope = {
  version: 1;
  presets: AgentPresetOverride[];
};
```

Why a wrapper object instead of a raw array:

1. it gives us schema-version room without another column
2. it supports future metadata cleanly
3. it avoids another `initialized` flag

Why overrides instead of a normalized SQL table:

1. the data is device-local
2. cardinality is tiny
3. queries are always “load all presets”
4. there is no relational reporting need

### Layer 3: Resolved Runtime Presets

Create a normalization layer in desktop code, for example:

`apps/desktop/src/shared/agent-settings/resolve-agent-presets.ts`

This layer merges:

1. static catalog entry
2. local override for that agent

into a `ResolvedAgentPreset`.

Recommended runtime shape:

```ts
type ResolvedAgentPreset = {
  id: AgentPresetId;
  label: string;
  description?: string;
  command: string;
  promptCommand: string;
  promptCommandSuffix?: string;
  taskPromptTemplate: string;
  enabled: boolean;
  overriddenFields: AgentPresetField[];
};
```

The UI and launch builders should consume only resolved presets.

### Layer 4: Launch Builders and Launch Preferences

Keep the launch-request compiler in one place, similar to:

1. [agent-launch-request.ts](/Users/kietho/.superset/worktrees/superset/kitenite/kitenite/please-add-a-new-settings-sect/apps/desktop/src/shared/utils/agent-launch-request.ts)
2. [useAgentLaunchPreferences.ts](/Users/kietho/.superset/worktrees/superset/kitenite/kitenite/please-add-a-new-settings-sect/apps/desktop/src/renderer/hooks/useAgentLaunchPreferences/useAgentLaunchPreferences.ts)

This layer should own:

1. prompt launch request construction
2. task launch request construction
3. file-based prompt injection
4. heredoc-based prompt injection
5. localStorage-backed launch preferences

Renderer surfaces should only map local domain objects into the shared builder input.


## Detailed Data Model

### Preferred Local DB Columns

If this PR is not yet merged, I would change the current migration before merge and land:

1. `settings.agent_preset_overrides` as JSON text
2. no `agent_presets_initialized` column

If keeping the existing `agent_presets` column name is cheaper before merge, I would still change the semantics:

1. `agent_presets` stores override envelope, not full resolved presets
2. `agent_presets_initialized` is removed

### Zod Types

Update [zod.ts](/Users/kietho/.superset/worktrees/superset/kitenite/kitenite/please-add-a-new-settings-sect/packages/local-db/src/schema/zod.ts) to include:

1. `agentPresetOverrideSchema`
2. `agentPresetOverrideEnvelopeSchema`
3. `ResolvedAgentPreset` stays in desktop/shared code, not DB schema code

### Migration Strategy

Because this branch is still pre-merge, the cleanest path is:

1. replace the branch migration with a single migration that adds only the override column
2. regenerate migration artifacts before merge
3. do not ship a migration that introduces `agentPresetsInitialized` if we do not want that long-term


## Settings Router Design

The desktop tRPC router in [settings/index.ts](/Users/kietho/.superset/worktrees/superset/kitenite/kitenite/please-add-a-new-settings-sect/apps/desktop/src/lib/trpc/routers/settings/index.ts) should expose resolved presets, while internally storing overrides.

### Recommended Procedures

1. `getAgentPresets(): ResolvedAgentPreset[]`
2. `updateAgentPreset({ id, patch })`
3. `resetAgentPreset({ id })`
4. `resetAllAgentPresets()`

Optional:

1. `validateAgentPromptTemplate({ template })`
2. `previewAgentPromptTemplate({ id, sampleTask })`

### Read Semantics

`getAgentPresets` should:

1. read overrides from SQLite
2. merge them with the static catalog
3. return resolved presets
4. never write

### Write Semantics

`updateAgentPreset` should:

1. read the current overrides envelope
2. apply a patch to the override for that agent
3. drop fields whose value equals the default
4. drop the full override record if it becomes empty
5. write back the envelope

This keeps storage minimal and reset behavior natural.

### Reset Semantics

`resetAgentPreset({ id })` should:

1. remove that agent’s override entry
2. not copy any defaults into storage


## Task Prompt Template Design

The template system should remain intentionally small.

### Supported Variables

Keep a central exported variable list:

1. `id`
2. `slug`
3. `title`
4. `description`
5. `priority`
6. `statusName`
7. `labels`

### Recommended Utilities

Create or expand a single prompt-template module that owns:

1. `renderTaskPromptTemplate`
2. `validateTaskPromptTemplate`
3. `getSupportedTaskPromptVariables`
4. `buildDefaultTerminalTaskPrompt`
5. `buildDefaultChatTaskPrompt`

### Important Design Choice

`superset-chat` should not inherit Claude’s template implicitly.

Instead:

1. define `DEFAULT_TERMINAL_TASK_PROMPT_TEMPLATE`
2. define `DEFAULT_CHAT_TASK_PROMPT_TEMPLATE`
3. if they are initially identical, that should still be explicit


## Settings UI Design

The current UI location is correct:

1. [settings/layout.tsx](/Users/kietho/.superset/worktrees/superset/kitenite/kitenite/please-add-a-new-settings-sect/apps/desktop/src/renderer/routes/_authenticated/settings/layout.tsx)
2. [AgentSettings.tsx](/Users/kietho/.superset/worktrees/superset/kitenite/kitenite/please-add-a-new-settings-sect/apps/desktop/src/renderer/routes/_authenticated/settings/agent/components/AgentSettings/AgentSettings.tsx)

The editor model should change.

### Recommended Editor Model

Each agent card should maintain a local draft and expose:

1. `Save`
2. `Reset to defaults`
3. dirty state
4. field-level validation

Do not save on blur.

Why:

1. commands and prompt template changes are often edited together
2. atomic card-level save is easier to reason about
3. rollback logic becomes much simpler
4. network and disk churn are lower

### Recommended Card Sections

Each card should have:

1. `Enabled`
2. `Label`
3. `Description`
4. `Command (No Prompt)`
5. `Command (With Prompt)`
6. `Prompt Command Suffix`
7. `Task Prompt Template`
8. `Preview`

### Preview Panel

Each agent card should show:

1. a sample rendered task prompt
2. a sample compiled command for:
   - no-prompt launch
   - task-driven launch

That will dramatically reduce misconfiguration risk.

### Override Visibility

The UI should indicate which fields differ from default. For example:

1. badge: `Modified`
2. field-level reset buttons
3. copy like `Using default` vs `Overridden`


## Launch Surface Integration

Every launch surface should only do three things:

1. collect input
2. call the shared preference hook
3. call the shared launch builder

### Surface 1: New Workspace Prompt

Keep the current path in [PromptGroup.tsx](/Users/kietho/.superset/worktrees/superset/kitenite/kitenite/please-add-a-new-settings-sect/apps/desktop/src/renderer/components/NewWorkspaceModal/components/PromptGroup/PromptGroup.tsx), but the component should never know how commands are compiled.

### Surface 2: Single Task Launch

Keep the current path in [OpenInWorkspace.tsx](/Users/kietho/.superset/worktrees/superset/kitenite/kitenite/please-add-a-new-settings-sect/apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/$taskId/components/PropertiesSidebar/components/OpenInWorkspace/OpenInWorkspace.tsx), but only map `TaskWithStatus` into a shared task input shape.

### Surface 3: Batch Task Launch

Keep the current path in [RunInWorkspacePopover.tsx](/Users/kietho/.superset/worktrees/superset/kitenite/kitenite/please-add-a-new-settings-sect/apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TasksTopBar/components/RunInWorkspacePopover/RunInWorkspacePopover.tsx), but reuse the same builder used by single-task launch.

### Preferred Shared Hook

Retain and formalize the shared localStorage hook:

1. `lastSelectedAgent`
2. `lastOpenedInProjectId`
3. `agentAutoRun`
4. `lastSelectedWorkspaceCreateAgent`

Those keys should be centralized constants, not string literals scattered across components.


## Validation Rules

Validation should happen at two levels.

### Router-Level Validation

The router should enforce:

1. valid agent id
2. non-empty required overridden strings after trim
3. maximum field lengths
4. maximum template length
5. valid override schema shape

### UI-Level Validation

The UI should provide immediate feedback for:

1. empty required fields
2. template tokens not in the supported variable list
3. commands that appear malformed
4. likely accidental whitespace-only changes

The UI should warn on unknown tokens, but I would not block save unless the token grammar itself is invalid.


## Testing Strategy

### Unit Tests

Add unit tests for:

1. catalog-to-resolved preset normalization
2. override patch application
3. override cleanup when values match defaults
4. prompt template rendering
5. prompt template validation
6. prompt launch request building
7. task launch request building
8. localStorage preference hook

Relevant existing test anchors:

1. [agent-command.test.ts](/Users/kietho/.superset/worktrees/superset/kitenite/kitenite/please-add-a-new-settings-sect/packages/shared/src/agent-command.test.ts)
2. [agent-launch-request.test.ts](/Users/kietho/.superset/worktrees/superset/kitenite/kitenite/please-add-a-new-settings-sect/apps/desktop/src/shared/utils/agent-launch-request.test.ts)

### Router Tests

Add tests for:

1. `getAgentPresets` with no overrides
2. `getAgentPresets` with partial overrides
3. `updateAgentPreset` dropping fields equal to defaults
4. `resetAgentPreset` removing the override entry
5. no write occurring during reads

### Component Tests

Add tests for:

1. card dirty state
2. save button enablement
3. reset removing overrides
4. preview rendering
5. enabled-toggle behavior
6. search visibility behavior for agent settings items

### Integration Tests

Smoke-test all three launch surfaces to verify:

1. disabled agents disappear from dropdowns
2. renamed agents show the custom label
3. task prompt template changes affect:
   - single task launch
   - batch task launch
4. prompt command changes affect:
   - new workspace prompt launch


## Rollout and Safety

This feature should ship as ordinary desktop settings behavior with no cloud dependency.

Safety checks:

1. keep settings local only
2. do not auto-run mutated commands without the existing user action path
3. maintain conservative defaults for built-in agents
4. avoid background writes during settings page load


## Implementation Plan

### Milestone 0: Fix the data model before merge

Checklist:

1. remove `agentPresetsInitialized`
2. switch stored payload to override envelope
3. regenerate the branch migration before merge
4. add normalization helpers

Acceptance:

1. reading agent settings from an empty DB row returns defaults with no write

### Milestone 1: Introduce static catalog + resolved presets

Checklist:

1. add shared built-in agent catalog
2. add override schema
3. add resolved preset model
4. add `getResolvedAgentPresets()`

Acceptance:

1. adding a new built-in agent requires catalog changes only, plus UI icon wiring if needed

### Milestone 2: Rework router semantics

Checklist:

1. `getAgentPresets` returns resolved presets
2. `updateAgentPreset` patches overrides only
3. add `resetAgentPreset`
4. add validation helpers

Acceptance:

1. reset removes override data instead of re-copying defaults

### Milestone 3: Rework settings UI to card-level save

Checklist:

1. add local draft state per card
2. add save/reset actions
3. add preview
4. surface overridden field state

Acceptance:

1. editing multiple fields for one agent can be saved atomically

### Milestone 4: Keep launch surfaces thin

Checklist:

1. keep centralized launch builder
2. keep centralized preference hook
3. eliminate direct command compilation in UI
4. eliminate scattered localStorage mutations in UI

Acceptance:

1. launch behavior differences between surfaces exist only where product behavior actually differs

### Milestone 5: Verify thoroughly

Checklist:

1. unit tests
2. router tests
3. component tests
4. integration smoke tests
5. targeted manual checks

Acceptance:

1. feature behavior is consistent across settings, prompt launch, single-task launch, and batch launch


## Decision Log

### DL-1 Local-only persistence

Decision: keep agent settings in desktop local SQLite, not cloud.

Reason:

1. commands are machine-specific
2. binaries may differ by device
3. safety posture is not suitable for silent cross-device sync

### DL-2 Catalog plus overrides

Decision: code owns built-in defaults, storage owns only overrides.

Reason:

1. it minimizes migration churn
2. it makes reset semantics correct
3. it scales better as fields are added

### DL-3 No read-time initialization

Decision: queries must not mutate settings rows.

Reason:

1. purity
2. testability
3. fewer surprising side effects

### DL-4 Card-level save

Decision: save per agent card, not per field blur.

Reason:

1. these fields are edited together
2. rollback becomes simpler
3. mutation spam is reduced

### DL-5 Explicit chat defaults

Decision: `superset-chat` gets its own default prompt template ownership.

Reason:

1. avoids hidden coupling to Claude
2. makes chat behavior independently evolvable


## Progress

- [x] (2026-03-15 07:55Z) Review current branch implementation and recent refactor state
- [x] (2026-03-15 08:10Z) Identify remaining architectural weaknesses in persistence and UI save semantics
- [x] (2026-03-15 08:20Z) Draft full ExecPlan for a correct, extensible implementation


## Surprises & Discoveries

1. The branch already moved launch-request construction and localStorage preferences into shared helpers, which is the right direction.
2. The biggest remaining architectural issue is not launch duplication anymore; it is the persistence model storing fully materialized defaults and mutating on read.
3. The settings UI is functional, but its save-on-blur model makes the implementation noisier and less atomic than it needs to be.


## Outcomes & Retrospective

To be filled in during implementation.
