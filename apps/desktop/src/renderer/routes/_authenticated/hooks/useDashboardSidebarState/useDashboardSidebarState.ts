import type { Pane } from "@superset/panes";
import { useCallback } from "react";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import { browserRuntimeRegistry } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/BrowserPane/browserRuntimeRegistry";
import {
	extractPaneIds,
	type PaneLifecycleRow,
} from "renderer/routes/_authenticated/components/utils/paneLifecycleRows";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import {
	getNextTabOrder,
	getPrependTabOrder,
	isSidebarWorkspaceVisible,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import {
	normalizeWorkspaceTag,
	normalizeWorkspaceTags,
} from "@superset/shared/workspace-tags";
import { useOptimisticActions } from "renderer/routes/_authenticated/hooks/useOptimisticActions";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	applyFolderTagChange,
	buildSidebarFolderKey,
	deriveTagFolders,
	getProjectFolderTagIndex,
	mintFolderTag,
	parseSidebarFolderKey,
	resolveWorkspaceSectionId,
	type TagFolderRef,
	type TagFolderWorkspaceInput,
} from "renderer/routes/_authenticated/utils/workspaceTagFolders";
import { PROJECT_CUSTOM_COLORS } from "shared/constants/project-colors";
import {
	createEmptyPaneLayout,
	removeProjectFromSidebarState,
	tombstoneSidebarWorkspaceRecord,
} from "./sidebarMutations";

type ProjectTopLevelItem = {
	type: "workspace" | "section";
	id: string;
	tabOrder: number;
};

type ProjectTopLevelCollections = Pick<
	AppCollections,
	"v2SidebarSections" | "v2WorkspaceLocalState"
>;

function compareProjectTopLevelItems(
	left: ProjectTopLevelItem,
	right: ProjectTopLevelItem,
): number {
	const orderDelta = left.tabOrder - right.tabOrder;
	if (orderDelta !== 0) return orderDelta;
	if (left.type === right.type) return 0;
	return left.type === "section" ? -1 : 1;
}

function getProjectTopLevelItems(
	collections: ProjectTopLevelCollections,
	// Host rows carry the tags that decide folder membership — a workspace
	// whose tag resolves into a folder must NOT count as top-level, or every
	// insert index computed against this lane is shifted by phantom siblings.
	// Same resolver as the sidebar builder and the flatten pass.
	hostWorkspaces: readonly TagFolderWorkspaceInput[],
	// Null scopes to the Sessions section (project-less workspaces).
	projectId: string | null,
	options: { excludeWorkspaceId?: string; excludeSectionId?: string } = {},
): ProjectTopLevelItem[] {
	const folderIndex: ReadonlyMap<string, TagFolderRef> =
		projectId === null
			? new Map()
			: getProjectFolderTagIndex(
					deriveTagFolders(
						Array.from(collections.v2SidebarSections.state.values()),
						hostWorkspaces,
					),
					projectId,
				);
	const hostTagsByWorkspaceId = new Map(
		hostWorkspaces.map((workspace) => [workspace.id, workspace.tags]),
	);
	return [
		...Array.from(collections.v2WorkspaceLocalState.state.values())
			.filter(
				(item) =>
					item.sidebarState.projectId === projectId &&
					isSidebarWorkspaceVisible(item) &&
					resolveWorkspaceSectionId({
						tags: hostTagsByWorkspaceId.get(item.workspaceId),
						localSectionId: item.sidebarState.sectionId,
						index: folderIndex,
					}) === null &&
					item.workspaceId !== options.excludeWorkspaceId,
			)
			.map((item) => ({
				type: "workspace" as const,
				id: item.workspaceId,
				tabOrder: item.sidebarState.tabOrder,
			})),
		// Stored rows only: a derived-only folder has no row to renumber, and
		// its synthetic tabOrder floor must never feed getNextTabOrder math.
		...Array.from(collections.v2SidebarSections.state.values())
			.filter(
				(item) =>
					item.projectId === projectId &&
					item.sectionId !== options.excludeSectionId,
			)
			.map((item) => ({
				type: "section" as const,
				id: item.sectionId,
				tabOrder: item.tabOrder,
			})),
	].sort(compareProjectTopLevelItems);
}

