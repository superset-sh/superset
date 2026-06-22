# New Workspace in Section — Implementation Plan

> **For agentic workers:** Implement this plan task-by-task in order. Steps use checkbox (`- [ ]`) syntax for tracking. This is a lightweight plan — tasks are small and mostly mechanical wiring; follow existing patterns in the touched files.

**Goal:** Add a "New Workspace" item to a workspace section's right-click context menu that opens the existing New Workspace modal pre-scoped to that section, so the created workspace lands inside the group instead of at the project's top level (eliminating the create-then-drag step).

**Architecture:** A "section" (`workspaceSections` table) is a workspace group belonging to exactly one project. The new menu item calls the existing `openModal(projectId, sectionId)`. We thread a new `sectionId` through the existing pre-selection plumbing: store → modal wrapper → modal content → draft context → create mutation input. The server `create` mutation gains an optional `sectionId`, validates it belongs to the passed project, and sets it on the inserted workspace row (today it always defaults to NULL = ungrouped). This reuses the exact pattern already used for `preSelectedProjectId`.

**Tech Stack:** Electron + React + Zustand + tRPC (trpc-electron) + Drizzle (local SQLite) + Vitest. Desktop app only (`apps/web` has no sidebar groups).

## Global Constraints

- Desktop app only — all changes under `apps/desktop/` except the schema reference, which is `@superset/local-db`.
- Use the tsconfig path aliases already present in each file (`renderer/...`, `@superset/local-db`, etc.).
- A workspace's `sectionId` and `projectId` must never disagree: a section belongs to one project, so the server must derive/verify project from section.
- Run `bun run typecheck` and `bun run lint` at the repo root before considering the work done; both must exit 0 (CI fails on Biome warnings).

---

### Task 1: Server — accept, validate, and persist `sectionId` on create

**Files:**
- Modify: `apps/desktop/src/lib/trpc/routers/workspaces/procedures/create.ts`
- Test: `apps/desktop/src/lib/trpc/routers/workspaces/utils/section-project-guard.test.ts` (create)
- Create: `apps/desktop/src/lib/trpc/routers/workspaces/utils/section-project-guard.ts`

**Interfaces:**
- Produces: `assertSectionMatchesProject(section: { id: string; projectId: string } | undefined, projectId: string): void` — throws `Error` if `section` is undefined (not found) or `section.projectId !== projectId`. Used inside the `create` mutation.

**Why a helper:** the `create` mutation does real git/worktree I/O and isn't cheaply unit-testable, but the project/section consistency rule is pure logic and IS. We unit-test the helper and wire it in.

- [ ] **Step 1: Write the failing test**

