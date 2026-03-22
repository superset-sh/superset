import type {
	PaneGroupNode,
	PaneLayoutNode,
	PaneRootState,
	PaneState,
	PersistedPaneWorkspaceState,
} from "../../../types";

export interface PaneLocation {
	rootId: string;
	groupId: string;
	paneIndex: number;
}

export function findRootIndex<TPaneData>(
	state: PersistedPaneWorkspaceState<TPaneData>,
	rootId: string,
): number {
	return state.roots.findIndex((root) => root.id === rootId);
}

export function findNodePathByGroupId<TPaneData>(
	node: PaneLayoutNode<TPaneData>,
	groupId: string,
	path: number[] = [],
): number[] | null {
	if (node.type === "group") {
		return node.id === groupId ? path : null;
	}

	for (const [index, child] of node.children.entries()) {
		const childPath = findNodePathByGroupId(child, groupId, [...path, index]);
		if (childPath) return childPath;
	}

	return null;
}

export function findNodePathBySplitId<TPaneData>(
	node: PaneLayoutNode<TPaneData>,
	splitId: string,
	path: number[] = [],
): number[] | null {
	if (node.type === "group") return null;
	if (node.id === splitId) return path;

	for (const [index, child] of node.children.entries()) {
		const childPath = findNodePathBySplitId(child, splitId, [...path, index]);
		if (childPath) return childPath;
	}

	return null;
}

export function getNodeAtPath<TPaneData>(
	node: PaneLayoutNode<TPaneData>,
	path: number[],
): PaneLayoutNode<TPaneData> {
	let current = node;
	for (const index of path) {
		if (current.type !== "split") {
			throw new Error("Invalid path into non-split node");
		}
		current = current.children[index]!;
	}
	return current;
}

export function replaceNodeAtPath<TPaneData>(
	node: PaneLayoutNode<TPaneData>,
	path: number[],
	replacement: PaneLayoutNode<TPaneData>,
): PaneLayoutNode<TPaneData> {
	if (path.length === 0) return replacement;
	if (node.type !== "split") {
		throw new Error("Cannot replace child of non-split node");
	}

	const [index, ...rest] = path;
	return {
		...node,
		children: node.children.map((child, childIndex) =>
			childIndex === index ? replaceNodeAtPath(child, rest, replacement) : child,
		),
	};
}

export function updateNodeAtPath<TPaneData>(
	node: PaneLayoutNode<TPaneData>,
	path: number[],
	updater: (current: PaneLayoutNode<TPaneData>) => PaneLayoutNode<TPaneData>,
): PaneLayoutNode<TPaneData> {
	return replaceNodeAtPath(node, path, updater(getNodeAtPath(node, path)));
}

export function getGroupNode<TPaneData>(
	root: PaneRootState<TPaneData>,
	groupId: string,
): PaneGroupNode<TPaneData> | null {
	const path = findNodePathByGroupId(root.root, groupId);
	if (!path) return null;

	const node = getNodeAtPath(root.root, path);
	return node.type === "group" ? node : null;
}

export function updateGroupNode<TPaneData>(
	root: PaneRootState<TPaneData>,
	groupId: string,
	updater: (group: PaneGroupNode<TPaneData>) => PaneGroupNode<TPaneData>,
): PaneRootState<TPaneData> {
	const path = findNodePathByGroupId(root.root, groupId);
	if (!path) return root;

	return {
		...root,
		root: updateNodeAtPath(root.root, path, (node) => {
			if (node.type !== "group") {
				throw new Error("Expected group node");
			}
			return updater(node);
		}),
	};
}

export function withUpdatedRootAt<TPaneData>(
	state: PersistedPaneWorkspaceState<TPaneData>,
	rootIndex: number,
	updater: (root: PaneRootState<TPaneData>) => PaneRootState<TPaneData>,
): PersistedPaneWorkspaceState<TPaneData> {
	return {
		...state,
		roots: state.roots.map((root, index) =>
			index === rootIndex ? updater(root) : root,
		),
	};
}

export function clampInsertIndex(index: number | undefined, length: number): number {
	if (index == null) return length;
	if (index < 0) return 0;
	if (index > length) return length;
	return index;
}

export function removePaneFromGroupNode<TPaneData>(
	group: PaneGroupNode<TPaneData>,
	paneId: string,
): {
	group: PaneGroupNode<TPaneData>;
	pane: PaneState<TPaneData> | null;
	paneIndex: number;
} {
	const paneIndex = group.panes.findIndex((pane) => pane.id === paneId);
	if (paneIndex === -1) {
		return {
			group,
			pane: null,
			paneIndex: -1,
		};
	}

	const pane = group.panes[paneIndex]!;
	const nextPanes = group.panes.filter((existingPane) => existingPane.id !== paneId);

	return {
		group: {
			...group,
			panes: nextPanes,
			activePaneId:
				group.activePaneId === paneId ? nextPanes[0]?.id ?? null : group.activePaneId,
		},
		pane,
		paneIndex,
	};
}

export function findPaneLocation<TPaneData>(
	state: PersistedPaneWorkspaceState<TPaneData>,
	paneId: string,
): PaneLocation | null {
	const visit = (
		rootId: string,
		node: PaneLayoutNode<TPaneData>,
	): PaneLocation | null => {
		if (node.type === "group") {
			for (const [paneIndex, pane] of node.panes.entries()) {
				if (pane.id === paneId) {
					return {
						rootId,
						groupId: node.id,
						paneIndex,
					};
				}
			}
			return null;
		}

		for (const child of node.children) {
			const location = visit(rootId, child);
			if (location) return location;
		}

		return null;
	};

	for (const root of state.roots) {
		const location = visit(root.id, root.root);
		if (location) return location;
	}

	return null;
}
