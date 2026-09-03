import type { Pane } from "@superset/panes";
import {
	normalizeWorkspaceTag,
	normalizeWorkspaceTags,
	SESSIONS_TAG_SCOPE,
	tagFolderScope,
} from "@superset/shared/workspace-tags";
import { useCallback } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { authClient } from "renderer/lib/auth-client";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { isMissingProcedureError } from "renderer/lib/isMissingProcedureError";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import { browserRuntimeRegistry } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/BrowserPane/browserRuntimeRegistry";
import {
	extractPaneIds,
	type PaneLifecycleRow,
} from "renderer/routes/_authenticated/components/utils/paneLifecycleRows";
import { useOptimisticActions } from "renderer/routes/_authenticated/hooks/useOptimisticActions";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import {
	getNextTabOrder,
	getPrependTabOrder,
	isSidebarWorkspaceVisible,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	applyFolderTagChange,
	buildSidebarFolderKey,
	deriveTagFolders,
	getProjectFolderTagIndex,
	laneProjectIdForScope,
	mintFolderTag,
	parseSidebarFolderKey,
	resolveWorkspaceSectionId,
	type TagFolderContext,
	type TagFolderRef,
	type TagFolderWorkspaceInput,
	useTagFolderContext,
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
	tagFolderContext: TagFolderContext,
	// Null scopes to the Sessions section (project-less workspaces).
	projectId: string | null,
	options: { excludeWorkspaceId?: string; excludeSectionId?: string } = {},
): ProjectTopLevelItem[] {
	const scope = tagFolderScope(projectId);
	const folderIndex = getProjectFolderTagIndex(
		deriveTagFolders(
			Array.from(collections.v2SidebarSections.state.values()),
			hostWorkspaces,
			tagFolderContext,
		),
		scope,
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
					item.projectId === scope &&
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
	tagFolderContext: TagFolderContext,
	projectId: string | null,
): ReadonlyMap<string, TagFolderRef> {
	return getProjectFolderTagIndex(
		deriveTagFolders(
			Array.from(collections.v2SidebarSections.state.values()),
			hostWorkspaces,
			tagFolderContext,
		),
		tagFolderScope(projectId),
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
	tagFolderContext: TagFolderContext,
	row: {
		workspaceId: string;
		sidebarState: { projectId: string | null; sectionId: string | null };
	},
): string | null {
	return resolveWorkspaceSectionId({
		tags: getHostWorkspaceTags(hostWorkspaces, row.workspaceId),
		localSectionId: row.sidebarState.sectionId,
		index: getProjectFolderIndex(
			collections,
			hostWorkspaces,
			tagFolderContext,
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
	tagFolderContext: TagFolderContext,
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
		tagFolderContext,
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
	const { workspaces: hostWorkspaces, cache: hostWorkspacesCache } =
		useHostWorkspaces();
	const { activeHostUrl, machineId } = useLocalHostService();
	const { data: session } = authClient.useSession();
	const currentUserId = session?.user.id ?? null;
	const { v2Workspaces } = useOptimisticActions();
	const tagFolderContext = useTagFolderContext();

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

	// Folder presentation (label, color) is host-owned beside its workspaces.
	// Projects can have a row on multiple serving hosts, so project writes fan
	// out; the Sessions scope stays on the active host.
	const { projects: hostProjects } = useHostProjects();
	/**
	 * Hosts to write a folder's presentation to. A project's folders go to
	 * every host serving that project; the Sessions lane has no project, so
	 * its folders live on the active host alongside the sessions themselves.
	 */
	const resolveTagFolderHostUrls = useCallback(
		(scope: string): string[] => {
			if (scope === SESSIONS_TAG_SCOPE) {
				return activeHostUrl ? [activeHostUrl] : [];
			}
			const project = hostProjects.find((item) => item.projectKey === scope);
			return (project?.hostIds ?? [])
				.map((hostId) => hostWorkspacesCache.resolveHostUrl(hostId))
				.filter((url): url is string => url != null);
		},
		[activeHostUrl, hostProjects, hostWorkspacesCache],
	);
	const writeTagSetting = useCallback(
		(
			scope: string,
			tag: string,
			patch: {
				displayName?: string | null;
				color?: string | null;
			},
		) => {
			for (const url of resolveTagFolderHostUrls(scope)) {
				const client = getHostServiceClientByUrl(url);
				void client.tagFolders.upsert
					.mutate({ scope, tag, ...patch })
					.catch((error: unknown) => {
						if (
							scope !== SESSIONS_TAG_SCOPE &&
							isMissingProcedureError(error)
						) {
							return client.project.setTagSetting.mutate({
								projectId: scope,
								tag,
								...patch,
							});
						}
						throw error;
					})
					.catch((error: unknown) => {
						console.warn(
							`[sidebar] tag setting write failed on host ${url}:`,
							error,
						);
					});
			}
		},
		[resolveTagFolderHostUrls],
	);
	const removeTagSetting = useCallback(
		(scope: string, tag: string) => {
			for (const url of resolveTagFolderHostUrls(scope)) {
				const client = getHostServiceClientByUrl(url);
				void client.tagFolders.delete
					.mutate({ scope, tag })
					.catch((error: unknown) => {
						if (
							scope !== SESSIONS_TAG_SCOPE &&
							isMissingProcedureError(error)
						) {
							return client.project.deleteTagSetting.mutate({
								projectId: scope,
								tag,
							});
						}
						throw error;
					})
					.catch((error: unknown) => {
						console.warn(
							`[sidebar] tag setting delete failed on host ${url}:`,
							error,
						);
					});
			}
		},
		[resolveTagFolderHostUrls],
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
					getProjectTopLevelItems(
						collections,
						hostWorkspaces,
						tagFolderContext,
						laneProjectIdForScope(parsed.projectId),
					),
				),
				isCollapsed: false,
				color: null,
			});
			return collections.v2SidebarSections.get(sectionId) ?? null;
		},
		[collections, hostWorkspaces, tagFolderContext],
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
				tagFolderContext,
				workspaceId,
				projectId,
			);
		},
		[collections, hostWorkspaces, tagFolderContext],
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
				tagFolderContext,
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
		[
			collections,
			ensureSectionRow,
			hostWorkspaces,
			tagFolderContext,
			writeWorkspaceTags,
		],
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
					tagFolderContext,
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
						getEffectiveSectionId(
							collections,
							hostWorkspaces,
							tagFolderContext,
							item,
						) === sectionId,
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
		[collections, hostWorkspaces, tagFolderContext, writeWorkspaceTags],
	);

	const createSection = useCallback(
		(projectId: string, options: { name?: string } = {}) => {
			const { name = "New group" } = options;
			ensureSidebarProjectRecord(collections, projectId);

			// A folder IS a tag: mint one from the name (collisions get -2)
			// and key the presentation row by it.
			const tag = mintFolderTag(
				name,
				getProjectFolderIndex(
					collections,
					hostWorkspaces,
					tagFolderContext,
					projectId,
				).keys(),
			);
			const sectionId = buildSidebarFolderKey(projectId, tag);
			if (collections.v2SidebarSections.get(sectionId)) return sectionId;
			const randomColor =
				PROJECT_CUSTOM_COLORS[
					Math.floor(Math.random() * PROJECT_CUSTOM_COLORS.length)
				].value;

			const tabOrder = getNextTabOrder(
				getProjectTopLevelItems(
					collections,
					hostWorkspaces,
					tagFolderContext,
					projectId,
				),
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
			// Seed presentation beside the host-owned membership tags.
			writeTagSetting(projectId, tag, {
				displayName: name,
				color: randomColor,
			});

			return sectionId;
		},
		[collections, hostWorkspaces, tagFolderContext, writeTagSetting],
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
			const currentTag =
				normalizeWorkspaceTag(existing?.tag) ?? parsed?.tag ?? null;
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
			// One row on the host: the tag stays the stable slug agents target,
			// the display name is what the sidebar shows — no member retagging,
			// nothing to half-land on a flaky host.
			writeTagSetting(projectId, currentTag, { displayName: trimmed });
		},
		[collections, writeTagSetting],
	);

	const setSectionColor = useCallback(
		(sectionId: string, color: string | null) => {
			const existing = collections.v2SidebarSections.get(sectionId);
			const parsed = parseSidebarFolderKey(sectionId);
			const tag = normalizeWorkspaceTag(existing?.tag) ?? parsed?.tag ?? null;
			const projectId = existing?.projectId ?? parsed?.projectId;
			if (tag !== null && projectId) {
				// Host-side beside the folder's membership tags.
				writeTagSetting(projectId, tag, { color });
				return;
			}
			if (!ensureSectionRow(sectionId)) return;
			collections.v2SidebarSections.update(sectionId, (draft) => {
				draft.color = color;
			});
		},
		[collections, ensureSectionRow, writeTagSetting],
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
				tagFolderContext,
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
					tagFolderContext,
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
					tagFolderContext,
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
						getEffectiveSectionId(
							collections,
							hostWorkspaces,
							tagFolderContext,
							item,
						) === sectionId,
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
		[collections, hostWorkspaces, tagFolderContext, writeWorkspaceTags],
	);

	const deleteSection = useCallback(
		(sectionId: string) => {
			const section = collections.v2SidebarSections.get(sectionId);
			const parsed = parseSidebarFolderKey(sectionId);
			// A derived folder has no row but is still deletable — deleting it
			// means untagging its members.
			if (!section && !parsed) return;
			// `scope` keys the folder (project id, or the Sessions tag scope);
			// `projectId` is what the lane's workspace rows carry (null for
			// sessions).
			const scope = section?.projectId ?? parsed?.projectId;
			if (!scope) return;
			const projectId = laneProjectIdForScope(scope);
			const folderTag =
				normalizeWorkspaceTag(section?.tag) ?? parsed?.tag ?? null;

			// Groups interleave with ungrouped rows, so replace the deleted
			// section's own slot with its members instead of dumping them
			// "before the first section" (which may be far away).
			const withSection = getProjectTopLevelItems(
				collections,
				hostWorkspaces,
				tagFolderContext,
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
						getEffectiveSectionId(
							collections,
							hostWorkspaces,
							tagFolderContext,
							item,
						) === sectionId,
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

			if (folderTag !== null) removeTagSetting(scope, folderTag);
			if (section) collections.v2SidebarSections.delete(sectionId);
		},
		[
			collections,
			hostWorkspaces,
			removeTagSetting,
			tagFolderContext,
			writeWorkspaceTags,
		],
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
					tagFolderContext,
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
		[collections, hostWorkspaces, tagFolderContext],
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
						tagFolderContext,
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
		[collections, hostWorkspaces, tagFolderContext],
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
				{ machineId, currentUserId },
				cleanupWorkspacePaneRuntimes,
			);
		},
		[collections, hostWorkspaces, machineId, currentUserId],
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
