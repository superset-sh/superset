import type { LayoutNode, SplitDirection, SplitPosition } from "../../../types";

export function findPaneInLayout(node: LayoutNode, paneId: string): boolean {
	if (node.type === "pane") {
		return node.paneId === paneId;
	}
	return node.children.some((child) => findPaneInLayout(child, paneId));
}

export function findFirstPaneId(node: LayoutNode): string | null {
	if (node.type === "pane") {
		return node.paneId;
	}
	for (const child of node.children) {
		const id = findFirstPaneId(child);
		if (id) return id;
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

	const nextChildren: LayoutNode[] = [];
	const nextWeights: number[] = [];

	for (let i = 0; i < node.children.length; i++) {
		const child = node.children[i];
		if (!child) continue;

		const result = removePaneFromLayout(child, paneId);
		if (result) {
			nextChildren.push(result);
			nextWeights.push(node.weights[i] ?? 1);
		}
	}

	if (nextChildren.length === 0) {
		return null;
	}

	if (nextChildren.length === 1) {
		return nextChildren[0] ?? null;
	}

	return {
		...node,
		children: nextChildren,
		weights: nextWeights,
	};
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
		children: node.children.map((child) =>
			replacePaneIdInLayout(child, oldPaneId, newPaneId),
		),
	};
}

export function splitPaneInLayout(
	node: LayoutNode,
	targetPaneId: string,
	newPaneId: string,
	position: SplitPosition,
	weights?: number[],
): LayoutNode {
	if (node.type === "pane") {
		if (node.paneId !== targetPaneId) return node;

		const direction = positionToDirection(position);
		const newPaneNode: LayoutNode = { type: "pane", paneId: newPaneId };
		const isFirst = position === "left" || position === "top";

		return {
			type: "split",
			id: generateId("split"),
			direction,
			children: isFirst ? [newPaneNode, node] : [node, newPaneNode],
			weights: weights ?? [1, 1],
		};
	}

	const parentInfo = findDirectChild(node, targetPaneId);

	if (parentInfo && node.direction === positionToDirection(position)) {
		const { childIndex } = parentInfo;
		const currentWeight = node.weights[childIndex] ?? 1;
		const halfWeight = currentWeight / 2;
		const newPaneNode: LayoutNode = { type: "pane", paneId: newPaneId };
		const isFirst = position === "left" || position === "top";

		const nextChildren = [...node.children];
		const nextWeights = [...node.weights];

		nextWeights[childIndex] = halfWeight;

		if (isFirst) {
			nextChildren.splice(childIndex, 0, newPaneNode);
			nextWeights.splice(childIndex, 0, halfWeight);
		} else {
			nextChildren.splice(childIndex + 1, 0, newPaneNode);
			nextWeights.splice(childIndex + 1, 0, halfWeight);
		}

		return {
			...node,
			children: nextChildren,
			weights: nextWeights,
		};
	}

	return {
		...node,
		children: node.children.map((child) =>
			splitPaneInLayout(child, targetPaneId, newPaneId, position, weights),
		),
	};
}

function findDirectChild(
	split: LayoutNode & { type: "split" },
	paneId: string,
): { childIndex: number } | null {
	for (let i = 0; i < split.children.length; i++) {
		const child = split.children[i];
		if (child?.type === "pane" && child.paneId === paneId) {
			return { childIndex: i };
		}
	}
	return null;
}

export function updateSplitInLayout(
	node: LayoutNode,
	splitId: string,
	updater: (split: LayoutNode & { type: "split" }) => LayoutNode,
): LayoutNode {
	if (node.type === "pane") return node;
	if (node.id === splitId) return updater(node);

	return {
		...node,
		children: node.children.map((child) =>
			updateSplitInLayout(child, splitId, updater),
		),
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