function getProjectFolderIndex(
	collections: Pick<AppCollections, "v2SidebarSections">,
	hostWorkspaces: readonly TagFolderWorkspaceInput[],
	projectId: string | null,
): ReadonlyMap<string, TagFolderRef> {
	if (projectId === null) return new Map();
	return getProjectFolderTagIndex(
		deriveTagFolders(
			Array.from(collections.v2SidebarSections.state.values()),
			hostWorkspaces,
		),
		projectId,
	);
}

function getHostWorkspaceTags(
	hostWorkspaces: readonly TagFolderWorkspaceInput[],
	workspaceId: string,
): string[] {
	return normalizeWorkspaceTags(
		hostWorkspaces.find((workspace) => workspace.id === workspaceId)?.tags,
	);
}

/** Effective container of a local row — the shared resolver, over host tags. */
function getEffectiveSectionId(
	collections: Pick<AppCollections, "v2SidebarSections">,
	hostWorkspaces: readonly TagFolderWorkspaceInput[],
	row: { workspaceId: string; sidebarState: { projectId: string | null; sectionId: string | null } },
): string | null {
	return resolveWorkspaceSectionId({
		tags: getHostWorkspaceTags(hostWorkspaces, row.workspaceId),
		localSectionId: row.sidebarState.sectionId,
		index: getProjectFolderIndex(
			collections,
			hostWorkspaces,
			row.sidebarState.projectId,
		),
	});
}

function getFirstSectionIndex(items: ProjectTopLevelItem[]): number {
	const firstSectionIndex = items.findIndex((item) => item.type === "section");
	return firstSectionIndex === -1 ? items.length : firstSectionIndex;
}

/**
 * Rewrites the flat top-level project lane. Workspace items are explicitly
 * ungrouped by setting sidebarState.projectId and clearing sidebarState.sectionId.
 */
function writeProjectTopLevelOrder(
	collections: ProjectTopLevelCollections,
	projectId: string | null,
	items: ProjectTopLevelItem[],
): void {
	items.forEach((item, index) => {
		const tabOrder = index + 1;
		if (item.type === "workspace") {
			if (!collections.v2WorkspaceLocalState.get(item.id)) return;
			collections.v2WorkspaceLocalState.update(item.id, (draft) => {
				draft.sidebarState.projectId = projectId;
				draft.sidebarState.sectionId = null;
				draft.sidebarState.tabOrder = tabOrder;
				draft.sidebarState.isHidden = false;
			});
			return;
		}

		if (!collections.v2SidebarSections.get(item.id)) return;
		collections.v2SidebarSections.update(item.id, (draft) => {
			draft.tabOrder = tabOrder;
		});
	});
}

function ensureSidebarProjectRecord(
	collections: Pick<AppCollections, "v2SidebarProjects">,
	projectId: string,
): void {
	if (collections.v2SidebarProjects.get(projectId)) {
		return;
	}

	collections.v2SidebarProjects.insert({
		projectId,
		createdAt: new Date(),
		// Prepend, matching new workspaces: the project you just added is
		// the one you're about to work in.
		tabOrder: getPrependTabOrder([
			...collections.v2SidebarProjects.state.values(),
		]),
		isCollapsed: false,
	});
}

function ensureSidebarWorkspaceRecord(
	collections: Pick<
		AppCollections,
		"v2SidebarSections" | "v2WorkspaceLocalState"
	>,
	hostWorkspaces: readonly TagFolderWorkspaceInput[],
	workspaceId: string,
	// Null places the workspace in the Sessions section.
	projectId: string | null,
): void {
	const existing = collections.v2WorkspaceLocalState.get(workspaceId);
	if (existing && isSidebarWorkspaceVisible(existing)) {
		return;
	}

	const topLevelItems = getProjectTopLevelItems(
		collections,
		hostWorkspaces,
		projectId,
	);

	if (existing) {
		collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
			draft.sidebarState.projectId = projectId;
			draft.sidebarState.tabOrder = getPrependTabOrder(topLevelItems);
			draft.sidebarState.sectionId = null;
			draft.sidebarState.isHidden = false;
		});
		return;
	}

	collections.v2WorkspaceLocalState.insert({
		workspaceId,
		createdAt: new Date(),
		sidebarState: {
			projectId,
			tabOrder: getPrependTabOrder(topLevelItems),
			sectionId: null,
			isHidden: false,
		},
		paneLayout: createEmptyPaneLayout(),
	});
}

