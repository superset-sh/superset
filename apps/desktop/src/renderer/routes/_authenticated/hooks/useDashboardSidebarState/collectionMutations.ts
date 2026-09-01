import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import { getNextTabOrder } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { PROJECT_CUSTOM_COLORS } from "shared/constants/project-colors";

/**
 * Mutations for sidebar COLLECTIONS — the grouping level above projects.
 *
 * Kept as pure functions taking `collections` (mirroring `sidebarMutations.ts`)
 * so they can be unit tested without React. `useDashboardSidebarState` wraps
 * them in `useCallback`.
 *
 * A collection groups projects; a project points at its collection via
 * `v2SidebarProjects.collectionId` (null = sits at the sidebar root). This mirrors
 * how a workspace points at its section via `sidebarState.sectionId`.
 */

type CollectionCollections = Pick<
	AppCollections,
	"v2SidebarCollections" | "v2SidebarProjects"
>;

export const DEFAULT_COLLECTION_NAME = "New collection";

function pickCollectionColor(): string {
	return PROJECT_CUSTOM_COLORS[
		Math.floor(Math.random() * PROJECT_CUSTOM_COLORS.length)
	].value;
}

/** Create a collection at the end of the sidebar root. Returns its id. */
export function createCollectionInState(
	collections: CollectionCollections,
	options: { name?: string } = {},
): string {
	// Mirror renameCollectionInState: fall back rather than letting a blank name
	// fail the schema's `.min(1)` at insert time.
	const trimmed = options.name?.trim();
	const name = trimmed ? trimmed : DEFAULT_COLLECTION_NAME;
	const collectionId = crypto.randomUUID();

	collections.v2SidebarCollections.insert({
		collectionId,
		name,
		createdAt: new Date(),
		tabOrder: getNextTabOrder([
			...collections.v2SidebarCollections.state.values(),
		]),
		isCollapsed: false,
		color: pickCollectionColor(),
		icon: null,
	});

	return collectionId;
}

export function renameCollectionInState(
	collections: CollectionCollections,
	collectionId: string,
	name: string,
): void {
	const trimmed = name.trim();
	if (!trimmed) return;
	if (!collections.v2SidebarCollections.get(collectionId)) return;
	collections.v2SidebarCollections.update(collectionId, (draft) => {
		draft.name = trimmed;
	});
}

export function toggleCollectionCollapsedInState(
	collections: CollectionCollections,
	collectionId: string,
): void {
	if (!collections.v2SidebarCollections.get(collectionId)) return;
	collections.v2SidebarCollections.update(collectionId, (draft) => {
		draft.isCollapsed = !draft.isCollapsed;
	});
}

export function setCollectionColorInState(
	collections: CollectionCollections,
	collectionId: string,
	color: string | null,
): void {
	if (!collections.v2SidebarCollections.get(collectionId)) return;
	collections.v2SidebarCollections.update(collectionId, (draft) => {
		draft.color = color;
	});
}

export function setCollectionIconInState(
	collections: CollectionCollections,
	collectionId: string,
	icon: string | null,
): void {
	if (!collections.v2SidebarCollections.get(collectionId)) return;
	collections.v2SidebarCollections.update(collectionId, (draft) => {
		draft.icon = icon;
	});
}

/** Move a project into a collection, or back to the sidebar root when null. */
export function moveProjectToCollectionInState(
	collections: CollectionCollections,
	projectId: string,
	collectionId: string | null,
): void {
	if (!collections.v2SidebarProjects.get(projectId)) return;
	if (
		collectionId !== null &&
		!collections.v2SidebarCollections.get(collectionId)
	)
		return;

	collections.v2SidebarProjects.update(projectId, (draft) => {
		draft.collectionId = collectionId;
	});
}

/**
 * Delete a collection, returning its projects to the sidebar root rather than
 * deleting them — a collection is presentation only, so removing it must never
 * remove repos.
 */
export function deleteCollectionInState(
	collections: CollectionCollections,
	collectionId: string,
): void {
	if (!collections.v2SidebarCollections.get(collectionId)) return;

	for (const project of collections.v2SidebarProjects.state.values()) {
		if (project.collectionId !== collectionId) continue;
		collections.v2SidebarProjects.update(project.projectId, (draft) => {
			draft.collectionId = null;
		});
	}

	collections.v2SidebarCollections.delete(collectionId);
}

/** Rewrite collection order from a list of ids (index order wins). */
export function reorderCollectionsInState(
	collections: CollectionCollections,
	collectionIds: string[],
): void {
	collectionIds.forEach((collectionId, index) => {
		if (!collections.v2SidebarCollections.get(collectionId)) return;
		collections.v2SidebarCollections.update(collectionId, (draft) => {
			draft.tabOrder = index + 1;
		});
	});
}