```ts
// apps/desktop/src/lib/trpc/routers/workspaces/utils/section-project-guard.test.ts
import { describe, expect, it } from "vitest";
import { assertSectionMatchesProject } from "./section-project-guard";

describe("assertSectionMatchesProject", () => {
	it("passes when the section belongs to the project", () => {
		expect(() =>
			assertSectionMatchesProject({ id: "s1", projectId: "p1" }, "p1"),
		).not.toThrow();
	});

	it("throws when the section was not found", () => {
		expect(() => assertSectionMatchesProject(undefined, "p1")).toThrow(
			/section/i,
		);
	});

	it("throws when the section belongs to a different project", () => {
		expect(() =>
			assertSectionMatchesProject({ id: "s1", projectId: "p2" }, "p1"),
		).toThrow(/project/i);
	});
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `cd apps/desktop && bunx vitest run src/lib/trpc/routers/workspaces/utils/section-project-guard.test.ts`
Expected: FAIL — `assertSectionMatchesProject` is not defined / module not found.

- [ ] **Step 3: Implement the helper**

```ts
// apps/desktop/src/lib/trpc/routers/workspaces/utils/section-project-guard.ts
/** Guards that a target section exists and belongs to the given project. */
export function assertSectionMatchesProject(
	section: { id: string; projectId: string } | undefined,
	projectId: string,
): void {
	if (!section) {
		throw new Error("Target section not found");
	}
	if (section.projectId !== projectId) {
		throw new Error("Section does not belong to the selected project");
	}
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `cd apps/desktop && bunx vitest run src/lib/trpc/routers/workspaces/utils/section-project-guard.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Add `sectionId` to the `create` input schema**

In `create.ts`, add `workspaceSections` to the local-db import on line 1:

```ts
import { projects, workspaceSections, workspaces, worktrees } from "@superset/local-db";
```

Add the field inside the `z.object({ ... })` (after `applyPrefix`, around line 447):

```ts
			applyPrefix: z.boolean().optional().default(true),
			sectionId: z.string().optional(),
```

- [ ] **Step 6: Validate the section after the project lookup**

In the `.mutation(async ({ input }) => {` body, immediately after the existing project-not-found check (after line 472, `}`), add:

```ts
				if (input.sectionId) {
					const section = localDb
						.select({
							id: workspaceSections.id,
							projectId: workspaceSections.projectId,
						})
						.from(workspaceSections)
						.where(eq(workspaceSections.id, input.sectionId))
						.get();
					assertSectionMatchesProject(section, input.projectId);
				}
```

Add the import near the other util imports at the top of the file:

```ts
import { assertSectionMatchesProject } from "../utils/section-project-guard";
```

- [ ] **Step 7: Persist `sectionId` on the workspace insert**

In the `localDb.insert(workspaces).values({ ... })` block (around line 659), add the field after `tabOrder`:

```ts
					tabOrder: maxTabOrder + 1,
					sectionId: input.sectionId ?? null,
```

- [ ] **Step 8: Typecheck + commit**

```bash
cd apps/desktop && bunx vitest run src/lib/trpc/routers/workspaces/utils/section-project-guard.test.ts
cd /Users/hp/.superset/worktrees/c4e4e5ba-b0e4-4a01-93c0-9b224d487729/maroon-euphonium && bun run typecheck
git add apps/desktop/src/lib/trpc/routers/workspaces
git commit -m "feat(desktop): accept sectionId when creating a workspace"
```

---

### Task 2: Store — carry `preSelectedSectionId` through `openModal`

**Files:**
- Modify: `apps/desktop/src/renderer/stores/new-workspace-modal.ts`

**Interfaces:**
- Produces: `openModal(projectId?: string, sectionId?: string): void`; `usePreSelectedSectionId(): string | null`.

- [ ] **Step 1: Add state field + extend `openModal`/`closeModal`**

In `NewWorkspaceModalState` (after `preSelectedProjectId: string | null;`, line 27):

```ts
	preSelectedSectionId: string | null;
```

Change the `openModal` signature in the interface (line 30):

```ts
	openModal: (projectId?: string, sectionId?: string) => void;
```

In the store implementation, add to the initial state (after line 47):

```ts
			preSelectedSectionId: null,
```

Replace the `openModal` impl (lines 51–53):

```ts
				openModal: (projectId?: string, sectionId?: string) => {
					set({
						isOpen: true,
						preSelectedProjectId: projectId ?? null,
						preSelectedSectionId: sectionId ?? null,
					});
				},
```

Replace the `closeModal` impl (lines 55–57):

```ts
				closeModal: () => {
					set({
						isOpen: false,
						preSelectedProjectId: null,
						preSelectedSectionId: null,
					});
				},
```

In `restoreStashedDraft` (around line 91), leave section handling out — stash/restore intentionally does not carry `sectionId` (see Out of Scope). No change needed there.

- [ ] **Step 2: Add the selector hook**

After `usePreSelectedProjectId` (line 111):

```ts
export const usePreSelectedSectionId = () =>
	useNewWorkspaceModalStore((state) => state.preSelectedSectionId);
```

- [ ] **Step 3: Typecheck + commit**

```bash
cd /Users/hp/.superset/worktrees/c4e4e5ba-b0e4-4a01-93c0-9b224d487729/maroon-euphonium && bun run typecheck
git add apps/desktop/src/renderer/stores/new-workspace-modal.ts
git commit -m "feat(desktop): thread preSelectedSectionId through new-workspace modal store"
```

---

### Task 3: Draft context — add `sectionId` to the modal draft

**Files:**
- Modify: `apps/desktop/src/renderer/components/NewWorkspaceModal/NewWorkspaceModalDraftContext.tsx`

**Interfaces:**
- Produces: `draft.sectionId: string | null` available via `useNewWorkspaceModalDraft()`.

- [ ] **Step 1: Add the field to the draft type + initial value**

In `NewWorkspaceModalDraft` (after `selectedProjectId: string | null;`, line 33):

```ts
	sectionId: string | null;
```

In `initialDraft` (after `selectedProjectId: null,`, line 51):

```ts
	sectionId: null,
```

In the `draft` object inside the `value` useMemo (after `selectedProjectId: state.selectedProjectId,`, line 159):

```ts
				sectionId: state.sectionId,
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd /Users/hp/.superset/worktrees/c4e4e5ba-b0e4-4a01-93c0-9b224d487729/maroon-euphonium && bun run typecheck
git add apps/desktop/src/renderer/components/NewWorkspaceModal/NewWorkspaceModalDraftContext.tsx
git commit -m "feat(desktop): add sectionId to new-workspace modal draft"
```

---

### Task 4: Modal wiring — apply `preSelectedSectionId` into the draft

**Files:**
- Modify: `apps/desktop/src/renderer/components/NewWorkspaceModal/NewWorkspaceModal.tsx`
- Modify: `apps/desktop/src/renderer/components/NewWorkspaceModal/components/NewWorkspaceModalContent/NewWorkspaceModalContent.tsx`

**Interfaces:**
- Consumes: `usePreSelectedSectionId()` (Task 2), `draft.sectionId` / `updateDraft` (Task 3).

- [ ] **Step 1: Read and pass `preSelectedSectionId` in the modal wrapper**

In `NewWorkspaceModal.tsx`, add to the imports from `renderer/stores/new-workspace-modal` (line 17–21):

```ts
import {
	useCloseNewWorkspaceModal,
	useNewWorkspaceModalOpen,
	usePreSelectedProjectId,
	usePreSelectedSectionId,
} from "renderer/stores/new-workspace-modal";
```

Read it next to `preSelectedProjectId` (after line 50):

```ts
	const preSelectedSectionId = usePreSelectedSectionId();
```

Pass it to `NewWorkspaceModalContent` (after line 92):

```ts
							preSelectedProjectId={preSelectedProjectId}
							preSelectedSectionId={preSelectedSectionId}
```

- [ ] **Step 2: Accept the prop and set the draft in the content component**

In `NewWorkspaceModalContent.tsx`, add to `NewWorkspaceModalContentProps` (after `preSelectedProjectId: string | null;`, line 8):

```ts
	preSelectedSectionId: string | null;
```

Destructure it in the component params (after `preSelectedProjectId,`, line 16):

```ts
	preSelectedSectionId,
```

In the pre-selection `useEffect`, set the section alongside the project. When the pre-selected project is applied (inside the `if (hasPreSelectedProject) {` block, replace lines 53–57):

```ts
				appliedPreSelectionRef.current = preSelectedProjectId;
				if (preSelectedProjectId !== draft.selectedProjectId) {
					updateDraft({
						selectedProjectId: preSelectedProjectId,
						sectionId: preSelectedSectionId,
					});
				} else if (draft.sectionId !== preSelectedSectionId) {
					updateDraft({ sectionId: preSelectedSectionId });
				}
				return;
```

In the fallback branch where no valid project is selected (replace lines 66–68), clear the section so a manually-picked project never inherits a stale section:

```ts
			if (!hasSelectedProject) {
				updateDraft({
					selectedProjectId: recentProjects[0]?.id ?? null,
					sectionId: null,
				});
			}
```

Add `draft.sectionId` and `preSelectedSectionId` to the effect dependency array (the array at lines 69–76).

Also clear the section when the user manually changes the project via the picker: update the `onSelectProject` handler passed to `PromptGroup` (lines 88–90):

```ts
					onSelectProject={(selectedProjectId) =>
						updateDraft({ selectedProjectId, sectionId: null })
					}
```

- [ ] **Step 3: Typecheck + commit**

```bash
cd /Users/hp/.superset/worktrees/c4e4e5ba-b0e4-4a01-93c0-9b224d487729/maroon-euphonium && bun run typecheck
git add apps/desktop/src/renderer/components/NewWorkspaceModal
git commit -m "feat(desktop): apply preSelectedSectionId into new-workspace draft"
```

---

### Task 5: Create call — include `sectionId` in the mutation input

**Files:**
- Modify: `apps/desktop/src/renderer/components/NewWorkspaceModal/components/PromptGroup/PromptGroup.tsx`

**Interfaces:**
- Consumes: `draft.sectionId` (Task 3); the `create` input field `sectionId` (Task 1).

- [ ] **Step 1: Read `draft.sectionId` and pass it to `createWorkspace`**

The component already destructures `draft` from `useNewWorkspaceModalDraft()` (line 541). In the `createWorkspace.mutateAsyncWithPendingSetup({ ... })` call (the input object at lines 975–992), add after `compareBaseBranch`:

```ts
							compareBaseBranch: compareBaseBranch || undefined,
							sectionId: draft.sectionId ?? undefined,
```

If `compareBaseBranch` here is a destructured local rather than `draft.compareBaseBranch`, still reference the section as `draft.sectionId` (the draft object is in scope via line 541).

- [ ] **Step 2: Typecheck + lint + commit**

```bash
cd /Users/hp/.superset/worktrees/c4e4e5ba-b0e4-4a01-93c0-9b224d487729/maroon-euphonium && bun run typecheck && bun run lint
git add apps/desktop/src/renderer/components/NewWorkspaceModal/components/PromptGroup/PromptGroup.tsx
git commit -m "feat(desktop): pass sectionId from draft into create workspace mutation"
```

---

### Task 6: UI trigger — "New Workspace" item in the section context menu

**Files:**
- Modify: `apps/desktop/src/renderer/screens/main/components/WorkspaceSidebar/WorkspaceSection/WorkspaceSection.tsx`

**Interfaces:**
- Consumes: `useOpenNewWorkspaceModal()` from `renderer/stores/new-workspace-modal`; the component already has `projectId` and `sectionId` props (lines 31–32).

- [ ] **Step 1: Import the icon, hook, and (if not present) the auto-expand mutation**

Add `LuPlus` to the `react-icons/lu` import (line 17):

```ts
import { LuPalette, LuPencil, LuPlus, LuTrash2 } from "react-icons/lu";
```

Add the hook import near the other `renderer/...` imports (e.g. after line 20):

```ts
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";
```

Inside the component (after `const mutations = useSectionMutations(sectionId);`, line 60):

```ts
	const openNewWorkspaceModal = useOpenNewWorkspaceModal();

	const handleNewWorkspaceInSection = useCallback(() => {
		if (isCollapsed) mutations.toggle();
		openNewWorkspaceModal(projectId, sectionId);
	}, [isCollapsed, mutations, openNewWorkspaceModal, projectId, sectionId]);
```

(`useCallback` is already imported on line 14.)

- [ ] **Step 2: Add the menu item at the top of the context menu**

In `ContextMenuContent` (line 258), add the new item as the FIRST child, before "Rename Section", with a separator after it:

```tsx
					<ContextMenuContent>
						<ContextMenuItem onSelect={handleNewWorkspaceInSection}>
							<LuPlus className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
							New Workspace
						</ContextMenuItem>
						<ContextMenuSeparator />
						<ContextMenuItem onSelect={handleStartRename}>
							<LuPencil className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
							Rename Section
						</ContextMenuItem>
```

(`ContextMenuSeparator` is already imported on line 5.)

- [ ] **Step 3: Typecheck + lint + commit**

```bash
cd /Users/hp/.superset/worktrees/c4e4e5ba-b0e4-4a01-93c0-9b224d487729/maroon-euphonium && bun run typecheck && bun run lint
git add apps/desktop/src/renderer/screens/main/components/WorkspaceSidebar/WorkspaceSection/WorkspaceSection.tsx
git commit -m "feat(desktop): add New Workspace item to section context menu"
```

---

### Task 7: Manual verification

- [ ] **Step 1: Full quality gate**

```bash
cd /Users/hp/.superset/worktrees/c4e4e5ba-b0e4-4a01-93c0-9b224d487729/maroon-euphonium && bun run typecheck && bun run lint
```

Expected: both exit 0, no Biome warnings.

- [ ] **Step 2: Manual smoke test in the desktop app**

Run the desktop app (`bun dev` or the desktop-specific dev command). Then:
1. Create a section/group in the sidebar if none exists, with at least one project.
2. Right-click the section header → confirm a **New Workspace** item appears at the top, above Rename Section, with a `+` icon and a separator below it.
3. Click it → the New Workspace modal opens with the section's **project pre-selected**.
4. Fill a name, click **Create**.
5. Confirm the new workspace appears **inside that section** (not at the project top level), with no manual drag.
6. Right-click a section, open the modal, then **switch the project** in the picker → confirm the create lands at top level (section cleared), proving project/section can't disagree.
7. Collapsed-section case: collapse a section, right-click → New Workspace; confirm the section auto-expands so the new workspace is visible.

---

## Out of Scope (v1)

- **Stash/restore of `sectionId`:** `StashedDraft` (failure-recovery snapshot in `new-workspace-modal.ts`) does not carry `sectionId`. If a create fails and the draft is restored, the section falls back to ungrouped. Acceptable for v1; revisit if users report it.
- **Web app:** `apps/web` has no sidebar groups; no changes there.
- **Project-level "New Workspace in new section":** not part of this change.
- **Visible read-only "Section" field in the modal UI:** the section is applied as invisible context (project is pre-selected). Adding an explicit "Section: <name>" indicator is a possible follow-up for transparency.
