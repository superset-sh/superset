# Mixed project-child ordering for workspace sidebar

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from `AGENTS.md` (root), `apps/desktop/AGENTS.md`, and the ExecPlan template at `.agents/commands/create-plan.md`.


## Purpose / Big Picture

The desktop workspace sidebar currently models a project's top-level children as two separate ordered lanes:

1. ungrouped workspaces
2. sections

That means users can reorder workspaces against workspaces and sections against sections, but they cannot reorder a section against an ungrouped workspace. The UI exposes this limitation as a drag-and-drop dead-end, but the real constraint is deeper: the server stores and queries these as distinct ordered collections and the sidebar always renders them in a fixed `workspaces -> sections` sequence.

After this change, a project's top-level children are treated as one ordered list consisting of:

1. ungrouped workspaces
2. sections

The important difference is that these items can now be interleaved arbitrarily by `tabOrder`. Section-internal workspaces remain separately ordered within each section.


## Assumptions

1. We can use the existing `tabOrder` columns on `workspaces` and `workspace_sections` as the persisted top-level ordering source of truth.
2. Section-contained workspaces should keep their current intra-section ordering behavior and continue using `workspaces.tabOrder`.
3. We should avoid a database migration unless the existing schema proves insufficient.
4. Keyboard shortcuts and next/previous workspace navigation must follow the same visual order the sidebar renders.


## Open Questions

