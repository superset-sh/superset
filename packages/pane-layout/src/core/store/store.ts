import { createStore, type StoreApi } from "zustand/vanilla";
import type {
	PaneGroupNode,
	PaneRootState,
	PaneSplitPosition,
	PaneState,
	PaneWorkspaceState,
} from "../../types";
import {
	findNodePathByGroupId,
	findNodePathBySplitId,
	findPaneLocation,
	getGroupNode,
	getNodeAtPath,
	replaceNodeAtPath,
	updateGroupNode,
	updateNodeAtPath,
} from "./utils";

export interface PaneWorkspaceStoreState<TPaneData> {
	state: PaneWorkspaceState<TPaneData>;
}

export interface CreatePaneWorkspaceStoreOptions<TPaneData> {
	initialState: PaneWorkspaceState<TPaneData>;
}

function generatePaneLayoutId(prefix: string): string {
	return `${prefix}-${crypto.randomUUID()}`;
}

function getFirstGroupId<TPaneData>(
	node: PaneRootState<TPaneData>["root"],
): string | null {
	if (node.type === "group") {
		return node.id;
	}

	for (const child of node.children) {
		const groupId = getFirstGroupId(child);
		if (groupId) {
			return groupId;
		}
	}

	return null;
}

function collapseEmptyNodes<TPaneData>(
	node: PaneRootState<TPaneData>["root"],
): PaneRootState<TPaneData>["root"] | null {
	if (node.type === "group") {
		return node.panes.length > 0 ? node : null;
	}

	const nextChildren = node.children
		.map((child) => collapseEmptyNodes(child))
		.filter((child): child is NonNullable<typeof child> => child !== null);

	if (nextChildren.length === 0) {
		return null;
	}

	if (nextChildren.length === 1) {
		const [onlyChild] = nextChildren;
		return onlyChild ?? null;
	}

	return {
		...node,
		children: nextChildren,
		sizes: Array.from(
			{ length: nextChildren.length },
			() => 100 / nextChildren.length,
		),
	};
}

function normalizeRootState<TPaneData>(
	root: PaneRootState<TPaneData>,
): PaneRootState<TPaneData> | null {
	const nextRootNode = collapseEmptyNodes(root.root);
	if (!nextRootNode) {
		return null;
	}

	const nextRoot = {
		...root,
		root: nextRootNode,
	};
	const nextActiveGroupId =
		root.activeGroupId && getGroupNode(nextRoot, root.activeGroupId)
			? root.activeGroupId
			: getFirstGroupId(nextRootNode);

	return {
		...nextRoot,
		activeGroupId: nextActiveGroupId,
	};
}

function getRootAtIndex<TPaneData>(
	roots: PaneRootState<TPaneData>[],
	index: number,
): PaneRootState<TPaneData> | null {
	return roots[index] ?? null;
}