function getTerminalRuntimeId(pane: Pane<unknown>): string | null {
	if (pane.kind !== "terminal") return null;
	if (!pane.data || typeof pane.data !== "object") return null;
	const data = pane.data as { terminalId?: unknown };
	return typeof data.terminalId === "string" ? data.terminalId : null;
}

function getBrowserRuntimeId(pane: Pane<unknown>): string | null {
	return pane.kind === "browser" ? pane.id : null;
}

function cleanupWorkspacePaneRuntimes(rows: PaneLifecycleRow[]): void {
	for (const terminalId of extractPaneIds(rows, getTerminalRuntimeId)) {
		terminalRuntimeRegistry.release(terminalId);
	}
	for (const browserId of extractPaneIds(rows, getBrowserRuntimeId)) {
		browserRuntimeRegistry.destroy(browserId);
	}
}

export function useDashboardSidebarState() {
	const collections = useCollections();
	const { workspaces: hostWorkspaces } = useHostWorkspaces();
	const { machineId } = useLocalHostService();
	const { v2Workspaces } = useOptimisticActions();

	// Folder membership lives in host-side tags; every membership write is a
	// host call through the optimistic path (cache upsert → workspace.update
	// → invalidate + toast on failure).
	const writeWorkspaceTags = useCallback(
		(workspaceId: string, tags: string[]) => {
			const transaction = v2Workspaces.updateWorkspace(workspaceId, { tags });
			// Resolves once the host accepted the write (rejection already
			// rolled back the cache and toasted); rename gates its rekey on it.
			return transaction?.isPersisted.promise ?? Promise.reject();
		},
		[v2Workspaces],
	);

	/**
	 * Materialize-on-interaction: a derived folder has no stored row, so
	 * color/rename/collapse/reorder mint one first (keyed by the composite
	 * `${projectId}:${tag}` — the tag is recoverable from the key alone).
	 * Returns the row, or null when the id is neither stored nor parseable.
	 */
	const ensureSectionRow = useCallback(
		(sectionId: string) => {
			const existing = collections.v2SidebarSections.get(sectionId);
			if (existing) return existing;
			const parsed = parseSidebarFolderKey(sectionId);
			if (!parsed) return null;
			collections.v2SidebarSections.insert({
				sectionId,
				projectId: parsed.projectId,
				name: parsed.tag,
				tag: parsed.tag,
				createdAt: new Date(),
				tabOrder: getNextTabOrder(
					getProjectTopLevelItems(collections, hostWorkspaces, parsed.projectId),
				),
				isCollapsed: false,
				color: null,
			});
			return collections.v2SidebarSections.get(sectionId) ?? null;
		},
		[collections, hostWorkspaces],
	);

	const ensureProjectInSidebar = useCallback(
		(projectId: string) => {
			ensureSidebarProjectRecord(collections, projectId);
		},
		[collections],
	);

	const ensureWorkspaceInSidebar = useCallback(
		(workspaceId: string, projectId: string | null) => {
			// Sessions (null projectId) have no project placement row — the
			// Sessions section renders unconditionally.
			if (projectId !== null) {
				ensureSidebarProjectRecord(collections, projectId);
			}
			ensureSidebarWorkspaceRecord(
				collections,
				hostWorkspaces,
				workspaceId,
				projectId,
			);
		},
		[collections, hostWorkspaces],
	);

	const toggleProjectCollapsed = useCallback(
		(projectId: string) => {
			const existing = collections.v2SidebarProjects.get(projectId);
			if (!existing) return;
			collections.v2SidebarProjects.update(projectId, (draft) => {
				draft.isCollapsed = !draft.isCollapsed;
			});
		},
		[collections],
	);

	const reorderProjects = useCallback(
		(projectIds: string[]) => {
			projectIds.forEach((projectId, index) => {
				if (!collections.v2SidebarProjects.get(projectId)) return;
				collections.v2SidebarProjects.update(projectId, (draft) => {
					draft.tabOrder = index + 1;
				});
			});
		},
		[collections],
	);

	const reorderWorkspaces = useCallback(
		(workspaceIds: string[]) => {
			workspaceIds.forEach((workspaceId, index) => {
				if (!collections.v2WorkspaceLocalState.get(workspaceId)) return;
				collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
					draft.sidebarState.tabOrder = index + 1;
					draft.sidebarState.isHidden = false;
				});
			});
		},
		[collections],
	);

	const reorderProjectChildren = useCallback(
		(
			projectId: string | null,
			orderedItems: Array<{ type: "workspace" | "section"; id: string }>,
		) => {
			// A workspace item in the lane list is EXPLICITLY top-level. Local
			// sectionId writes alone can't deliver that for a tag-filed row —
			// the tag would keep it in its folder and a drag out of a folder
			// would silently snap back — so strip the project's folder tags on
			// its host too (folder tags only; unrelated tags survive).
			const folderIndex = getProjectFolderIndex(
				collections,
				hostWorkspaces,
				projectId,
			);
			orderedItems.forEach((item, index) => {
				const tabOrder = index + 1;
				if (item.type === "workspace") {
					if (!collections.v2WorkspaceLocalState.get(item.id)) return;
					const currentTags = getHostWorkspaceTags(hostWorkspaces, item.id);
					const strippedTags = applyFolderTagChange(
						currentTags,
						folderIndex.keys(),
						null,
					);
					if (strippedTags.join("\n") !== currentTags.join("\n")) {
						writeWorkspaceTags(item.id, strippedTags);
					}
					collections.v2WorkspaceLocalState.update(item.id, (draft) => {
						draft.sidebarState.tabOrder = tabOrder;
						draft.sidebarState.sectionId = null;
						draft.sidebarState.projectId = projectId;
						draft.sidebarState.isHidden = false;
					});
				} else {
					// Reordering the lane is a customisation: a derived folder in
					// the ordered list materializes its row so the order sticks.
					if (!ensureSectionRow(item.id)) return;
					collections.v2SidebarSections.update(item.id, (draft) => {
						draft.tabOrder = tabOrder;
					});
				}
			});
		},
		[collections, ensureSectionRow, hostWorkspaces, writeWorkspaceTags],
	);

	const moveWorkspaceToSectionAtIndex = useCallback(
		(
			workspaceId: string,
			projectId: string | null,
			sectionId: string,
			index: number,
		) => {
			const existing = collections.v2WorkspaceLocalState.get(workspaceId);
			if (!existing) return;
			// Same rule as moveWorkspaceToSection: the tag comes from the key;
			// members are found through the shared resolver, not the pointer.
			const targetTag = parseSidebarFolderKey(sectionId)?.tag ?? null;
			if (targetTag !== null) {
				const folderIndex = getProjectFolderIndex(
					collections,
					hostWorkspaces,
					projectId,
				);
				writeWorkspaceTags(
					workspaceId,
					applyFolderTagChange(
						getHostWorkspaceTags(hostWorkspaces, workspaceId),
						folderIndex.keys(),
						targetTag,
					),
				);
			}
			const siblings = Array.from(
				collections.v2WorkspaceLocalState.state.values(),
			)
				.filter(
					(item) =>
						item.sidebarState.projectId === projectId &&
						isSidebarWorkspaceVisible(item) &&
						item.workspaceId !== workspaceId &&
						getEffectiveSectionId(collections, hostWorkspaces, item) ===
							sectionId,
				)
				.sort((a, b) => a.sidebarState.tabOrder - b.sidebarState.tabOrder);
			const reordered = [...siblings];
			reordered.splice(index, 0, existing);
			reordered.forEach((item, i) => {
				collections.v2WorkspaceLocalState.update(item.workspaceId, (draft) => {
					draft.sidebarState.tabOrder = i + 1;
					draft.sidebarState.sectionId = targetTag !== null ? null : sectionId;
					draft.sidebarState.projectId = projectId;
					draft.sidebarState.isHidden = false;
				});
			});
		},
		[collections, hostWorkspaces, writeWorkspaceTags],
	);

	const createSection = useCallback(
		(projectId: string, options: { name?: string } = {}) => {
			const { name = "New group" } = options;
			ensureSidebarProjectRecord(collections, projectId);

			// A folder IS a tag: mint one from the name (collisions get -2)
			// and key the presentation row by it.
			const tag = mintFolderTag(
				name,
				getProjectFolderIndex(collections, hostWorkspaces, projectId).keys(),
			);
			const sectionId = buildSidebarFolderKey(projectId, tag);
			if (collections.v2SidebarSections.get(sectionId)) return sectionId;
			const randomColor =
				PROJECT_CUSTOM_COLORS[
					Math.floor(Math.random() * PROJECT_CUSTOM_COLORS.length)
				].value;

			const tabOrder = getNextTabOrder(
				getProjectTopLevelItems(collections, hostWorkspaces, projectId),
			);

			collections.v2SidebarSections.insert({
				sectionId,
				projectId,
				name,
				createdAt: new Date(),
				tabOrder,
				isCollapsed: false,
				color: randomColor,
				tag,
			});

			return sectionId;
		},
		[collections, hostWorkspaces],
	);

	const toggleSectionCollapsed = useCallback(
		(sectionId: string) => {
			if (!ensureSectionRow(sectionId)) return;
			collections.v2SidebarSections.update(sectionId, (draft) => {
				draft.isCollapsed = !draft.isCollapsed;
			});
		},
		[collections, ensureSectionRow],
	);

	const renameSection = useCallback(
		(sectionId: string, name: string) => {
			const trimmed = name.trim();
			if (!trimmed) return;
			const existing = collections.v2SidebarSections.get(sectionId);
			const parsed = parseSidebarFolderKey(sectionId);
			const currentTag = normalizeWorkspaceTag(existing?.tag) ?? parsed?.tag ?? null;
			if (currentTag === null) {
				// Unconverted legacy row: label-only rename; the migration pass
				// converts it (with this name) once its host is reachable.
				if (!existing) return;
				collections.v2SidebarSections.update(sectionId, (draft) => {
					draft.name = trimmed;
				});
				return;
			}
			const projectId = existing?.projectId ?? parsed?.projectId;
			if (!projectId) return;
			const takenTags = [
				...getProjectFolderIndex(collections, hostWorkspaces, projectId).keys(),
			].filter((tag) => tag !== currentTag);
			const newTag = mintFolderTag(trimmed, takenTags);
			if (newTag === currentTag) {
				// Same tag — label-only change on the (materialized) row.
				if (!ensureSectionRow(sectionId)) return;
				collections.v2SidebarSections.update(sectionId, (draft) => {
					draft.name = trimmed;
				});
				return;
			}
			// Retag every member BEFORE rekeying the row — swap the row first
			// and the old tag survives on every member as litter that silently
			// recaptures them if a folder by that name is ever recreated. The
			// rekey waits for the hosts to ACCEPT the retags: a rejected write
			// rolls back that member's cached tags, and rekeying anyway would
			// leave it in neither folder.
			const memberWrites: Promise<unknown>[] = [];
			for (const workspace of hostWorkspaces) {
				if (workspace.projectId !== projectId) continue;
				const tags = normalizeWorkspaceTags(workspace.tags);
				if (!tags.includes(currentTag)) continue;
				memberWrites.push(
					writeWorkspaceTags(
						workspace.id,
						normalizeWorkspaceTags([
							...tags.filter((tag) => tag !== currentTag),
							newTag,
						]),
					),
				);
			}
			void Promise.all(memberWrites)
				.then(() => {
					const newSectionId = buildSidebarFolderKey(projectId, newTag);
					if (!collections.v2SidebarSections.get(newSectionId)) {
						collections.v2SidebarSections.insert({
							sectionId: newSectionId,
							projectId,
							name: trimmed,
							tag: newTag,
							createdAt: existing?.createdAt ?? new Date(),
							tabOrder:
								existing?.tabOrder ??
								getNextTabOrder(
									getProjectTopLevelItems(
										collections,
										hostWorkspaces,
										projectId,
									),
								),
							isCollapsed: existing?.isCollapsed ?? false,
							color: existing?.color ?? null,
						});
					}
					if (existing) collections.v2SidebarSections.delete(sectionId);
				})
				.catch(() => {
					// A member write was rejected (already rolled back + toasted).
					// The row keeps its old key; successfully retagged members sit
					// in the new tag's derived folder until the user retries.
				});
		},
		[collections, ensureSectionRow, hostWorkspaces, writeWorkspaceTags],
	);

	const setSectionColor = useCallback(
		(sectionId: string, color: string | null) => {
			if (!ensureSectionRow(sectionId)) return;
			collections.v2SidebarSections.update(sectionId, (draft) => {
				draft.color = color;
			});
		},
		[collections, ensureSectionRow],
	);

	const moveWorkspaceToSection = useCallback(
		(
			workspaceId: string,
			projectId: string | null,
			sectionId: string | null,
		) => {
			const existing = collections.v2WorkspaceLocalState.get(workspaceId);
			if (!existing) return;
			const folderIndex = getProjectFolderIndex(
				collections,
				hostWorkspaces,
				projectId,
			);
			const currentTags = getHostWorkspaceTags(hostWorkspaces, workspaceId);

			if (sectionId === null) {
				// The DERIVED container decides the no-op, not the raw local
				// pointer: a tag-filed member has sectionId null already, and
				// checking that field made "Ungroup" a guaranteed no-op.
				const effectiveSectionId = getEffectiveSectionId(
					collections,
					hostWorkspaces,
					existing,
				);
				const sameProject = existing.sidebarState.projectId === projectId;
				if (
					effectiveSectionId === null &&
					sameProject &&
					isSidebarWorkspaceVisible(existing)
				) {
					return;
				}
				// Strip only the project's folder tags — an agent's unrelated
				// tag survives the ungroup.
				const strippedTags = applyFolderTagChange(
					currentTags,
					folderIndex.keys(),
					null,
				);
				if (strippedTags.join("\n") !== currentTags.join("\n")) {
					writeWorkspaceTags(workspaceId, strippedTags);
				}
				const topLevelItems = getProjectTopLevelItems(
					collections,
					hostWorkspaces,
					projectId,
					{ excludeWorkspaceId: workspaceId },
				);
				// Groups interleave with ungrouped rows, so "before the first
				// section" can be far from the row's group. Keep the row in
				// place: land it directly below its former group.
				const sectionIndex = sameProject
					? topLevelItems.findIndex(
							(item) =>
								item.type === "section" && item.id === effectiveSectionId,
						)
					: -1;
				const insertIndex =
					sectionIndex === -1
						? getFirstSectionIndex(topLevelItems)
						: sectionIndex + 1;
				topLevelItems.splice(insertIndex, 0, {
					type: "workspace",
					id: workspaceId,
					tabOrder: 0,
				});
				writeProjectTopLevelOrder(collections, projectId, topLevelItems);
				return;
			}

			// A move into a tag-backed folder reads the tag from the KEY — a
			// missing row means "derived", never "legacy" (treating it as
			// legacy would write a sectionId pointing at nothing).
			const targetTag = parseSidebarFolderKey(sectionId)?.tag ?? null;

			const siblingRows = Array.from(
				collections.v2WorkspaceLocalState.state.values(),
			)
				.filter(
					(item) =>
						item.sidebarState.projectId === projectId &&
						isSidebarWorkspaceVisible(item) &&
						item.workspaceId !== workspaceId &&
						getEffectiveSectionId(collections, hostWorkspaces, item) ===
							sectionId,
				)
				.map((item) => ({ tabOrder: item.sidebarState.tabOrder }));

			if (targetTag !== null) {
				writeWorkspaceTags(
					workspaceId,
					applyFolderTagChange(currentTags, folderIndex.keys(), targetTag),
				);
			}
			collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
				draft.sidebarState.projectId = projectId;
				// Tag-backed membership lives in the tags; a pointer at the
				// folder would only go stale. Legacy (unconverted) targets keep
				// the pointer until the migration converts them.
				draft.sidebarState.sectionId = targetTag !== null ? null : sectionId;
				draft.sidebarState.tabOrder = getNextTabOrder(siblingRows);
				draft.sidebarState.isHidden = false;
			});
		},
		[collections, hostWorkspaces, writeWorkspaceTags],
	);

	const deleteSection = useCallback(
		(sectionId: string) => {
			const section = collections.v2SidebarSections.get(sectionId);
			const parsed = parseSidebarFolderKey(sectionId);
			// A derived folder has no row but is still deletable — deleting it
			// means untagging its members.
			if (!section && !parsed) return;
			const projectId = section?.projectId ?? parsed?.projectId;
			if (!projectId) return;
			const folderTag = normalizeWorkspaceTag(section?.tag) ?? parsed?.tag ?? null;

			// Groups interleave with ungrouped rows, so replace the deleted
			// section's own slot with its members instead of dumping them
			// "before the first section" (which may be far away).
			const withSection = getProjectTopLevelItems(
				collections,
				hostWorkspaces,
				projectId,
			);
			const sectionIndex = withSection.findIndex(
				(item) => item.type === "section" && item.id === sectionId,
			);
			const topLevelItems = withSection.filter(
				(item) => !(item.type === "section" && item.id === sectionId),
			);
			// Members come from the shared resolver — matching only rows whose
			// raw sectionId pointer equals the deleted id stranded every
			// tag-derived member.
			const sectionWorkspaces = Array.from(
				collections.v2WorkspaceLocalState.state.values(),
			)
				.filter(
					(item) =>
						item.sidebarState.projectId === projectId &&
						isSidebarWorkspaceVisible(item) &&
						getEffectiveSectionId(collections, hostWorkspaces, item) ===
							sectionId,
				)
				.sort(
					(left, right) =>
						left.sidebarState.tabOrder - right.sidebarState.tabOrder,
				);

			const insertIndex =
				sectionIndex === -1
					? getFirstSectionIndex(topLevelItems)
					: sectionIndex;
			topLevelItems.splice(
				insertIndex,
				0,
				...sectionWorkspaces.map((workspace) => ({
					type: "workspace" as const,
					id: workspace.workspaceId,
					tabOrder: 0,
				})),
			);
			writeProjectTopLevelOrder(collections, projectId, topLevelItems);

			// Untag every member on its host — the folder is the tag, so this
			// is what actually deletes it. Members that carry the tag without a
			// local row (filed from another machine) get untagged too.
			if (folderTag !== null) {
				for (const workspace of hostWorkspaces) {
					if (workspace.projectId !== projectId) continue;
					const tags = normalizeWorkspaceTags(workspace.tags);
					if (!tags.includes(folderTag)) continue;
					writeWorkspaceTags(
						workspace.id,
						tags.filter((tag) => tag !== folderTag),
					);
				}
			}

			if (section) collections.v2SidebarSections.delete(sectionId);
		},
		[collections, hostWorkspaces, writeWorkspaceTags],
	);

	const setWorkspacePinned = useCallback(
		(workspaceId: string, projectId: string | null, pinned: boolean) => {
			const existing = collections.v2WorkspaceLocalState.get(workspaceId);
			if (!existing) {
				if (!pinned) return;
				// Auto-included local main workspaces have no local-state row yet;
				// pinning is an explicit placement, so create one first. Sessions
				// (null projectId) have no project placement row.
				if (projectId !== null) {
					ensureSidebarProjectRecord(collections, projectId);
				}
				ensureSidebarWorkspaceRecord(
					collections,
					hostWorkspaces,
					workspaceId,
					projectId,
				);
			}
			// Strictly greater than every existing pin so same-millisecond pins
			// still order by pin sequence instead of collection iteration order.
			const maxPinnedAt = Array.from(
				collections.v2WorkspaceLocalState.state.values(),
			).reduce((max, row) => Math.max(max, row.sidebarState.pinnedAt ?? 0), 0);
			collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
				if (pinned) {
					// Keep the original pin time on repeat pins so the row doesn't
					// jump to the bottom of the Pinned section.
					draft.sidebarState.pinnedAt ??= Math.max(Date.now(), maxPinnedAt + 1);
					draft.sidebarState.isHidden = false;
				} else {
					// Only clear the pin — projectId/sectionId/tabOrder stay
					// untouched so the row returns to its previous spot.
					draft.sidebarState.pinnedAt = null;
				}
			});
		},
		[collections, hostWorkspaces],
	);

	const reorderPinnedWorkspaces = useCallback(
		(
			orderedPins: Array<{ workspaceId: string; projectId: string | null }>,
			options: { allowNewWorkspaceId?: string } = {},
		) => {
			// Safety net: a single drop may pin at most ONE new workspace (the
			// dragged one). Anything else not already pinned is dropped here so a
			// corrupted caller list can never mass-pin rows.
			const eligiblePins = orderedPins.filter(
				({ workspaceId }) =>
					workspaceId === options.allowNewWorkspaceId ||
					collections.v2WorkspaceLocalState.get(workspaceId)?.sidebarState
						.pinnedAt != null,
			);
			// Rewrite pinnedAt as a strictly-ascending sequence anchored at the
			// smallest existing pin time, so the sequence stays below Date.now()
			// and future pins (which use max(now, max+1)) still append last.
			const existingPinnedAts = eligiblePins.flatMap(({ workspaceId }) => {
				const pinnedAt =
					collections.v2WorkspaceLocalState.get(workspaceId)?.sidebarState
						.pinnedAt;
				return pinnedAt != null ? [pinnedAt] : [];
			});
			const base =
				existingPinnedAts.length > 0
					? Math.min(...existingPinnedAts)
					: Date.now();
			eligiblePins.forEach(({ workspaceId, projectId }, index) => {
				if (!collections.v2WorkspaceLocalState.get(workspaceId)) {
					if (projectId !== null) {
						ensureSidebarProjectRecord(collections, projectId);
					}
					ensureSidebarWorkspaceRecord(
						collections,
						hostWorkspaces,
						workspaceId,
						projectId,
					);
				}
				collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
					draft.sidebarState.pinnedAt = base + index;
					draft.sidebarState.isHidden = false;
				});
			});
		},
		[collections, hostWorkspaces],
	);

	const removeWorkspaceFromSidebar = useCallback(
		(workspaceId: string) => {
			const workspace = collections.v2WorkspaceLocalState.get(workspaceId);
			if (!workspace) return;
			cleanupWorkspacePaneRuntimes([workspace]);
			collections.v2WorkspaceLocalState.delete(workspaceId);
		},
		[collections],
	);

	const hideWorkspaceInSidebar = useCallback(
		(workspaceId: string, projectId: string | null) => {
			tombstoneSidebarWorkspaceRecord(
				collections,
				workspaceId,
				projectId,
				cleanupWorkspacePaneRuntimes,
			);
		},
		[collections],
	);

	const removeProjectFromSidebar = useCallback(
		(projectId: string) => {
			removeProjectFromSidebarState(
				collections,
				hostWorkspaces,
				projectId,
				machineId,
				cleanupWorkspacePaneRuntimes,
			);
		},
		[collections, hostWorkspaces, machineId],
	);

	return {
		createSection,
		deleteSection,
		ensureProjectInSidebar,
		ensureWorkspaceInSidebar,
		hideWorkspaceInSidebar,
		moveWorkspaceToSection,
		moveWorkspaceToSectionAtIndex,
		removeProjectFromSidebar,
		reorderPinnedWorkspaces,
		reorderProjectChildren,
		removeWorkspaceFromSidebar,
		reorderProjects,
		reorderWorkspaces,
		renameSection,
		setSectionColor,
		setWorkspacePinned,
		toggleProjectCollapsed,
		toggleSectionCollapsed,
	};
}
