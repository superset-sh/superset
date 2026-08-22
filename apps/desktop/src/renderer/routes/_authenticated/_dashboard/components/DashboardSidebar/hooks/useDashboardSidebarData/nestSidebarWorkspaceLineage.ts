import type { DashboardSidebarWorkspace } from "../../types";

/**
 * Regroups one ordered container of workspace rows into a lineage tree
 * rendered depth-first: children follow their parent with `lineageDepth`
 * incremented per level, preserving each level's original relative order.
 * A collapsed parent keeps its `lineageChildCount` (for the chevron) but
 * its descendants are not emitted.
 *
 * Lineage is structural but best-effort: a row whose parent is not in this
 * container (filtered out, pinned away, in a section, on another host)
 * re-roots at depth 0 rather than disappearing. Cycles cannot be produced
 * by the create path (edges are set once at insert), but a corrupted edge
 * set must not hide rows — members of a cycle are re-promoted to roots.
 */
export function nestSidebarWorkspaceLineage(
	workspaces: DashboardSidebarWorkspace[],
): DashboardSidebarWorkspace[] {
	if (workspaces.length < 2) return workspaces;
	const idsInContainer = new Set(workspaces.map((workspace) => workspace.id));
	let hasNestedChild = false;
	const childrenByParentId = new Map<string, DashboardSidebarWorkspace[]>();
	const roots: DashboardSidebarWorkspace[] = [];
	for (const workspace of workspaces) {
		const parentId = workspace.parentWorkspaceId;
		if (parentId && parentId !== workspace.id && idsInContainer.has(parentId)) {
			hasNestedChild = true;
			const siblings = childrenByParentId.get(parentId);
			if (siblings) siblings.push(workspace);
			else childrenByParentId.set(parentId, [workspace]);
		} else {
			roots.push(workspace);
		}
	}
	if (!hasNestedChild) return workspaces;

	const result: DashboardSidebarWorkspace[] = [];
	const emitted = new Set<string>();
	// Every id below a node, collapsed or not, cycle-guarded by `seen`.
	const collectDescendantIds = (id: string, seen: Set<string>): string[] => {
		const ids: string[] = [];
		for (const child of childrenByParentId.get(id) ?? []) {
			if (seen.has(child.id)) continue;
			seen.add(child.id);
			ids.push(child.id, ...collectDescendantIds(child.id, seen));
		}
		return ids;
	};
	const emit = (
		workspace: DashboardSidebarWorkspace,
		depth: number,
		guides: boolean[],
		ancestors: string[],
	) => {
		if (emitted.has(workspace.id)) return;
		emitted.add(workspace.id);
		const children = childrenByParentId.get(workspace.id) ?? [];
		result.push({
			...workspace,
			lineageDepth: depth,
			lineageChildCount: children.length,
			lineageGuides: guides,
			lineageGutter: true,
			lineageDescendantIds: collectDescendantIds(
				workspace.id,
				new Set([workspace.id]),
			),
			lineageAncestorIds: ancestors,
		});
		if (workspace.lineageCollapsed) {
			// Hidden, not orphaned: mark the subtree emitted so descendants
			// neither render nor re-root below.
			const markHidden = (parent: DashboardSidebarWorkspace) => {
				for (const child of childrenByParentId.get(parent.id) ?? []) {
					if (emitted.has(child.id)) continue;
					emitted.add(child.id);
					markHidden(child);
				}
			};
			markHidden(workspace);
			return;
		}
		children.forEach((child, index) => {
			// The rail under this row's chevron continues past the child only
			// while later siblings remain below it.
			emit(
				child,
				depth + 1,
				[...guides, index < children.length - 1],
				[...ancestors, workspace.id],
			);
		});
	};
	for (const root of roots) emit(root, 0, [], []);
	// Members of a cycle are reachable from no root; re-promote them so
	// malformed lineage can never hide a row.
	for (const workspace of workspaces) {
		if (!emitted.has(workspace.id)) emit(workspace, 0, [], []);
	}
	return result;
}
