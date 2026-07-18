/**
 * Pure planners for host-owned section mutations. Each host only stores its
 * own rows, so plans carry ABSOLUTE tabOrders computed from the merged lane
 * and the hook layer fans the writes out per owning host.
 */

import {
	compareTopLevelItems,
	getFirstSectionIndex,
} from "@superset/shared/sidebar-order";

export interface PlannerWorkspace {
	id: string;
	projectId: string;
	hostId: string;
	sectionId: string | null;
	tabOrder: number;
}

export interface PlannerSection {
	id: string;
	projectId: string;
	hostId: string;
	tabOrder: number;
}

export interface PlannerData {
	workspaces: PlannerWorkspace[];
	sections: PlannerSection[];
}

export interface TopLevelItemRef {
	type: "workspace" | "section";
	id: string;
}

interface TopLevelItem extends TopLevelItemRef {
	tabOrder: number;
}

export interface SectionOrderWrite {
	hostId: string;
	sectionId: string;
	tabOrder: number;
}

export interface WorkspacePlacementWrite {
	hostId: string;
	workspaceId: string;
	sectionId: string | null;
	tabOrder: number;
}

export interface SectionWritePlan {
	sectionWrites: SectionOrderWrite[];
	workspaceWrites: WorkspacePlacementWrite[];
}

/** Merged top-level lane: tabOrder ASC, sections-first on ties. */
export function getProjectTopLevelItems(
	data: PlannerData,
	projectId: string,
	options: { excludeWorkspaceId?: string; excludeSectionId?: string } = {},
): TopLevelItem[] {
	return [
		...data.workspaces
			.filter(
				(workspace) =>
					workspace.projectId === projectId &&
					workspace.sectionId === null &&
					workspace.id !== options.excludeWorkspaceId,
			)
			.map((workspace) => ({
				type: "workspace" as const,
				id: workspace.id,
				tabOrder: workspace.tabOrder,
			})),
		...data.sections
			.filter(
				(section) =>
					section.projectId === projectId &&
					section.id !== options.excludeSectionId,
			)
			.map((section) => ({
				type: "section" as const,
				id: section.id,
				tabOrder: section.tabOrder,
			})),
	].sort(compareTopLevelItems);
}

/** Rewrite the top-level lane; only changed rows produce writes. */
export function planTopLevelOrder(
	data: PlannerData,
	orderedItems: TopLevelItemRef[],
): SectionWritePlan {
	const workspacesById = new Map(
		data.workspaces.map((workspace) => [workspace.id, workspace]),
	);
	const sectionsById = new Map(
		data.sections.map((section) => [section.id, section]),
	);
	const plan: SectionWritePlan = { sectionWrites: [], workspaceWrites: [] };

	orderedItems.forEach((item, index) => {
		const tabOrder = index + 1;
		if (item.type === "workspace") {
			const workspace = workspacesById.get(item.id);
			if (!workspace) return;
			if (workspace.sectionId === null && workspace.tabOrder === tabOrder) {
				return;
			}
			plan.workspaceWrites.push({
				hostId: workspace.hostId,
				workspaceId: workspace.id,
				sectionId: null,
				tabOrder,
			});
			return;
		}
		const section = sectionsById.get(item.id);
		if (!section || section.tabOrder === tabOrder) return;
		plan.sectionWrites.push({
			hostId: section.hostId,
			sectionId: section.id,
			tabOrder,
		});
	});

	return plan;
}

export function planSectionMembersOrder(
	data: PlannerData,
	sectionId: string,
	orderedWorkspaceIds: string[],
): SectionWritePlan {
	const workspacesById = new Map(
		data.workspaces.map((workspace) => [workspace.id, workspace]),
	);
	const plan: SectionWritePlan = { sectionWrites: [], workspaceWrites: [] };
	orderedWorkspaceIds.forEach((workspaceId, index) => {
		const tabOrder = index + 1;
		const workspace = workspacesById.get(workspaceId);
		if (!workspace) return;
		if (workspace.sectionId === sectionId && workspace.tabOrder === tabOrder) {
			return;
		}
		plan.workspaceWrites.push({
			hostId: workspace.hostId,
			workspaceId,
			sectionId,
			tabOrder,
		});
	});
	return plan;
}

/** Un-group workspaces to just above the first section, then renumber. */
export function planUngroupWorkspaces(
	data: PlannerData,
	projectId: string,
	workspaceIds: string[],
	options: { excludeSectionId?: string } = {},
): SectionWritePlan {
	const moving = new Set(workspaceIds);
	const lane: TopLevelItemRef[] = getProjectTopLevelItems(data, projectId, {
		excludeSectionId: options.excludeSectionId,
	}).filter((item) => !(item.type === "workspace" && moving.has(item.id)));
	const insertIndex = getFirstSectionIndex(lane);
	lane.splice(
		insertIndex,
		0,
		...workspaceIds.map((id) => ({ type: "workspace" as const, id })),
	);
	return planTopLevelOrder(data, lane);
}

export function groupPlanByHost(
	plan: SectionWritePlan,
): Map<string, SectionWritePlan> {
	const byHost = new Map<string, SectionWritePlan>();
	const forHost = (hostId: string): SectionWritePlan => {
		let entry = byHost.get(hostId);
		if (!entry) {
			entry = { sectionWrites: [], workspaceWrites: [] };
			byHost.set(hostId, entry);
		}
		return entry;
	};
	for (const write of plan.sectionWrites) {
		forHost(write.hostId).sectionWrites.push(write);
	}
	for (const write of plan.workspaceWrites) {
		forHost(write.hostId).workspaceWrites.push(write);
	}
	return byHost;
}
