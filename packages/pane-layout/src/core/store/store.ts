import { createStore, type StoreApi } from "zustand/vanilla";
import type {
	PaneGroupNode,
	PaneRootState,
	PaneSplitDirection,
	PaneSplitPosition,
	PaneState,
	PersistedPaneWorkspaceState,
} from "../../types";
import {
	clampInsertIndex,
	findPaneLocation,
	findNodePathByGroupId,
	findNodePathBySplitId,
	findRootIndex,
	getGroupNode,
	getNodeAtPath,
	removePaneFromGroupNode,
	replaceNodeAtPath,
	updateGroupNode,
	updateNodeAtPath,
	withUpdatedRootAt,
} from "./utils";

export interface PaneWorkspaceStoreState<TPaneData> {
	persisted: PersistedPaneWorkspaceState<TPaneData>;
}

export interface CreatePaneWorkspaceStoreOptions<TPaneData> {
	initialPersistedState: PersistedPaneWorkspaceState<TPaneData>;
}

export interface PaneWorkspaceStore<TPaneData>
	extends PaneWorkspaceStoreState<TPaneData> {
	setPersistedState: (
		next:
			| PersistedPaneWorkspaceState<TPaneData>
			| ((
					prev: PersistedPaneWorkspaceState<TPaneData>,
			  ) => PersistedPaneWorkspaceState<TPaneData>),
	) => void;
	rehydrate: (state: PersistedPaneWorkspaceState<TPaneData>) => void;
	addRoot: (root: PaneRootState<TPaneData>) => void;
	removeRoot: (rootId: string) => void;
	setActiveRoot: (rootId: string) => void;
	setActiveGroup: (args: { rootId: string; groupId: string }) => void;
	setActivePane: (args: {
		rootId: string;
		groupId: string;
		paneId: string;
	}) => void;
	addPaneToGroup: (args: {
		rootId: string;
		groupId: string;
		pane: PaneState<TPaneData>;
		index?: number;
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
		newGroupId: string;
		newPane: PaneState<TPaneData>;
		selectNewPane?: boolean;
		splitId?: string;
		sizes?: number[];
	}) => void;
	resizeSplit: (args: {
		rootId: string;
		splitId: string;
		sizes: number[];
	}) => void;
}

export function createPaneRoot<TPaneData>({
	id,
	groupId,
	panes,
	activePaneId,
}: {
	id: string;
	groupId: string;
	panes: Array<PaneState<TPaneData>>;
	activePaneId?: string | null;
}): PaneRootState<TPaneData> {
	return {
		id,
		root: {
			type: "group",
			id: groupId,
			activePaneId: activePaneId ?? panes[0]?.id ?? null,
			panes,
		},
		activeGroupId: groupId,
	};
}

export function createPaneWorkspaceState<TPaneData>({
	roots,
	activeRootId,
}: {
	roots: Array<PaneRootState<TPaneData>>;
	activeRootId?: string | null;
}): PersistedPaneWorkspaceState<TPaneData> {
	return {
		version: 1,
		roots,
		activeRootId: activeRootId ?? roots[0]?.id ?? null,
	};
}

function splitDirectionForPosition(position: PaneSplitPosition): PaneSplitDirection {
	return position === "left" || position === "right" ? "horizontal" : "vertical";
}

