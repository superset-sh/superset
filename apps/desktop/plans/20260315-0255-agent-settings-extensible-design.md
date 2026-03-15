# Agent Settings End-State Design

This ExecPlan describes the desired final implementation for desktop agent settings.


## Purpose

Desktop should expose a single Agent settings section that controls:

1. which agents appear in launcher dropdowns
2. the command used for no-prompt launches
3. the command used for prompt/task launches
4. the task prompt template used by task-driven launch surfaces

The design must be:

1. device-local
2. centrally defined
3. extensible
4. pure on read


## Goals

1. Built-in agent defaults live in code, not in persisted rows.
2. Local storage persists only user overrides.
3. All launch surfaces use one launch-request builder layer.
4. Settings editing is atomic per agent card.
5. Reset removes overrides instead of rewriting defaults.
6. Adding a new built-in agent is mostly a catalog change.


## Non-Goals

1. Syncing agent settings across devices
2. User-defined arbitrary custom agents
3. Server-side launch orchestration changes
4. Plugin architecture for external launchers


## Architecture

The system should have four layers.

### 1. Static Agent Catalog

Create a shared built-in catalog, e.g. `packages/shared/src/agent-catalog.ts`.

Each entry should define:

1. `id`
2. `defaultLabel`
3. `defaultDescription`
4. `defaultCommand`
5. `defaultPromptCommand`
6. `defaultPromptCommandSuffix`
7. `defaultTaskPromptTemplate`
8. `defaultEnabled`
9. `supportsTaskPrompt`
10. `supportsNoPromptLaunch`

This catalog is the only source of defaults.

### 2. Persisted Local Overrides

Persist only mutable local overrides in local SQLite.

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

Persist the envelope as JSON text in `settings`.

Do not persist:

1. fully resolved presets
2. copied default values
3. an initialization flag

### 3. Resolved Runtime Presets

Desktop should resolve catalog entries and overrides into a runtime shape:

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

The UI and launch builders should consume only `ResolvedAgentPreset`.

### 4. Launch Builders and Preferences

Keep launch compilation centralized in desktop shared utilities.

Responsibilities:

1. build prompt launch requests
2. build task launch requests
3. compile file-based prompt injection
4. compile heredoc-based prompt injection
5. manage local launch preferences from one hook

Renderer surfaces should only:

1. collect inputs
2. read resolved presets
3. call the shared builder


## Storage Design

Keep this feature local to desktop SQLite.

Recommended `settings` column:

1. `agent_preset_overrides` or equivalent JSON text column

Do not use:

1. `agentPresetsInitialized`
2. read-time initialization writes

Why:

1. commands are machine-specific
2. reads should be pure
3. reset semantics are cleaner
4. schema evolution is simpler


## Router Design

The Electron settings router should expose resolved presets while internally storing overrides.

Recommended procedures:

1. `getAgentPresets(): ResolvedAgentPreset[]`
2. `updateAgentPreset({ id, patch })`
3. `resetAgentPreset({ id })`
4. `resetAllAgentPresets()`

Optional:

1. `validateAgentPromptTemplate({ template })`
2. `previewAgentPromptTemplate({ id, sampleTask })`

### Read Semantics

`getAgentPresets` should:

1. read overrides
2. merge them with the static catalog
3. return resolved presets
4. never write

### Write Semantics

`updateAgentPreset` should:

1. apply the patch to that agent’s override entry
2. drop fields whose value equals the default
3. remove the override entirely if it becomes empty
4. persist the updated override envelope

### Reset Semantics

`resetAgentPreset({ id })` should remove the override entry for that agent.


## Prompt Template Design

Keep the template system intentionally small and explicit.

Supported variables:

1. `id`
2. `slug`
3. `title`
4. `description`
5. `priority`
6. `statusName`
7. `labels`

Central utilities should own:

1. `renderTaskPromptTemplate`
2. `validateTaskPromptTemplate`
3. `getSupportedTaskPromptVariables`
4. `buildDefaultTerminalTaskPrompt`
5. `buildDefaultChatTaskPrompt`

`superset-chat` should have its own explicit default template. It should not implicitly inherit another agent’s default.


## UI Design

Keep the settings route under desktop settings and present one card per built-in agent.

Each card should expose:

1. `Enabled`
2. `Label`
3. `Description`
4. `Command (No Prompt)`
5. `Command (With Prompt)`
6. `Prompt Command Suffix`
7. `Task Prompt Template`
8. `Preview`

### Save Model

Each card should edit a local draft and expose:

1. `Save`
2. `Reset to defaults`
3. dirty state
4. field validation

Do not save on blur.

### Preview

Each card should show:

1. a sample rendered task prompt
2. a sample no-prompt command
3. a sample task-driven command

### Override Visibility

The UI should indicate which fields differ from defaults.


## Launch Surface Integration

Every launch surface should use the same preference hook and the same request builder layer.

Required surfaces:

1. new workspace prompt launch
2. single task launch
3. batch task launch

UI surfaces should not compile shell commands directly.

Local preference keys should be centralized constants, not scattered string literals.


## Validation

### Router Validation

Validate:

1. agent id
2. required fields after trim
3. max lengths
4. template shape
5. override envelope schema

### UI Validation

Validate:

1. empty required fields
2. unknown template tokens
3. whitespace-only edits
4. obviously malformed command input


## Testing

### Unit Tests

Add tests for:

1. catalog-to-resolved preset normalization
2. override patch application
3. dropping fields that match defaults
4. prompt template rendering
5. prompt template validation
6. prompt launch request building
7. task launch request building
8. launch preference hook behavior

### Router Tests

Add tests for:

1. empty override state
2. partial override state
3. update semantics
4. reset semantics
5. read purity

### Component Tests

Add tests for:

1. card dirty state
2. save/reset behavior
3. preview rendering
4. enabled-toggle behavior

### Integration Checks

Verify:

1. disabled agents disappear from dropdowns
2. custom labels appear everywhere
3. task template changes affect all task launchers
4. prompt command changes affect prompt launches


## Milestones

### Milestone 1: Catalog and Overrides

1. add static built-in catalog
2. add override schema
3. persist override envelope only
4. remove initialization semantics

### Milestone 2: Resolved Presets and Router

1. resolve catalog + overrides into runtime presets
2. expose resolved presets from the router
3. add reset endpoints

### Milestone 3: Settings UI

1. move to card-level draft editing
2. add save/reset actions
3. add preview
4. surface override state

### Milestone 4: Launch Surface Wiring

1. keep one preference hook
2. keep one launch builder layer
3. remove command compilation from UI surfaces

### Milestone 5: Verification

1. unit tests
2. router tests
3. component tests
4. launch smoke tests


## Decisions

### 1. Local-Only Persistence

Agent settings stay local because binaries, flags, and safety posture are machine-specific.

### 2. Catalog + Overrides

Defaults live in code; storage contains only user changes.

### 3. Pure Reads

Loading settings must never write.

### 4. Card-Level Save

Agent configuration is edited and saved as one unit per card.

### 5. Explicit Chat Defaults

`superset-chat` owns its own default prompt template.
