import type { Pane } from "@superset/panes";
import { toast } from "@superset/ui/sonner";
import { useCallback, useMemo } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
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
	isSidebarWorkspaceVisible,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { PROJECT_CUSTOM_COLORS } from "shared/constants/project-colors";
import {
	getProjectTopLevelItems,
	groupPlanByHost,
	type PlannerData,
	planSectionMembersOrder,
	planTopLevelOrder,
	planUngroupWorkspaces,
	type SectionWritePlan,
} from "./sectionHostMutations";
import {
	createEmptyPaneLayout,
	removeProjectFromSidebarState,
	tombstoneSidebarWorkspaceRecord,
} from "./sidebarMutations";

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
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
		tabOrder: getNextTabOrder([
			...collections.v2SidebarProjects.state.values(),
		]),
		isCollapsed: false,
	});
}

function ensureSidebarWorkspaceRecord(
	collections: Pick<AppCollections, "v2WorkspaceLocalState">,
	workspaceId: string,
	projectId: string,
): void {
	const existing = collections.v2WorkspaceLocalState.get(workspaceId);
	if (existing && isSidebarWorkspaceVisible(existing)) {
		return;
	}

	if (existing) {
		collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
			draft.sidebarState.projectId = projectId;
			draft.sidebarState.isHidden = false;
		});
		return;
	}

	collections.v2WorkspaceLocalState.insert({
		workspaceId,
		createdAt: new Date(),
		sidebarState: {
			projectId,
			tabOrder: 0,
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
	const {
		workspaces: hostWorkspaces,
		sections: hostSections,
		cache: hostWorkspacesCache,
		sectionsCache,
	} = useHostWorkspaces();
	const { machineId, activeHostUrl } = useLocalHostService();

	const plannerData = useMemo<PlannerData>(
		() => ({
			workspaces: hostWorkspaces.map((workspace) => ({
				id: workspace.id,
				projectId: workspace.projectId,
				hostId: workspace.hostId,
				sectionId: workspace.sectionId ?? null,
				tabOrder: workspace.tabOrder ?? 0,
			})),
			sections: hostSections.map((section) => ({
				id: section.id,
				projectId: section.projectId,
				hostId: section.hostId,
				tabOrder: section.tabOrder,
			})),
		}),
		[hostWorkspaces, hostSections],
	);

	const hostWorkspacesById = useMemo(
		() => new Map(hostWorkspaces.map((workspace) => [workspace.id, workspace])),
		[hostWorkspaces],
	);
	const hostSectionsById = useMemo(
		() => new Map(hostSections.map((section) => [section.id, section])),
		[hostSections],
	);

	// Optimistically patch a workspace row's placement into the local cache.
	const patchWorkspacePlacement = useCallback(
		(write: {
			workspaceId: string;
			sectionId: string | null;
			tabOrder: number;
		}) => {
			const workspace = hostWorkspacesById.get(write.workspaceId);
			if (!workspace) return;
			hostWorkspacesCache.upsertWorkspace({
				...workspace,
				worktreePath: workspace.worktreePath ?? "",
				worktreeExists: workspace.worktreeExists ?? true,
				sectionId: write.sectionId,
				tabOrder: write.tabOrder,
			});
		},
		[hostWorkspacesById, hostWorkspacesCache],
	);

	// Restore a host's rows to their pre-optimistic values — its query is
	// disabled while offline, so invalidate can't refetch to undo the patch.
	const rollbackHostPlan = useCallback(
		(hostPlan: SectionWritePlan) => {
			for (const write of hostPlan.workspaceWrites) {
				const original = hostWorkspacesById.get(write.workspaceId);
				if (!original) continue;
				hostWorkspacesCache.upsertWorkspace({
					...original,
					worktreePath: original.worktreePath ?? "",
					worktreeExists: original.worktreeExists ?? true,
					sectionId: original.sectionId ?? null,
					tabOrder: original.tabOrder ?? 0,
				});
			}
			for (const write of hostPlan.sectionWrites) {
				const original = hostSectionsById.get(write.sectionId);
				if (!original) continue;
				sectionsCache.upsertSection(original);
			}
		},
		[hostSectionsById, hostWorkspacesById, hostWorkspacesCache, sectionsCache],
	);

	// Optimistic cache patches first, then per-host tRPC writes; host
	// broadcasts converge the caches, failures invalidate + toast.
	const executePlan = useCallback(
		(plan: SectionWritePlan) => {
			for (const write of plan.workspaceWrites) {
				patchWorkspacePlacement(write);
			}
			for (const write of plan.sectionWrites) {
				const section = hostSectionsById.get(write.sectionId);
				if (!section) continue;
				sectionsCache.upsertSection({ ...section, tabOrder: write.tabOrder });
			}

			for (const [hostId, hostPlan] of groupPlanByHost(plan)) {
				const hostUrl = hostWorkspacesCache.resolveHostUrl(hostId);
				if (!hostUrl) {
					toast.error(
						"A host is offline — sidebar changes there couldn't be saved",
					);
					rollbackHostPlan(hostPlan);
					hostWorkspacesCache.invalidateHost(hostId);
					sectionsCache.invalidateHost(hostId);
					continue;
				}
				const client = getHostServiceClientByUrl(hostUrl);
				// One transactional write per host.
				void client.sections.reorderLane
					.mutate({
						sections: hostPlan.sectionWrites.map((write) => ({
							id: write.sectionId,
							tabOrder: write.tabOrder,
						})),
						workspaces: hostPlan.workspaceWrites.map((write) => ({
							workspaceId: write.workspaceId,
							sectionId: write.sectionId,
							tabOrder: write.tabOrder,
						})),
					})
					.catch((error: unknown) => {
						hostWorkspacesCache.invalidateHost(hostId);
						sectionsCache.invalidateHost(hostId);
						toast.error("Failed to update sidebar", {
							description: getErrorMessage(error),
						});
					});
			}
		},
		[
			patchWorkspacePlacement,
			rollbackHostPlan,
			hostSectionsById,
			hostWorkspacesCache,
			sectionsCache,
		],
	);

	const ensureProjectInSidebar = useCallback(
		(projectId: string) => {
			ensureSidebarProjectRecord(collections, projectId);
		},
		[collections],
	);

	const ensureWorkspaceInSidebar = useCallback(
		(workspaceId: string, projectId: string) => {
			ensureSidebarProjectRecord(collections, projectId);
			ensureSidebarWorkspaceRecord(collections, workspaceId, projectId);
		},
		[collections],
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

	const reorderProjectChildren = useCallback(
		(orderedItems: Array<{ type: "workspace" | "section"; id: string }>) => {
			executePlan(planTopLevelOrder(plannerData, orderedItems));
		},
		[executePlan, plannerData],
	);

	const moveWorkspaceToSectionAtIndex = useCallback(
		(workspaceId: string, sectionId: string, index: number) => {
			if (!hostWorkspacesById.get(workspaceId)) return;
			const siblings = plannerData.workspaces
				.filter(
					(workspace) =>
						workspace.sectionId === sectionId && workspace.id !== workspaceId,
				)
				.sort((left, right) => left.tabOrder - right.tabOrder)
				.map((workspace) => workspace.id);
			siblings.splice(index, 0, workspaceId);
			executePlan(planSectionMembersOrder(plannerData, sectionId, siblings));
		},
		[executePlan, hostWorkspacesById, plannerData],
	);

	// Persist a section's full member order in one plan. Callers pass the
	// complete ordered id list.
	const reorderSectionMembers = useCallback(
		(sectionId: string, orderedWorkspaceIds: string[]) => {
			executePlan(
				planSectionMembersOrder(plannerData, sectionId, orderedWorkspaceIds),
			);
		},
		[executePlan, plannerData],
	);

	// Created on the local host. Returns the id synchronously (for inline
	// rename) plus `created`, the in-flight write — chained moves must await it.
	const createSection = useCallback(
		(
			projectId: string,
			options: { name?: string } = {},
		): { sectionId: string; created: Promise<unknown> } | null => {
			const { name = "New group" } = options;
			ensureSidebarProjectRecord(collections, projectId);

			if (!machineId || !activeHostUrl) {
				toast.error("The local host is unavailable — try again shortly");
				return null;
			}

			const sectionId = crypto.randomUUID();
			const color =
				PROJECT_CUSTOM_COLORS[
					Math.floor(Math.random() * PROJECT_CUSTOM_COLORS.length)
				].value;
			const tabOrder = getNextTabOrder(
				getProjectTopLevelItems(plannerData, projectId),
			);

			sectionsCache.upsertSection({
				id: sectionId,
				hostId: machineId,
				projectId,
				name,
				color,
				tabOrder,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
			const created = getHostServiceClientByUrl(
				activeHostUrl,
			).sections.create.mutate({
				id: sectionId,
				projectId,
				name,
				color,
				tabOrder,
			});
			// Handle rejection for callers that don't await `created` (no
			// unhandled rejection); the promise stays rejectable for those that do.
			created.catch((error: unknown) => {
				sectionsCache.invalidateHost(machineId);
				toast.error("Failed to create group", {
					description: getErrorMessage(error),
				});
			});

			return { sectionId, created };
		},
		[activeHostUrl, collections, machineId, plannerData, sectionsCache],
	);

	const toggleSectionCollapsed = useCallback(
		(sectionId: string) => {
			const existing = collections.v2SectionUiState.get(sectionId);
			if (existing) {
				collections.v2SectionUiState.update(sectionId, (draft) => {
					draft.isCollapsed = !draft.isCollapsed;
				});
				return;
			}
			collections.v2SectionUiState.insert({ sectionId, isCollapsed: true });
		},
		[collections],
	);

	const updateSectionOnHost = useCallback(
		(
			sectionId: string,
			patch: { name?: string; color?: string | null },
			errorMessage: string,
		) => {
			const section = hostSectionsById.get(sectionId);
			if (!section) return;
			const hostUrl = hostWorkspacesCache.resolveHostUrl(section.hostId);
			if (!hostUrl) {
				toast.error(
					"The group's host is offline — try again when it reconnects",
				);
				return;
			}
			sectionsCache.upsertSection({
				...section,
				...(patch.name !== undefined ? { name: patch.name } : {}),
				...(patch.color !== undefined ? { color: patch.color } : {}),
				updatedAt: Date.now(),
			});
			getHostServiceClientByUrl(hostUrl)
				.sections.update.mutate({ id: sectionId, ...patch })
				.catch((error: unknown) => {
					sectionsCache.invalidateHost(section.hostId);
					toast.error(errorMessage, { description: getErrorMessage(error) });
				});
		},
		[hostSectionsById, hostWorkspacesCache, sectionsCache],
	);

	const renameSection = useCallback(
		(sectionId: string, name: string) => {
			const trimmed = name.trim();
			if (!trimmed) return;
			updateSectionOnHost(
				sectionId,
				{ name: trimmed },
				"Failed to rename group",
			);
		},
		[updateSectionOnHost],
	);

	const setSectionColor = useCallback(
		(sectionId: string, color: string | null) => {
			updateSectionOnHost(sectionId, { color }, "Failed to recolor group");
		},
		[updateSectionOnHost],
	);

	const moveWorkspaceToSection = useCallback(
		(workspaceId: string, projectId: string, sectionId: string | null) => {
			const workspace = hostWorkspacesById.get(workspaceId);
			if (!workspace) return;

			if (sectionId === null) {
				executePlan(
					planUngroupWorkspaces(plannerData, projectId, [workspaceId]),
				);
				return;
			}

			const siblings = plannerData.workspaces.filter(
				(candidate) =>
					candidate.sectionId === sectionId && candidate.id !== workspaceId,
			);
			executePlan({
				sectionWrites: [],
				workspaceWrites: [
					{
						hostId: workspace.hostId,
						workspaceId,
						sectionId,
						tabOrder: getNextTabOrder(siblings),
					},
				],
			});
		},
		[executePlan, hostWorkspacesById, plannerData],
	);

	const deleteSection = useCallback(
		(sectionId: string) => {
			const section = hostSectionsById.get(sectionId);
			if (!section) return;

			const memberIds = plannerData.workspaces
				.filter((workspace) => workspace.sectionId === sectionId)
				.sort((left, right) => left.tabOrder - right.tabOrder)
				.map((workspace) => workspace.id);

			// The owning host un-groups its own members inside sections.delete;
			// only members on other hosts need explicit ungroup writes.
			const plan = planUngroupWorkspaces(
				plannerData,
				section.projectId,
				memberIds,
				{
					excludeSectionId: sectionId,
				},
			);
			const crossHostPlan: SectionWritePlan = {
				sectionWrites: plan.sectionWrites.filter(
					(write) => write.sectionId !== sectionId,
				),
				workspaceWrites: plan.workspaceWrites.filter(
					(write) => write.hostId !== section.hostId,
				),
			};

			// Preflight the owner before touching caches or ungrouping members
			// elsewhere, else an offline owner detaches members on other hosts.
			const hostUrl = hostWorkspacesCache.resolveHostUrl(section.hostId);
			if (!hostUrl) {
				toast.error(
					"The group's host is offline — try again when it reconnects",
				);
				return;
			}

			sectionsCache.removeSection(section.hostId, sectionId);
			for (const write of plan.workspaceWrites) {
				patchWorkspacePlacement(write);
			}

			// Delete on the owner first (it ungroups its own members), then fan
			// out the cross-host ungroups.
			getHostServiceClientByUrl(hostUrl)
				.sections.delete.mutate({ id: sectionId })
				.then(() => {
					executePlan(crossHostPlan);
				})
				.catch((error: unknown) => {
					sectionsCache.invalidateHost(section.hostId);
					hostWorkspacesCache.invalidateHost(section.hostId);
					toast.error("Failed to delete group", {
						description: getErrorMessage(error),
					});
				});

			if (collections.v2SectionUiState.get(sectionId)) {
				collections.v2SectionUiState.delete(sectionId);
			}
		},
		[
			collections,
			executePlan,
			hostSectionsById,
			hostWorkspacesCache,
			patchWorkspacePlacement,
			plannerData,
			sectionsCache,
		],
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
		(workspaceId: string, projectId: string) => {
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
		reorderSectionMembers,
		removeProjectFromSidebar,
		reorderProjectChildren,
		removeWorkspaceFromSidebar,
		reorderProjects,
		renameSection,
		setSectionColor,
		toggleProjectCollapsed,
		toggleSectionCollapsed,
	};
}