export function createPaneWorkspaceStore<TPaneData>(
	options: CreatePaneWorkspaceStoreOptions<TPaneData>,
): StoreApi<PaneWorkspaceStore<TPaneData>> {
	return createStore<PaneWorkspaceStore<TPaneData>>((set) => ({
		persisted: options.initialPersistedState,
		setPersistedState: (next) => {
			set((state) => ({
				persisted:
					typeof next === "function" ? next(state.persisted) : next,
			}));
		},
		rehydrate: (state) => {
			set({ persisted: state });
		},
		addRoot: (root) => {
			set((state) => ({
				persisted: {
					...state.persisted,
					roots: [...state.persisted.roots, root],
					activeRootId: state.persisted.activeRootId ?? root.id,
				},
			}));
		},
		removeRoot: (rootId) => {
			set((state) => ({
				persisted: {
					...state.persisted,
					roots: state.persisted.roots.filter((root) => root.id !== rootId),
					activeRootId:
						state.persisted.activeRootId === rootId
							? state.persisted.roots.filter((root) => root.id !== rootId)[0]?.id ??
							  null
							: state.persisted.activeRootId,
				},
			}));
		},
		setActiveRoot: (rootId) => {
			set((state) => ({
				persisted: state.persisted.roots.some((root) => root.id === rootId)
					? { ...state.persisted, activeRootId: rootId }
					: state.persisted,
			}));
		},
		setActiveGroup: (args) => {
			set((state) => {
				const rootIndex = findRootIndex(state.persisted, args.rootId);
				if (rootIndex === -1) return state;
				if (!getGroupNode(state.persisted.roots[rootIndex]!, args.groupId)) {
					return state;
				}

				return {
					persisted: withUpdatedRootAt(
						state.persisted,
						rootIndex,
						(root) => ({
							...root,
							activeGroupId: args.groupId,
						}),
					),
				};
			});
		},
		setActivePane: (args) => {
			set((state) => {
				const rootIndex = findRootIndex(state.persisted, args.rootId);
				if (rootIndex === -1) return state;

				const group = getGroupNode(state.persisted.roots[rootIndex]!, args.groupId);
				if (!group || !group.panes.some((pane) => pane.id === args.paneId)) {
					return state;
				}

				return {
					persisted: {
						...withUpdatedRootAt(state.persisted, rootIndex, (root) => ({
							...updateGroupNode(root, args.groupId, (currentGroup) => ({
								...currentGroup,
								activePaneId: args.paneId,
							})),
							activeGroupId: args.groupId,
						})),
						activeRootId: args.rootId,
					},
				};
			});
		},
		addPaneToGroup: (args) => {
			set((state) => {
				const rootIndex = findRootIndex(state.persisted, args.rootId);
				if (rootIndex === -1) return state;

				const group = getGroupNode(state.persisted.roots[rootIndex]!, args.groupId);
				if (!group || group.panes.some((pane) => pane.id === args.pane.id)) {
					return state;
				}

				return {
					persisted: {
						...withUpdatedRootAt(state.persisted, rootIndex, (root) => ({
							...updateGroupNode(root, args.groupId, (currentGroup) => {
								const insertAt = clampInsertIndex(
									args.index,
									currentGroup.panes.length,
								);
								const nextPanes = [...currentGroup.panes];
								nextPanes.splice(insertAt, 0, args.pane);

								return {
									...currentGroup,
									panes: nextPanes,
									activePaneId:
										args.select === true || currentGroup.activePaneId == null
											? args.pane.id
											: currentGroup.activePaneId,
								};
							}),
							activeGroupId:
								args.select === true ? args.groupId : root.activeGroupId,
						})),
						activeRootId: args.rootId,
					},
				};
			});
		},
		closePane: (args) => {
			set((state) => {
				const rootIndex = findRootIndex(state.persisted, args.rootId);
				if (rootIndex === -1) return state;

				const group = getGroupNode(state.persisted.roots[rootIndex]!, args.groupId);
				if (!group || !group.panes.some((pane) => pane.id === args.paneId)) {
					return state;
				}

				return {
					persisted: {
						...withUpdatedRootAt(state.persisted, rootIndex, (root) =>
							updateGroupNode(root, args.groupId, (currentGroup) => {
								const nextPanes = currentGroup.panes.filter(
									(pane) => pane.id !== args.paneId,
								);
								return {
									...currentGroup,
									panes: nextPanes,
									activePaneId:
										currentGroup.activePaneId === args.paneId
											? nextPanes[0]?.id ?? null
											: currentGroup.activePaneId,
								};
							}),
						),
						activeRootId: args.rootId,
					},
				};
			});
		},
		movePane: (args) => {
			set((state) => {
				const source = findPaneLocation(state.persisted, args.paneId);
				if (!source) return state;

				const sourceRootIndex = findRootIndex(state.persisted, source.rootId);
				const targetRootIndex = findRootIndex(state.persisted, args.targetRootId);
				if (sourceRootIndex === -1 || targetRootIndex === -1) return state;

				const sourceGroup = getGroupNode(
					state.persisted.roots[sourceRootIndex]!,
					source.groupId,
				);
				const targetGroup = getGroupNode(
					state.persisted.roots[targetRootIndex]!,
					args.targetGroupId,
				);
				if (!sourceGroup || !targetGroup) return state;

				const removal = removePaneFromGroupNode(sourceGroup, args.paneId);
				if (!removal.pane) return state;

				let nextPersisted = withUpdatedRootAt(
					state.persisted,
					sourceRootIndex,
					(root) => updateGroupNode(root, source.groupId, () => removal.group),
				);

				const adjustedTargetIndex =
					source.rootId === args.targetRootId &&
					source.groupId === args.targetGroupId &&
					args.index != null &&
					args.index > removal.paneIndex
						? args.index - 1
						: args.index;

				nextPersisted = withUpdatedRootAt(nextPersisted, targetRootIndex, (root) => {
					const nextRoot = updateGroupNode(root, args.targetGroupId, (currentGroup) => {
						if (
							currentGroup.panes.some(
								(pane) => pane.id === removal.pane?.id,
							)
						) {
							return currentGroup;
						}

						const insertAt = clampInsertIndex(
							adjustedTargetIndex,
							currentGroup.panes.length,
						);
						const nextPanes = [...currentGroup.panes];
						nextPanes.splice(insertAt, 0, removal.pane!);

						return {
							...currentGroup,
							panes: nextPanes,
							activePaneId:
								args.select === true
									? removal.pane!.id
									: currentGroup.activePaneId,
						};
					});

					return {
						...nextRoot,
						activeGroupId:
							args.select === true ? args.targetGroupId : nextRoot.activeGroupId,
					};
				});

				return {
					persisted: {
						...nextPersisted,
						activeRootId: args.targetRootId,
					},
				};
			});
		},
		splitGroup: (args) => {
			set((state) => {
				const rootIndex = findRootIndex(state.persisted, args.rootId);
				if (rootIndex === -1) return state;

				const root = state.persisted.roots[rootIndex]!;
				const path = findNodePathByGroupId(root.root, args.groupId);
				if (!path) return state;

				const node = getNodeAtPath(root.root, path);
				if (node.type !== "group") return state;

				const newGroup: PaneGroupNode<TPaneData> = {
					type: "group",
					id: args.newGroupId,
					activePaneId: args.newPane.id,
					panes: [args.newPane],
				};

				const children =
					args.position === "left" || args.position === "top"
						? [newGroup, node]
						: [node, newGroup];

				return {
					persisted: {
						...withUpdatedRootAt(state.persisted, rootIndex, (currentRoot) => ({
							...currentRoot,
							root: replaceNodeAtPath(currentRoot.root, path, {
								type: "split",
								id: args.splitId ?? `${args.groupId}:${args.newGroupId}`,
								direction: splitDirectionForPosition(args.position),
								sizes: args.sizes ?? [50, 50],
								children,
							}),
							activeGroupId:
								args.selectNewPane === false
									? currentRoot.activeGroupId
									: args.newGroupId,
						})),
						activeRootId: args.rootId,
					},
				};
			});
		},
		resizeSplit: (args) => {
			set((state) => {
				const rootIndex = findRootIndex(state.persisted, args.rootId);
				if (rootIndex === -1) return state;

				const root = state.persisted.roots[rootIndex]!;
				const path = findNodePathBySplitId(root.root, args.splitId);
				if (!path) return state;

				return {
					persisted: withUpdatedRootAt(state.persisted, rootIndex, (currentRoot) => ({
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
					})),
				};
			});
		},
	}));
}
