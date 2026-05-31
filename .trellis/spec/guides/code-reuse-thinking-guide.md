# Code Reuse Thinking Guide

Use this guide before adding a helper, constant, status mapping, command parser, route helper, or config value.

## Search First

Search the owning package and the shared packages before adding new logic:

```bash
rg "name_or_value" apps packages tooling
rg "functionName|typeName" apps packages tooling
```

Important reuse hubs:
- `packages/shared/src`: cross-runtime utilities and constants such as agent launch, roles, task slugs, branch naming, remote protocol, and terminal parsing.
- `packages/db/src/schema`: Drizzle tables and inferred row types.
- `packages/trpc/src/router/utils`: active organization and resource access helpers.
- `packages/host-service/src/runtime`: host git, filesystem, setup, teardown, pull request, and chat runtimes.
- `apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider`: Electric and local collection definitions.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/utils/sorting/sorting.ts`: task status and priority order.
- `packages/ui/src/lib/utils.ts`: `cn` and shared UI utilities.

## Common Reuse Patterns

Use existing row types instead of redefining shapes. Examples: `SelectTask`, `SelectTaskStatus`, and `SelectV2Workspace` from `@superset/db/schema`; tRPC `RouterOutputs` and `RouterInputs` from `@superset/trpc`; host-service `AppRouter` from `@superset/host-service`.

For task status UI, reuse `StatusIcon`, `StatusMenuItems`, and `compareStatusesForDropdown` instead of hard-coding status names or type order in a new component.

For workspace creation and launch naming, check `packages/shared/src/workspace-launch/*`, `apps/desktop/src/renderer/stores/workspace-creates`, and `apps/desktop/src/lib/trpc/routers/workspaces/utils/*` before adding a new branch or workspace naming helper.

For host-service filesystem access, reuse `@superset/workspace-fs` service/client abstractions. Do not call Node fs directly from renderer code.

## When To Add A New Helper

Add a helper when at least two call sites need the same rule, when a cross-layer payload needs a single typed shape, or when tests can lock down behavior that would otherwise drift. Keep helpers in the highest shared owner, not at the repo root by default.

## Avoid

- Duplicating organization membership checks instead of using tRPC utility helpers.
- Creating new status type order arrays when `sorting.ts` already owns task ordering.
- Reading raw local storage rows without the collection schemas and read-heal wrappers.
- Adding Node-only helpers to packages consumed by browser or renderer code.