1. Should the tRPC query shape returned by `getAllGrouped` gain a `topLevelItems` array, or should the renderer derive it from `workspaces` + `sections` during the transition?
   Decision Log: [DL-1](#dl-1-query-shape-for-top-level-items)
2. Should we replace `reorderSections` with a new mixed top-level reorder mutation immediately, or keep `reorderSections` as a compatibility wrapper during the refactor?
   Decision Log: [DL-2](#dl-2-mutation-transition-strategy)


## Progress

- [x] (2026-03-07 05:40Z) Draft ExecPlan
- [x] (2026-03-07 05:43Z) Inventory ordering assumptions across `getAllGrouped`, `computeVisualOrder`, sidebar DnD, and workspace shortcuts
- [x] (2026-03-07 05:45Z) Add shared server helper for mixed top-level project child ordering
- [x] (2026-03-07 05:45Z) Add backend tests for mixed workspace/section ordering
- [x] (2026-03-07 05:45Z) Route new top-level workspace/section creation through shared top-level child ordering
- [x] (2026-03-07 05:47Z) Move `computeVisualOrder` onto the shared mixed top-level ordering helper
- [x] (2026-03-07 06:19Z) Add `topLevelItems` to `getAllGrouped` and update keyboard shortcuts to use mixed top-level ordering
- [x] (2026-03-07 06:19Z) Replace sidebar rendering with one ordered top-level list per project
- [x] (2026-03-07 06:19Z) Replace section-only reorder mutation/UI flow with mixed top-level reorder flow
- [x] (2026-03-07 06:19Z) Update keyboard shortcut and next/previous workspace ordering
- [ ] Audit create/move paths so new items get correct top-level `tabOrder`
- [ ] Run `bun run typecheck`, targeted desktop tests, and manual sidebar DnD QA


## Surprises & Discoveries

- `getAllGrouped` currently returns separate `group.workspaces` and `group.sections`, and many renderer callsites assume the visual order is always “ungrouped workspaces first, then all sections”.
- `getWorkspacesInVisualOrder` in `apps/desktop/src/lib/trpc/routers/workspaces/procedures/query.ts` also hardcodes that same two-lane ordering, so keyboard navigation and sidebar DnD semantics are coupled to the query shape.
- The existing creation paths were already inconsistent with the desired model: new sections appended relative only to sections, while new top-level workspaces appended relative only to workspaces. That had to be unified before mixed reordering could behave predictably.
- Desktop typecheck surfaced an unrelated-but-live issue in the collapsed section drag-handle refs. That wiring needed a callback-ref fix before the package would typecheck cleanly.
- Once the sidebar started rendering from `topLevelItems`, several optimistic cache writers (`close`, `delete`) needed to remove entries from both `sections[*].workspaces` and `topLevelItems`. Those optimistic paths were previously incomplete for section-contained workspaces too.


## Decision Log

### DL-1 Query shape for top-level items

TBD. The cleanest long-term shape is likely a `topLevelItems` array on each project group, but that is a broader API change. A staged migration can keep `workspaces` and `sections` in the query while deriving a mixed array in the renderer first.


### DL-2 Mutation transition strategy

TBD. A new mixed reorder mutation is the right end state. We may temporarily keep `reorderSections` as a wrapper or stop using it from the sidebar as soon as the new mutation exists.


## Outcomes & Retrospective

TBD after implementation.


## Context and Orientation

Relevant files:

- `apps/desktop/src/lib/trpc/routers/workspaces/procedures/query.ts` builds the grouped sidebar data and the visual order used for next/previous workspace navigation.
- `apps/desktop/src/lib/trpc/routers/workspaces/procedures/sections.ts` owns section creation, section reordering, and moving workspaces in/out of sections.
- `apps/desktop/src/lib/trpc/routers/workspaces/procedures/create.ts` assigns `tabOrder` when new workspaces are created.
- `apps/desktop/src/renderer/screens/main/components/WorkspaceSidebar/ProjectSection/ProjectSection.tsx` currently renders ungrouped workspaces first and sections second.
- `apps/desktop/src/renderer/screens/main/components/WorkspaceSidebar/WorkspaceSection/WorkspaceSection.tsx` implements section drag-and-drop against other sections only.
- `apps/desktop/src/renderer/screens/main/components/WorkspaceSidebar/WorkspaceListItem/useWorkspaceDnD.ts` implements workspace drag-and-drop within ungrouped and in-section lanes.
- `apps/desktop/src/renderer/hooks/useWorkspaceShortcuts.ts` flattens workspaces using the old grouped ordering assumptions.

Current persisted ordering model:

- Top-level ungrouped workspaces use `workspaces.tabOrder`
- Sections use `workspace_sections.tabOrder`
- In-section workspaces also use `workspaces.tabOrder`, but only relative to other workspaces in the same section

Current rendering model:

    project
      - group.workspaces sorted by tabOrder
      - group.sections sorted by tabOrder
        - section.workspaces sorted by tabOrder

Target rendering model:

    project
      - topLevelItems sorted by tabOrder
        - workspace item
        - section item
          - section.workspaces sorted by tabOrder


## Plan of Work

### Milestone 1: Lock down a mixed top-level ordering helper

Add a server-side helper that can load a project's top-level children as one list, reorder them, and persist normalized `tabOrder` values back to both `workspaces` and `workspace_sections`.

Scope:

1. Add a utility under `apps/desktop/src/lib/trpc/routers/workspaces/utils/` for:
   - collecting ungrouped workspaces and sections for one project
   - sorting them by `tabOrder`
   - moving one item to a target position
   - writing sequential `tabOrder` values back to the correct tables
2. Keep section-internal workspace ordering out of this helper.
3. Add tests that prove a section can be moved before/after an ungrouped workspace and that ordering remains normalized.

Acceptance:

    bun test apps/desktop/src/lib/trpc/routers/workspaces/utils


### Milestone 2: Introduce a mixed top-level reorder mutation

Add a new mutation for project-level child reordering and move the sidebar off `reorderSections` for top-level ordering.

Scope:

1. Add a tRPC mutation that accepts:
   - `projectId`
   - dragged item kind/id
   - destination index within the combined top-level list
2. Reuse the helper from Milestone 1.
3. Keep `reorderWorkspacesInSection` unchanged for section contents.

Acceptance:

Backend tests cover:

1. workspace before section
2. section before workspace
3. no-op reorders
4. invalid item IDs / invalid indices


### Milestone 3: Make query and shortcut ordering match the new model

Refactor server query helpers and shortcut consumers so the visual order is based on mixed top-level project children, not a fixed workspaces-then-sections sequence.

Scope:

1. Update `getWorkspacesInVisualOrder` and `computeVisualOrder` usage to iterate projects by mixed top-level order.
2. Update `getAllGrouped` or its renderer consumers so top-level order can be rendered without assuming `group.workspaces` comes first.
3. Update `useWorkspaceShortcuts` to flatten workspaces in true visual order.

Acceptance:

1. Keyboard shortcuts match sidebar order.
2. Previous/next workspace navigation matches sidebar order.


### Milestone 4: Refactor sidebar rendering and DnD

Render one mixed top-level list per project and allow section/workspace drag-and-drop across that list.

Scope:

1. In `ProjectSection.tsx`, replace the fixed “ungrouped workspaces then sections” rendering with a mixed ordered list.
2. Add a shared top-level DnD path for project children.
3. Preserve existing section-internal workspace DnD behavior.
4. Update optimistic cache writes to reorder the mixed top-level list correctly.

Acceptance:

Manual QA:

1. Drag section above an ungrouped workspace.
2. Drag section below an ungrouped workspace.
3. Drag ungrouped workspace around sections.
4. Reorder workspaces inside a section unchanged.


### Milestone 5: Audit creation and move semantics

Ensure all mutations that create or relocate top-level items produce stable mixed ordering.

Scope:

1. New top-level workspaces should append to the mixed top-level list, not just the ungrouped workspace lane.
2. New sections should append to the mixed top-level list, not just the sections lane.
3. Moving a workspace into or out of a section should preserve sane ordering for both the top-level list and the destination section.

Acceptance:

Targeted tests cover:

1. creating a section after top-level workspaces exist
2. creating a workspace after sections exist
3. moving a workspace out of a section into top-level placement
