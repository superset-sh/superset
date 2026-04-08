import type {
	LayoutNode,
	SplitBranch,
	SplitDirection,
	SplitPath,
	SplitPosition,
} from "../../../types";

export type PaneFocusDirection = "up" | "down" | "left" | "right";

interface PaneBounds {
	paneId: string;
	left: number;
	top: number;
	right: number;
	bottom: number;
	centerX: number;
	centerY: number;
}

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

function collectPaneBounds(
	node: LayoutNode,
	bounds: { left: number; top: number; right: number; bottom: number },
	result: PaneBounds[],
): void {
	if (node.type === "pane") {
		result.push({
			paneId: node.paneId,
			left: bounds.left,
			top: bounds.top,
			right: bounds.right,
			bottom: bounds.bottom,
			centerX: (bounds.left + bounds.right) / 2,
			centerY: (bounds.top + bounds.bottom) / 2,
		});
		return;
	}

	const splitPercentage = (node.splitPercentage ?? 50) / 100;

	if (node.direction === "horizontal") {
		const splitX = bounds.left + (bounds.right - bounds.left) * splitPercentage;
		collectPaneBounds(
			node.first,
			{
				left: bounds.left,
				top: bounds.top,
				right: splitX,
				bottom: bounds.bottom,
			},
			result,
		);
		collectPaneBounds(
			node.second,
			{
				left: splitX,
				top: bounds.top,
				right: bounds.right,
				bottom: bounds.bottom,
			},
			result,
		);
		return;
	}

	const splitY = bounds.top + (bounds.bottom - bounds.top) * splitPercentage;
	collectPaneBounds(
		node.first,
		{
			left: bounds.left,
			top: bounds.top,
			right: bounds.right,
			bottom: splitY,
		},
		result,
	);
	collectPaneBounds(
		node.second,
		{
			left: bounds.left,
			top: splitY,
			right: bounds.right,
			bottom: bounds.bottom,
		},
		result,
	);
}

function getPaneBounds(node: LayoutNode): PaneBounds[] {
	const result: PaneBounds[] = [];
	collectPaneBounds(node, { left: 0, top: 0, right: 1, bottom: 1 }, result);
	return result;
}

function getOrthogonalOverlap(
	current: PaneBounds,
	candidate: PaneBounds,
	direction: PaneFocusDirection,
): number {
	if (direction === "left" || direction === "right") {
		return Math.max(
			0,
			Math.min(current.bottom, candidate.bottom) -
				Math.max(current.top, candidate.top),
		);
	}

	return Math.max(
		0,
		Math.min(current.right, candidate.right) -
			Math.max(current.left, candidate.left),
	);
}

function isInDirectionByEdge(
	current: PaneBounds,
	candidate: PaneBounds,
	direction: PaneFocusDirection,
): boolean {
	switch (direction) {
		case "up":
			return candidate.bottom <= current.top;
		case "down":
			return candidate.top >= current.bottom;
		case "left":
			return candidate.right <= current.left;
		case "right":
			return candidate.left >= current.right;
	}
}

function getDirectionalGap(
	current: PaneBounds,
	candidate: PaneBounds,
	direction: PaneFocusDirection,
): number {
	switch (direction) {
		case "up":
			return current.top - candidate.bottom;
		case "down":
			return candidate.top - current.bottom;
		case "left":
			return current.left - candidate.right;
		case "right":
			return candidate.left - current.right;
	}
}

function getCrossAxisDistance(
	current: PaneBounds,
	candidate: PaneBounds,
	direction: PaneFocusDirection,
): number {
	if (direction === "left" || direction === "right") {
		return Math.abs(candidate.centerY - current.centerY);
	}

	return Math.abs(candidate.centerX - current.centerX);
}

export function findPaneIdInDirection(
	node: LayoutNode,
	currentPaneId: string,
	direction: PaneFocusDirection,
): string | null {
	const paneBounds = getPaneBounds(node);
	const current = paneBounds.find((pane) => pane.paneId === currentPaneId);
	if (!current) return null;

	const edgeCandidates = paneBounds.filter(
		(candidate) =>
			candidate.paneId !== currentPaneId &&
			isInDirectionByEdge(current, candidate, direction),
	);
	if (edgeCandidates.length === 0) return null;

	const overlappingCandidates = edgeCandidates.filter(
		(candidate) => getOrthogonalOverlap(current, candidate, direction) > 0,
	);
	if (overlappingCandidates.length === 0) return null;

	return (
		overlappingCandidates.slice().sort((a, b) => {
			const gapDifference =
				getDirectionalGap(current, a, direction) -
				getDirectionalGap(current, b, direction);
			if (gapDifference !== 0) return gapDifference;

			const crossAxisDifference =
				getCrossAxisDistance(current, a, direction) -
				getCrossAxisDistance(current, b, direction);
			if (crossAxisDifference !== 0) return crossAxisDifference;

			const topDifference = a.top - b.top;
			if (topDifference !== 0) return topDifference;

			return a.left - b.left;
		})[0]?.paneId ?? null
	);
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
