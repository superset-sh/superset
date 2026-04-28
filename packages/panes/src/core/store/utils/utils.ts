import type {
	LayoutNode,
	SplitBranch,
	SplitDirection,
	SplitPath,
	SplitPosition,
} from "../../../types";

export function findPaneInLayout(node: LayoutNode, paneId: string): boolean {
	if (node.type === "pane") {
		return node.paneId === paneId;
	}
	return (
		findPaneInLayout(node.first, paneId) ||
		findPaneInLayout(node.second, paneId)
	);
}

export function findFirstPaneId(node: LayoutNode): string | null {
	if (node.type === "pane") {
		return node.paneId;
	}
	return findFirstPaneId(node.first) ?? findFirstPaneId(node.second);
}

export function getPaneIdsInLayout(node: LayoutNode): string[] {
	if (node.type === "pane") {
		return [node.paneId];
	}
	return [
		...getPaneIdsInLayout(node.first),
		...getPaneIdsInLayout(node.second),
	];
}

export function getActiveIdAfterRemoval(
	orderedIds: readonly string[],
	activeId: string | null | undefined,
	removedId: string,
): string | null {
	if (activeId !== removedId) {
		return activeId ?? null;
	}

	const removedIndex = orderedIds.indexOf(removedId);
	return removedIndex === -1
		? (orderedIds[0] ?? null)
		: (orderedIds[removedIndex + 1] ?? orderedIds[removedIndex - 1] ?? null);
}

export function removePaneFromLayout(
	node: LayoutNode,
	paneId: string,
): LayoutNode | null {
	if (node.type === "pane") {
		return node.paneId === paneId ? null : node;
	}

	const newFirst = removePaneFromLayout(node.first, paneId);
	const newSecond = removePaneFromLayout(node.second, paneId);

	// Both removed (shouldn't happen in practice)
	if (!newFirst && !newSecond) return null;
	// Sibling promotion — one child removed, promote the other
	if (!newFirst) return newSecond;
	if (!newSecond) return newFirst;

	return { ...node, first: newFirst, second: newSecond };
}

export function replacePaneIdInLayout(
	node: LayoutNode,
	oldPaneId: string,
	newPaneId: string,
): LayoutNode {
	if (node.type === "pane") {
		return node.paneId === oldPaneId
			? { type: "pane", paneId: newPaneId }
			: node;
	}

	return {
		...node,
		first: replacePaneIdInLayout(node.first, oldPaneId, newPaneId),
		second: replacePaneIdInLayout(node.second, oldPaneId, newPaneId),
	};
}

export function splitPaneInLayout(
	node: LayoutNode,
	targetPaneId: string,
	newPaneId: string,
	position: SplitPosition,
): LayoutNode {
	if (node.type === "pane") {
		if (node.paneId !== targetPaneId) return node;

		const direction = positionToDirection(position);
		const newPaneNode: LayoutNode = { type: "pane", paneId: newPaneId };
		const isFirst = position === "left" || position === "top";

		return {
			type: "split",
			direction,
			first: isFirst ? newPaneNode : node,
			second: isFirst ? node : newPaneNode,
		};
	}

	return {
		...node,
		first: splitPaneInLayout(node.first, targetPaneId, newPaneId, position),
		second: splitPaneInLayout(node.second, targetPaneId, newPaneId, position),
	};
}

export function getNodeAtPath(
	node: LayoutNode,
	path: SplitPath,
): LayoutNode | null {
	if (path.length === 0) return node;
	if (node.type === "pane") return null;

	const [branch, ...rest] = path as [SplitBranch, ...SplitBranch[]];
	return getNodeAtPath(node[branch], rest);
}

export function updateAtPath(
	node: LayoutNode,
	path: SplitPath,
	updater: (node: LayoutNode) => LayoutNode,
): LayoutNode {
	if (path.length === 0) return updater(node);
	if (node.type === "pane") return node;

	const [branch, ...rest] = path as [SplitBranch, ...SplitBranch[]];
	return {
		...node,
		[branch]: updateAtPath(node[branch], rest, updater),
	};
}

export function getOtherBranch(branch: SplitBranch): SplitBranch {
	return branch === "first" ? "second" : "first";
}

function countLeaves(node: LayoutNode): number {
	if (node.type === "pane") return 1;
	return countLeaves(node.first) + countLeaves(node.second);
}

export function equalizeAllSplits(node: LayoutNode): LayoutNode {
	if (node.type === "pane") return node;

	const firstLeaves = countLeaves(node.first);
	const secondLeaves = countLeaves(node.second);

	return {
		...node,
		splitPercentage: (firstLeaves / (firstLeaves + secondLeaves)) * 100,
		first: equalizeAllSplits(node.first),
		second: equalizeAllSplits(node.second),
	};
}

export function positionToDirection(position: SplitPosition): SplitDirection {
	return position === "left" || position === "right"
		? "horizontal"
		: "vertical";
}

export function generateId(prefix: string): string {
	return `${prefix}-${crypto.randomUUID()}`;
}

export type FocusDirection = "left" | "right" | "up" | "down";

export function findPanePath(
	node: LayoutNode,
	paneId: string,
	currentPath: SplitBranch[] = [],
): SplitPath | null {
	if (node.type === "pane") {
		return node.paneId === paneId ? currentPath : null;
	}
	const firstPath = findPanePath(node.first, paneId, [...currentPath, "first"]);
	if (firstPath) return firstPath;
	return findPanePath(node.second, paneId, [...currentPath, "second"]);
}

// Descent into a sibling subtree once a pivot split has been chosen.
// - On splits matching the arrow axis: pick the near edge (first for
//   right/down, second for left/up), preserving alignmentPath.
// - On perpendicular splits: consume one entry from alignmentPath to
//   preserve the source pane's cross-axis position; if exhausted, fall
//   back to `first`.
function findEdgePaneId(
	node: LayoutNode,
	dir: FocusDirection,
	alignmentPath: SplitPath = [],
): string | null {
	if (node.type === "pane") return node.paneId;
	const axis: SplitDirection =
		dir === "left" || dir === "right" ? "horizontal" : "vertical";
	if (node.direction === axis) {
		const nearEdge: SplitBranch =
			dir === "right" || dir === "down" ? "first" : "second";
		return findEdgePaneId(node[nearEdge], dir, alignmentPath);
	}
	const [alignedBranch = "first", ...rest] = alignmentPath;
	return findEdgePaneId(node[alignedBranch], dir, rest);
}

export function getSpatialNeighborPaneId(
	root: LayoutNode,
	paneId: string,
	dir: FocusDirection,
): string | null {
	const path = findPanePath(root, paneId);
	if (!path) return null;

	const axis: SplitDirection =
		dir === "left" || dir === "right" ? "horizontal" : "vertical";
	const wantSecond = dir === "right" || dir === "down";

	for (let i = path.length - 1; i >= 0; i--) {
		const ancestor = getNodeAtPath(root, path.slice(0, i));
		if (!ancestor || ancestor.type !== "split") continue;
		if (ancestor.direction !== axis) continue;
		const cameFrom = path[i];
		if (wantSecond && cameFrom !== "first") continue;
		if (!wantSecond && cameFrom !== "second") continue;
		const siblingBranch: SplitBranch = wantSecond ? "second" : "first";
		return findEdgePaneId(ancestor[siblingBranch], dir, path.slice(i + 1));
	}
	return null;
}
