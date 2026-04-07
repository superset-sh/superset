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

export function findSiblingPaneId(
	node: LayoutNode,
	paneId: string,
): string | null {
	if (node.type === "pane") return null;

	const inFirst = findPaneInLayout(node.first, paneId);
	const inSecond = findPaneInLayout(node.second, paneId);

	if (inFirst && !inSecond) {
		// Target is in the first branch — sibling is the nearest pane in second
		const deeper = findSiblingPaneId(node.first, paneId);
		return deeper ?? findFirstPaneId(node.second);
	}
	if (inSecond && !inFirst) {
		const deeper = findSiblingPaneId(node.second, paneId);
		return deeper ?? findFirstPaneId(node.first);
	}

	return null;
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