export interface PaneWorkspaceStore<TPaneData>
	extends PaneWorkspaceStoreState<TPaneData> {
	getRoot: (rootId: string) => PaneRootState<TPaneData> | null;
	getActiveRoot: () => PaneRootState<TPaneData> | null;
	getGroup: (args: {
		rootId: string;
		groupId: string;
	}) => PaneGroupNode<TPaneData> | null;
	getActiveGroup: (rootId?: string) => PaneGroupNode<TPaneData> | null;
	getPane: (paneId: string) => {
		rootId: string;
		groupId: string;
		paneIndex: number;
		pane: PaneState<TPaneData>;
	} | null;
	getActivePane: (rootId?: string) => {
		rootId: string;
		groupId: string;
		paneIndex: number;
		pane: PaneState<TPaneData>;
	} | null;
	replaceState: (
		next:
			| PaneWorkspaceState<TPaneData>
			| ((
					prev: PaneWorkspaceState<TPaneData>,
			  ) => PaneWorkspaceState<TPaneData>),
	) => void;
	addRoot: (root: PaneRootState<TPaneData>) => void;
	removeRoot: (rootId: string) => void;
	setActiveRoot: (rootId: string) => void;
	setRootTitleOverride: (args: {
		rootId: string;
		titleOverride?: string;
	}) => void;
	setActiveGroup: (args: { rootId: string; groupId: string }) => void;
	setActivePane: (args: {
		rootId: string;
		groupId: string;
		paneId: string;
	}) => void;
	setPaneTitleOverride: (args: {
		rootId: string;
		groupId: string;
		paneId: string;
		titleOverride?: string;
	}) => void;
	setPanePinned: (args: {
		rootId: string;
		groupId: string;
		paneId: string;
		pinned: boolean;
	}) => void;
	setPaneData: (args: { paneId: string; data: TPaneData }) => void;
	addPaneToGroup: (args: {
		rootId: string;
		groupId: string;
		pane: PaneState<TPaneData>;
		index?: number;
		replaceUnpinned?: boolean;
		select?: boolean;
	}) => void;
	closePane: (args: {
		rootId: string;
		groupId: string;
		paneId: string;
	}) => void;
	movePane: (args: {
		paneId: string;
		targetRootId: string;
		targetGroupId: string;
		index?: number;
		select?: boolean;
	}) => void;
	splitGroup: (args: {
		rootId: string;
		groupId: string;
		position: PaneSplitPosition;
		newPane: PaneState<TPaneData>;
		selectNewPane?: boolean;
		sizes?: number[];
	}) => void;
	resizeSplit: (args: {
		rootId: string;
		splitId: string;
		sizes: number[];
	}) => void;
	equalizeSplit: (args: { rootId: string; splitId: string }) => void;
}

export function createPane<TPaneData>({
	id,
	kind,
	titleOverride,
	pinned,
	data,
}: {
	id?: string;
	kind: string;
	titleOverride?: string;
	pinned?: boolean;
	data: TPaneData;
}): PaneState<TPaneData> {
	return {
		id: id ?? generatePaneLayoutId("pane"),
		kind,
		titleOverride,
		pinned,
		data,
	};
}

export function createPaneRoot<TPaneData>({
	id,
	titleOverride,
	groupId,
	panes,
	activePaneId,
}: {
	id?: string;
	titleOverride?: string;
	groupId?: string;
	panes: Array<PaneState<TPaneData>>;
	activePaneId?: string | null;
}): PaneRootState<TPaneData> {
	const resolvedRootId = id ?? generatePaneLayoutId("root");
	const resolvedGroupId = groupId ?? generatePaneLayoutId("group");

	return {
		id: resolvedRootId,
		titleOverride,
		root: {
			type: "group",
			id: resolvedGroupId,
			activePaneId: activePaneId ?? panes[0]?.id ?? null,
			panes,
		},
		activeGroupId: resolvedGroupId,
	};
}

export function createPaneWorkspaceState<TPaneData>({
	roots,
	activeRootId,
}: {
	roots?: Array<PaneRootState<TPaneData>>;
	activeRootId?: string | null;
}): PaneWorkspaceState<TPaneData> {
	const resolvedRoots = roots ?? [];

	return {
		version: 1,
		roots: resolvedRoots,
		activeRootId: activeRootId ?? resolvedRoots[0]?.id ?? null,
	};
}

