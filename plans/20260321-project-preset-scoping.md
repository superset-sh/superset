# Project-Scoped Terminal Presets

## Status

Proposed

## Decision

Keep presets as one local feature and store project targeting directly on the preset.

Use `projectIds: string[] | null`:

- `null`: preset is available in every project
- non-empty array: preset is available only in those projects

For v1, do not move presets into `.superset/config.json`. Keep the primary editor in `Settings > Terminal`, and use Project settings only as a contextual shortcut into that same editor.

## Why

The key requirement is multi-project scope. Once a preset can target multiple projects, Project settings is no longer the natural primary owner.

This approach keeps the current preset architecture intact:

- one preset store
- one router
- one editor
- one runtime resolution path

It also avoids designing preset merge semantics in project config before we actually need shared presets.

## Project Targeting Model

Recommended shape:

```ts
interface TerminalPreset {
  id: string;
  name: string;
  description?: string;
  cwd: string;
  commands: string[];
  pinnedToBar?: boolean;
  isDefault?: boolean;
  applyOnWorkspaceCreated?: boolean;
  applyOnNewTab?: boolean;
  executionMode?: ExecutionMode;
  projectIds: string[] | null;
}
```

Rules:

- `null` means `All projects`
- a non-empty array means `Specific projects`
- `[]` should be rejected or normalized to `null`

## UX

### Primary management

Keep the canonical UI in:

- `Settings > Terminal > Presets`

### Project entrypoint

Add a lightweight section in Project settings:

- `New preset for this project`
- `Manage project presets`

These should deep-link into Terminal settings with project context applied. Do not build a second full preset editor in Project settings.

### Preset editor

Add a derived `Project access` field at the top:

- `All projects`
- `Specific projects`

If `Specific projects` is selected:

- show a searchable multi-select
- show selected projects as chips/tokens

Defaults:

- creating from Terminal settings defaults to `All projects`
- creating from project context preselects the current project

### Presets table

Keep one table and add:

- `Applies to` badge/column
- filters: `All`, `Global`, `Current project`

Display:

- `All`
- project name
- `N projects`

## Runtime Behavior

### Matching

A preset matches when:

- `projectIds === null`, or
- `projectIds` contains the active project

### Ordering

When both match:

1. project-targeted presets
2. global presets

Preserve existing relative order within each group.

### Auto-apply

For workspace creation and new-tab triggers:

1. use matching project-targeted presets if any exist for the trigger
2. otherwise fall back to matching global presets
3. otherwise use existing default behavior

### Presets bar

Pinned presets should also respect project targeting. If a preset does not match the active project, it should not render.

## Storage

For v1, store project-targeted presets in the existing local settings-backed preset store.

Do not store them in `.superset/config.json` yet.

Reason:

- simpler implementation
- supports multi-project targeting naturally
- avoids mixing personal and shared ownership models in one change

## Migration

No explicit migration flow is needed.

Existing presets become:

- `projectIds: null`

This preserves current behavior.

## Implementation Outline

1. Extend preset schema and normalization with `projectIds`.
2. Extend preset create/update APIs with project targeting validation.
3. Add shared preset matching and precedence helpers.
4. Update Terminal settings UI with project access controls and filters.
5. Add Project settings shortcuts into the shared preset editor.
6. Update launch surfaces to filter presets by active project.

Likely files:

- `packages/local-db/src/schema/zod.ts`
- `apps/desktop/src/lib/trpc/routers/settings/index.ts`
- `apps/desktop/src/renderer/routes/_authenticated/settings/terminal/components/TerminalSettings/components/PresetsSection/PresetsSection.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/settings/project/$projectId/components/ProjectSettings/ProjectSettings.tsx`

## Rejected for V1

### Project config-backed presets

Do not move presets into `.superset/config.json` yet.

That may become useful later for shared/team presets, but it introduces a bigger design problem:

- source priority
- merge semantics for preset arrays
- edit destination ambiguity

If we need shared presets later, we can add them as a second source and merge them into one resolved preset list.
