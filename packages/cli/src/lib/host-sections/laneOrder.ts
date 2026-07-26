import { CLIError } from "@superset/cli-framework";
import { compareTopLevelItems } from "@superset/shared/sidebar-order";
import type { HostServiceClient } from "../host-target";

export interface LaneItem {
	type: "workspace" | "section";
	id: string;
	tabOrder: number;
}

export interface MoveTarget {
	up?: boolean;
	down?: boolean;
	top?: boolean;
	bottom?: boolean;
	afterId?: string;
}

export function requireSingleMoveTarget(target: MoveTarget): void {
	const chosen = [
		target.up,
		target.down,
		target.top,
		target.bottom,
		target.afterId !== undefined,
	].filter(Boolean).length;
	if (chosen !== 1) {
		throw new CLIError(
			"Specify exactly one position",
			"Use --up, --down, --top, --bottom, or --after <item>",
		);
	}
}

/** Build a `MoveTarget` from CLI position flags plus an optional after-id. */
export function toMoveTarget(
	flags: { up?: boolean; down?: boolean; top?: boolean; bottom?: boolean },
	afterId?: string,
): MoveTarget {
	return {
		up: flags.up ?? undefined,
		down: flags.down ?? undefined,
		top: flags.top ?? undefined,
		bottom: flags.bottom ?? undefined,
		afterId,
	};
}

interface LaneWorkspace {
	id: string;
	projectId: string;
	sectionId?: string | null;
	tabOrder?: number;
}

interface LaneSection {
	id: string;
	projectId: string;
	tabOrder: number;
}

/**
 * Reposition a workspace and persist the order: its section's members if
 * grouped, else the project's top-level lane. Takes already-fetched rows.
 */
export async function applyWorkspaceLaneMove(
	client: HostServiceClient,
	data: { workspaces: LaneWorkspace[]; sections: LaneSection[] },
	params: {
		workspaceId: string;
		sectionId: string | null;
		projectId: string;
		target: MoveTarget;
	},
): Promise<void> {
	if (params.sectionId) {
		const members = data.workspaces
			.filter((row) => row.sectionId === params.sectionId)
			.sort((left, right) => (left.tabOrder ?? 0) - (right.tabOrder ?? 0))
			.map((row) => ({
				type: "workspace" as const,
				id: row.id,
				tabOrder: row.tabOrder ?? 0,
			}));
		const reordered = moveLaneItem(members, params.workspaceId, params.target);
		await client.sections.reorderInSection.mutate({
			sectionId: params.sectionId,
			workspaceIds: reordered.map((item) => item.id),
		});
		return;
	}
	const lane = buildProjectLane(
		data.workspaces,
		data.sections,
		params.projectId,
	);
	const reordered = moveLaneItem(lane, params.workspaceId, params.target);
	await applyProjectLaneOrder(client, reordered);
}

/** The project's top-level lane: ungrouped workspaces + groups, sorted. */
export function buildProjectLane(
	workspaces: Array<{
		id: string;
		projectId: string;
		sectionId?: string | null;
		tabOrder?: number;
	}>,
	sections: Array<{ id: string; projectId: string; tabOrder: number }>,
	projectId: string,
): LaneItem[] {
	return [
		...workspaces
			.filter(
				(workspace) =>
					workspace.projectId === projectId && !workspace.sectionId,
			)
			.map((workspace) => ({
				type: "workspace" as const,
				id: workspace.id,
				tabOrder: workspace.tabOrder ?? 0,
			})),
		...sections
			.filter((section) => section.projectId === projectId)
			.map((section) => ({
				type: "section" as const,
				id: section.id,
				tabOrder: section.tabOrder,
			})),
	].sort(compareTopLevelItems);
}

/** Reposition `id` within the lane and return the new order. */
export function moveLaneItem(
	items: LaneItem[],
	id: string,
	target: MoveTarget,
): LaneItem[] {
	const currentIndex = items.findIndex((item) => item.id === id);
	if (currentIndex === -1) {
		throw new CLIError(`Item not found in its list: ${id}`);
	}

	let newIndex: number;
	if (target.up) {
		newIndex = Math.max(0, currentIndex - 1);
	} else if (target.down) {
		newIndex = Math.min(items.length - 1, currentIndex + 1);
	} else if (target.top) {
		newIndex = 0;
	} else if (target.bottom) {
		newIndex = items.length - 1;
	} else if (target.afterId !== undefined) {
		const afterIndex = items.findIndex((item) => item.id === target.afterId);
		if (afterIndex === -1) {
			throw new CLIError(
				`--after target is not in the same list: ${target.afterId}`,
			);
		}
		newIndex = afterIndex < currentIndex ? afterIndex + 1 : afterIndex;
	} else {
		throw new CLIError("No position given");
	}

	const next = [...items];
	const [moved] = next.splice(currentIndex, 1);
	if (!moved) return items;
	next.splice(newIndex, 0, moved);
	return next;
}

/** Persist a top-level lane order as absolute tabOrders (index + 1). */
export async function applyProjectLaneOrder(
	client: HostServiceClient,
	lane: LaneItem[],
): Promise<void> {
	const sections: Array<{ id: string; tabOrder: number }> = [];
	const workspaces: Array<{
		workspaceId: string;
		sectionId: string | null;
		tabOrder: number;
	}> = [];
	lane.forEach((item, index) => {
		const tabOrder = index + 1;
		if (item.type === "section") {
			sections.push({ id: item.id, tabOrder });
		} else {
			workspaces.push({ workspaceId: item.id, sectionId: null, tabOrder });
		}
	});
	// One transactional write so a mid-reorder failure can't half-apply.
	await client.sections.reorderLane.mutate({ sections, workspaces });
}