export function createPaneWorkspaceStore<TPaneData>(
	options: CreatePaneWorkspaceStoreOptions<TPaneData>,
): StoreApi<PaneWorkspaceStore<TPaneData>> {
	return createStore<PaneWorkspaceStore<TPaneData>>((set, get) => ({
		state: options.initialState,
		getRoot: (rootId) =>
			get().state.roots.find((root) => root.id === rootId) ?? null,
		getActiveRoot: () => {
			const state = get().state;
			return state.roots.find((root) => root.id === state.activeRootId) ?? null;
		},
		getGroup: (args) => {
			const root = get().state.roots.find((entry) => entry.id === args.rootId);
			return root ? getGroupNode(root, args.groupId) : null;
		},
		getActiveGroup: (rootId) => {
			const state = get().state;
			const root =
				(rootId == null
					? state.roots.find((entry) => entry.id === state.activeRootId)
					: state.roots.find((entry) => entry.id === rootId)) ?? null;
			return root?.activeGroupId
				? getGroupNode(root, root.activeGroupId)
				: null;
		},
		getPane: (paneId) => {
			const location = findPaneLocation(get().state, paneId);
			if (!location) return null;

			const root = get().state.roots.find(
				(entry) => entry.id === location.rootId,
			);
			const group = root ? getGroupNode(root, location.groupId) : null;
			const pane = group?.panes[location.paneIndex] ?? null;

			return pane
				? {
						...location,
						pane,
					}
				: null;
		},
		getActivePane: (rootId) => {
			const root =
				rootId == null ? get().getActiveRoot() : get().getRoot(rootId);
			if (!root || !root.activeGroupId) return null;

			const group = getGroupNode(root, root.activeGroupId);
			if (!group || !group.activePaneId) return null;

			const paneIndex = group.panes.findIndex(
				(pane) => pane.id === group.activePaneId,
			);
			if (paneIndex === -1) return null;
			const pane = group.panes[paneIndex];
			if (!pane) return null;

			return {
				rootId: root.id,
				groupId: group.id,
				paneIndex,
				pane,
			};
		},
		replaceState: (next) => {
			set((state) => ({
				state: typeof next === "function" ? next(state.state) : next,
			}));
		},
		addRoot: (root) => {
			set((state) => ({
				state: {
					...state.state,
					roots: [...state.state.roots, root],
					activeRootId: state.state.activeRootId ?? root.id,
				},
			}));
		},
		removeRoot: (rootId) => {
			set((state) => ({
				state: {
					...state.state,
					roots: state.state.roots.filter((root) => root.id !== rootId),
					activeRootId:
						state.state.activeRootId === rootId
							? (state.state.roots.filter((root) => root.id !== rootId)[0]
									?.id ?? null)
							: state.state.activeRootId,
				},
			}));
		},
		setActiveRoot: (rootId) => {
			set((state) => ({
				state: state.state.roots.some((root) => root.id === rootId)
					? { ...state.state, activeRootId: rootId }
					: state.state,
			}));
		},
		setRootTitleOverride: (args) => {
			set((state) => ({
				state: {
					...state.state,
					roots: state.state.roots.map((root) =>
						root.id === args.rootId
							? {
									...root,
									titleOverride: args.titleOverride,
								}
							: root,
					),
				},
			}));
		},
		setActiveGroup: (args) => {
			set((state) => {
				const rootIndex = state.state.roots.findIndex(
					(root) => root.id === args.rootId,
				);
				if (rootIndex === -1) return state;
				const root = getRootAtIndex(state.state.roots, rootIndex);
				if (!root || !getGroupNode(root, args.groupId)) {
					return state;
				}

				return {
					state: {
						...state.state,
						roots: state.state.roots.map((root, index) =>
							index === rootIndex
								? {
										...root,
										activeGroupId: args.groupId,
									}
								: root,
						),
					},
				};
			});
		},
		setActivePane: (args) => {
			set((state) => {
				const rootIndex = state.state.roots.findIndex(
					(root) => root.id === args.rootId,
				);
				if (rootIndex === -1) return state;
				const root = getRootAtIndex(state.state.roots, rootIndex);
				if (!root) return state;

				const group = getGroupNode(root, args.groupId);
				if (!group || !group.panes.some((pane) => pane.id === args.paneId)) {
					return state;
				}

				return {
					state: {
						...state.state,
						roots: state.state.roots.map((root, index) =>
							index === rootIndex
								? {
										...updateGroupNode(root, args.groupId, (currentGroup) => ({
											...currentGroup,
											activePaneId: args.paneId,
										})),
										activeGroupId: args.groupId,
									}
								: root,
						),
						activeRootId: args.rootId,
					},
				};
			});
		},
		setPaneTitleOverride: (args) => {
			set((state) => {
				const rootIndex = state.state.roots.findIndex(
					(root) => root.id === args.rootId,
				);
				if (rootIndex === -1) return state;
				const root = getRootAtIndex(state.state.roots, rootIndex);
				if (!root) return state;

				const group = getGroupNode(root, args.groupId);
				if (!group || !group.panes.some((pane) => pane.id === args.paneId)) {
					return state;
				}

				return {
					state: {
						...state.state,
						roots: state.state.roots.map((root, index) =>
							index === rootIndex
								? updateGroupNode(root, args.groupId, (currentGroup) => ({
										...currentGroup,
										panes: currentGroup.panes.map((pane) =>
											pane.id === args.paneId
												? {
														...pane,
														titleOverride: args.titleOverride,
													}
												: pane,
										),
									}))
								: root,
						),
					},
				};
			});
		},
		setPanePinned: (args) => {
			set((state) => {
				const rootIndex = state.state.roots.findIndex(
					(root) => root.id === args.rootId,
				);
				if (rootIndex === -1) return state;
				const root = getRootAtIndex(state.state.roots, rootIndex);
				if (!root) return state;

				const group = getGroupNode(root, args.groupId);
				if (!group || !group.panes.some((pane) => pane.id === args.paneId)) {
					return state;
				}

				return {
					state: {
						...state.state,
						roots: state.state.roots.map((root, index) =>
							index === rootIndex
								? updateGroupNode(root, args.groupId, (currentGroup) => ({
										...currentGroup,
										panes: currentGroup.panes.map((pane) =>
											pane.id === args.paneId
												? { ...pane, pinned: args.pinned }
												: pane,
										),
									}))
								: root,
						),
					},
				};
			});
		},
		setPaneData: (args) => {
			set((state) => {
				const paneLocation = findPaneLocation(state.state, args.paneId);
				if (!paneLocation) return state;

				return {
					state: {
						...state.state,
						roots: state.state.roots.map((root) =>
							root.id === paneLocation.rootId
								? updateGroupNode(
										root,
										paneLocation.groupId,
										(currentGroup) => ({
											...currentGroup,
											panes: currentGroup.panes.map((pane) =>
												pane.id === args.paneId
													? { ...pane, data: args.data }
													: pane,
											),
										}),
									)
								: root,
						),
					},
				};
			});
		},
		addPaneToGroup: (args) => {
			set((state) => {
				const rootIndex = state.state.roots.findIndex(
					(root) => root.id === args.rootId,
				);
				if (rootIndex === -1) return state;
				const root = getRootAtIndex(state.state.roots, rootIndex);
				if (!root) return state;

				const group = getGroupNode(root, args.groupId);
				if (!group || group.panes.some((pane) => pane.id === args.pane.id)) {
					return state;
				}

				return {
					state: {
						...state.state,
						roots: state.state.roots.map((root, index) =>
							index === rootIndex
								? {
										...updateGroupNode(root, args.groupId, (currentGroup) => {
											const previewIndex = args.replaceUnpinned
												? currentGroup.panes.findIndex(
														(pane) => pane.pinned !== true,
													)
												: -1;
											const nextPanes = [...currentGroup.panes];

											if (previewIndex !== -1) {
												nextPanes.splice(previewIndex, 1, args.pane);
											} else {
												const insertAt =
													args.index == null
														? currentGroup.panes.length
														: Math.max(
																0,
																Math.min(args.index, currentGroup.panes.length),
															);
												nextPanes.splice(insertAt, 0, args.pane);
											}

											return {
												...currentGroup,
												panes: nextPanes,
												activePaneId:
													args.select === true ||
													currentGroup.activePaneId ===
														currentGroup.panes[previewIndex]?.id ||
													currentGroup.activePaneId == null
														? args.pane.id
														: currentGroup.activePaneId,
											};
										}),
										activeGroupId:
											args.select === true ? args.groupId : root.activeGroupId,
									}
								: root,
						),
						activeRootId: args.rootId,
					},
				};
			});
		},
		closePane: (args) => {
			set((state) => {
				const rootIndex = state.state.roots.findIndex(
					(root) => root.id === args.rootId,
				);
				if (rootIndex === -1) return state;
				const root = getRootAtIndex(state.state.roots, rootIndex);
				if (!root) return state;

				const group = getGroupNode(root, args.groupId);
				if (!group || !group.panes.some((pane) => pane.id === args.paneId)) {
					return state;
				}

				const nextRoots = state.state.roots
					.map((root, index) =>
						index === rootIndex
							? normalizeRootState(
									updateGroupNode(root, args.groupId, (currentGroup) => {
										const nextPanes = currentGroup.panes.filter(
											(pane) => pane.id !== args.paneId,
										);
										return {
											...currentGroup,
											panes: nextPanes,
											activePaneId:
												currentGroup.activePaneId === args.paneId
													? (nextPanes[0]?.id ?? null)
													: currentGroup.activePaneId,
										};
									}),
								)
							: root,
					)
					.filter((root): root is PaneRootState<TPaneData> => root !== null);

				return {
					state: {
						...state.state,
						roots: nextRoots,
						activeRootId: nextRoots.some(
							(root) => root.id === state.state.activeRootId,
						)
							? state.state.activeRootId
							: (nextRoots[0]?.id ?? null),
					},
				};
			});
		},
		movePane: (args) => {
			set((state) => {
				const source = findPaneLocation(state.state, args.paneId);
				if (!source) return state;

				const sourceRootIndex = state.state.roots.findIndex(
					(root) => root.id === source.rootId,
				);
				const targetRootIndex = state.state.roots.findIndex(
					(root) => root.id === args.targetRootId,
				);
				if (sourceRootIndex === -1 || targetRootIndex === -1) return state;
				const sourceRoot = getRootAtIndex(state.state.roots, sourceRootIndex);
				const targetRoot = getRootAtIndex(state.state.roots, targetRootIndex);
				if (!sourceRoot || !targetRoot) return state;

				const sourceGroup = getGroupNode(sourceRoot, source.groupId);
				const targetGroup = getGroupNode(targetRoot, args.targetGroupId);
				if (!sourceGroup || !targetGroup) return state;

				const sourcePaneIndex = sourceGroup.panes.findIndex(
					(pane) => pane.id === args.paneId,
				);
				if (sourcePaneIndex === -1) return state;
				const pane = sourceGroup.panes[sourcePaneIndex];
				if (!pane) return state;
				const nextSourceGroup = {
					...sourceGroup,
					panes: sourceGroup.panes.filter(
						(existingPane) => existingPane.id !== args.paneId,
					),
					activePaneId:
						sourceGroup.activePaneId === args.paneId
							? (sourceGroup.panes.find(
									(existingPane) => existingPane.id !== args.paneId,
								)?.id ?? null)
							: sourceGroup.activePaneId,
				};

				let nextState: PaneWorkspaceState<TPaneData> = {
					...state.state,
					roots: state.state.roots.map((root, index) =>
						index === sourceRootIndex
							? updateGroupNode(root, source.groupId, () => nextSourceGroup)
							: root,
					),
				};

				const adjustedTargetIndex =
					source.rootId === args.targetRootId &&
					source.groupId === args.targetGroupId &&
					args.index != null &&
					args.index > sourcePaneIndex
						? args.index - 1
						: args.index;

				nextState = {
					...nextState,
					roots: nextState.roots.map((root, index) => {
						if (index !== targetRootIndex) return root;

						const nextRoot = updateGroupNode(
							root,
							args.targetGroupId,
							(currentGroup) => {
								if (
									currentGroup.panes.some(
										(existingPane) => existingPane.id === pane.id,
									)
								) {
									return currentGroup;
								}

								const insertAt =
									adjustedTargetIndex == null
										? currentGroup.panes.length
										: Math.max(
												0,
												Math.min(
													adjustedTargetIndex,
													currentGroup.panes.length,
												),
											);
								const nextPanes = [...currentGroup.panes];
								nextPanes.splice(insertAt, 0, pane);

								return {
									...currentGroup,
									panes: nextPanes,
									activePaneId:
										args.select === true ? pane.id : currentGroup.activePaneId,
								};
							},
						);

						return {
							...nextRoot,
							activeGroupId:
								args.select === true
									? args.targetGroupId
									: nextRoot.activeGroupId,
						};
					}),
				};

				return {
					state: {
						...nextState,
						activeRootId: args.targetRootId,
					},
				};
			});
		},
		splitGroup: (args) => {
			set((state) => {
				const rootIndex = state.state.roots.findIndex(
					(root) => root.id === args.rootId,
				);
				if (rootIndex === -1) return state;
				const root = getRootAtIndex(state.state.roots, rootIndex);
				if (!root) return state;
				const path = findNodePathByGroupId(root.root, args.groupId);
				if (!path) return state;

				const node = getNodeAtPath(root.root, path);
				if (node.type !== "group") return state;

				const newGroup: PaneGroupNode<TPaneData> = {
					type: "group",
					id: generatePaneLayoutId("group"),
					activePaneId: args.newPane.id,
					panes: [args.newPane],
				};

				const children =
					args.position === "left" || args.position === "top"
						? [newGroup, node]
						: [node, newGroup];

				return {
					state: {
						...state.state,
						roots: state.state.roots.map((currentRoot, index) =>
							index === rootIndex
								? {
										...currentRoot,
										root: replaceNodeAtPath(currentRoot.root, path, {
											type: "split",
											id: generatePaneLayoutId("split"),
											direction:
												args.position === "left" || args.position === "right"
													? "horizontal"
													: "vertical",
											sizes: args.sizes ?? [50, 50],
											children,
										}),
										activeGroupId:
											args.selectNewPane === false
												? currentRoot.activeGroupId
												: newGroup.id,
									}
								: currentRoot,
						),
						activeRootId: args.rootId,
					},
				};
			});
		},
		resizeSplit: (args) => {
			set((state) => {
				const rootIndex = state.state.roots.findIndex(
					(root) => root.id === args.rootId,
				);
				if (rootIndex === -1) return state;
				const root = getRootAtIndex(state.state.roots, rootIndex);
				if (!root) return state;
				const path = findNodePathBySplitId(root.root, args.splitId);
				if (!path) return state;

				return {
					state: {
						...state.state,
						roots: state.state.roots.map((currentRoot, index) =>
							index === rootIndex
								? {
										...currentRoot,
										root: updateNodeAtPath(currentRoot.root, path, (node) => {
											if (node.type !== "split") {
												throw new Error("Expected split node");
											}
											return {
												...node,
												sizes: args.sizes,
											};
										}),
									}
								: currentRoot,
						),
					},
				};
			});
		},
		equalizeSplit: (args) => {
			set((state) => {
				const rootIndex = state.state.roots.findIndex(
					(root) => root.id === args.rootId,
				);
				if (rootIndex === -1) return state;
				const root = getRootAtIndex(state.state.roots, rootIndex);
				if (!root) return state;
				const path = findNodePathBySplitId(root.root, args.splitId);
				if (!path) return state;

				return {
					state: {
						...state.state,
						roots: state.state.roots.map((currentRoot, index) =>
							index === rootIndex
								? {
										...currentRoot,
										root: updateNodeAtPath(currentRoot.root, path, (node) => {
											if (node.type !== "split") {
												throw new Error("Expected split node");
											}

											return {
												...node,
												sizes: Array.from(
													{ length: node.children.length },
													() => 100 / node.children.length,
												),
											};
										}),
									}
								: currentRoot,
						),
					},
				};
			});
		},
	}));
}
