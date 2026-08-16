import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import { getNextTabOrder } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { PROJECT_CUSTOM_COLORS } from "shared/constants/project-colors";

/**
 * Mutations for sidebar FOLDERS — the grouping level above projects.
 *
 * Kept as pure functions taking `collections` (mirroring `sidebarMutations.ts`)
 * so they can be unit tested without React. `useDashboardSidebarState` wraps
 * them in `useCallback`.
 *
 * A folder groups projects; a project points at its folder via
 * `v2SidebarProjects.folderId` (null = sits at the sidebar root). This mirrors
 * how a workspace points at its section via `sidebarState.sectionId`.
 */

type FolderCollections = Pick<
	AppCollections,
	"v2SidebarFolders" | "v2SidebarProjects"
>;

export const DEFAULT_FOLDER_NAME = "New folder";

function pickFolderColor(): string {
	return PROJECT_CUSTOM_COLORS[
		Math.floor(Math.random() * PROJECT_CUSTOM_COLORS.length)
	].value;
}

/** Create a folder at the end of the sidebar root. Returns its id. */
export function createFolderInState(
	collections: FolderCollections,
	options: { name?: string } = {},
): string {
	// Mirror renameFolderInState: fall back rather than letting a blank name
	// fail the schema's `.min(1)` at insert time.
	const trimmed = options.name?.trim();
	const name = trimmed ? trimmed : DEFAULT_FOLDER_NAME;
	const folderId = crypto.randomUUID();

	collections.v2SidebarFolders.insert({
		folderId,
		name,
		createdAt: new Date(),
		tabOrder: getNextTabOrder([...collections.v2SidebarFolders.state.values()]),
		isCollapsed: false,
		color: pickFolderColor(),
		icon: null,
	});

	return folderId;
}

export function renameFolderInState(
	collections: FolderCollections,
	folderId: string,
	name: string,
): void {
	const trimmed = name.trim();
	if (!trimmed) return;
	if (!collections.v2SidebarFolders.get(folderId)) return;
	collections.v2SidebarFolders.update(folderId, (draft) => {
		draft.name = trimmed;
	});
}

export function toggleFolderCollapsedInState(
	collections: FolderCollections,
	folderId: string,
): void {
	if (!collections.v2SidebarFolders.get(folderId)) return;
	collections.v2SidebarFolders.update(folderId, (draft) => {
		draft.isCollapsed = !draft.isCollapsed;
	});
}

export function setFolderColorInState(
	collections: FolderCollections,
	folderId: string,
	color: string | null,
): void {
	if (!collections.v2SidebarFolders.get(folderId)) return;
	collections.v2SidebarFolders.update(folderId, (draft) => {
		draft.color = color;
	});
}

export function setFolderIconInState(
	collections: FolderCollections,
	folderId: string,
	icon: string | null,
): void {
	if (!collections.v2SidebarFolders.get(folderId)) return;
	collections.v2SidebarFolders.update(folderId, (draft) => {
		draft.icon = icon;
	});
}

/** Move a project into a folder, or back to the sidebar root when null. */
export function moveProjectToFolderInState(
	collections: FolderCollections,
	projectId: string,
	folderId: string | null,
): void {
	if (!collections.v2SidebarProjects.get(projectId)) return;
	if (folderId !== null && !collections.v2SidebarFolders.get(folderId)) return;

	collections.v2SidebarProjects.update(projectId, (draft) => {
		draft.folderId = folderId;
	});
}

/**
 * Delete a folder, returning its projects to the sidebar root rather than
 * deleting them — a folder is presentation only, so removing it must never
 * remove repos.
 */
export function deleteFolderInState(
	collections: FolderCollections,
	folderId: string,
): void {
	if (!collections.v2SidebarFolders.get(folderId)) return;

	for (const project of collections.v2SidebarProjects.state.values()) {
		if (project.folderId !== folderId) continue;
		collections.v2SidebarProjects.update(project.projectId, (draft) => {
			draft.folderId = null;
		});
	}

	collections.v2SidebarFolders.delete(folderId);
}

/** Rewrite folder order from a list of ids (index order wins). */
export function reorderFoldersInState(
	collections: FolderCollections,
	folderIds: string[],
): void {
	folderIds.forEach((folderId, index) => {
		if (!collections.v2SidebarFolders.get(folderId)) return;
		collections.v2SidebarFolders.update(folderId, (draft) => {
			draft.tabOrder = index + 1;
		});
	});
}
