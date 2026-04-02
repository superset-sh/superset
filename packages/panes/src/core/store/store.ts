import { createStore, type StoreApi } from "zustand/vanilla";
import type {
	LayoutNode,
	Pane,
	SplitPosition,
	Tab,
	WorkspaceState,
} from "../../types";
import {
	findFirstPaneId,
	findPaneInLayout,
	generateId,
	removePaneFromLayout,
	replacePaneIdInLayout,
	splitPaneInLayout,
	updateSplitInLayout,
} from "./utils";

function buildPane<TData>(args: CreatePaneInput<TData>): Pane<TData> {
	return {
		id: args.id ?? generateId("pane"),
		kind: args.kind,
		titleOverride: args.titleOverride,
		pinned: args.pinned,
		data: args.data,
	};
}

function buildTab<TData>(args: {
	id?: string;
	titleOverride?: string;
	panes: [Pane<TData>, ...Pane<TData>[]];
	activePaneId?: string;
}): Tab<TData> {
	const panesMap: Record<string, Pane<TData>> = {};
	let layout: LayoutNode;

	if (args.panes.length === 1) {
		panesMap[args.panes[0].id] = args.panes[0];
		layout = { type: "pane", paneId: args.panes[0].id };
	} else {
		const children: LayoutNode[] = [];
		const weights: number[] = [];
		for (const pane of args.panes) {
			panesMap[pane.id] = pane;
			children.push({ type: "pane", paneId: pane.id });
			weights.push(1);
		}
		layout = {
			type: "split",
			id: generateId("split"),
			direction: "horizontal",
			children,
			weights,
		};
	}

	return {
		id: args.id ?? generateId("tab"),
		titleOverride: args.titleOverride,
		createdAt: Date.now(),
		activePaneId: args.activePaneId ?? args.panes[0].id,
		layout,
		panes: panesMap,
	};
}

// --- Public types ---

export type CreatePaneInput<TData> = {
	id?: string;
	kind: string;
	titleOverride?: string;
	pinned?: boolean;
	data: TData;
};

export type CreateTabInput<TData> = {
	id?: string;
	titleOverride?: string;
	panes: [CreatePaneInput<TData>, ...CreatePaneInput<TData>[]];
	activePaneId?: string;
};

export interface WorkspaceStore<TData> extends WorkspaceState<TData> {
	addTab: (args: CreateTabInput<TData>) => void;
	removeTab: (tabId: string) => void;
	setActiveTab: (tabId: string) => void;
	setTabTitleOverride: (args: {
		tabId: string;
		titleOverride?: string;
	}) => void;
	getTab: (tabId: string) => Tab<TData> | null;
	getActiveTab: () => Tab<TData> | null;

	setActivePane: (args: { tabId: string; paneId: string }) => void;
	getPane: (paneId: string) => { tabId: string; pane: Pane<TData> } | null;
	getActivePane: (
		tabId?: string,
	) => { tabId: string; pane: Pane<TData> } | null;
	closePane: (args: { tabId: string; paneId: string }) => void;
	setPaneData: (args: { paneId: string; data: TData }) => void;
	setPaneTitleOverride: (args: {
		tabId: string;
		paneId: string;
		titleOverride?: string;
	}) => void;
	setPanePinned: (args: {
		tabId: string;
		paneId: string;
		pinned: boolean;
	}) => void;
	replacePane: (args: {
		tabId: string;
		paneId: string;
		newPane: CreatePaneInput<TData>;
	}) => void;

	openPane: (args: { pane: CreatePaneInput<TData>; tabTitle?: string }) => void;

	splitPane: (args: {
		tabId: string;
		paneId: string;
		position: SplitPosition;
		newPane: CreatePaneInput<TData>;
		weights?: number[];
		selectNewPane?: boolean;
	}) => void;
	addPane: (args: {
		tabId: string;
		pane: CreatePaneInput<TData>;
		position?: SplitPosition;
		relativeToPaneId?: string;
	}) => void;
	resizeSplit: (args: {
		tabId: string;
		splitId: string;
		weights: number[];
	}) => void;
	equalizeSplit: (args: { tabId: string; splitId: string }) => void;

	movePaneToSplit: (args: {
		sourcePaneId: string;
		targetPaneId: string;
		position: SplitPosition;
	}) => void;

	reorderTab: (args: { tabId: string; toIndex: number }) => void;

	replaceState: (
		next:
			| WorkspaceState<TData>
			| ((prev: WorkspaceState<TData>) => WorkspaceState<TData>),
	) => void;
}

export interface CreateWorkspaceStoreOptions<TData> {
	initialState?: WorkspaceState<TData>;
}

export function createWorkspaceStore<TData>(
	options?: CreateWorkspaceStoreOptions<TData>,
): StoreApi<WorkspaceStore<TData>> {
	return createStore<WorkspaceStore<TData>>((set, get) => ({
		version: 1,
		tabs: options?.initialState?.tabs ?? [],
		activeTabId: options?.initialState?.activeTabId ?? null,

		addTab: (args) => {
			const builtPanes = args.panes.map(buildPane) as [
				Pane<TData>,
				...Pane<TData>[],
			];
			const tab = buildTab({ ...args, panes: builtPanes });
			set((s) => ({
				tabs: [...s.tabs, tab],
				activeTabId: s.activeTabId ?? tab.id,
			}));
		},

		removeTab: (tabId) => {
			set((s) => {
				const nextTabs = s.tabs.filter((t) => t.id !== tabId);
				return {
					tabs: nextTabs,
					activeTabId:
						s.activeTabId === tabId ? (nextTabs[0]?.id ?? null) : s.activeTabId,
				};
			});
		},

		setActiveTab: (tabId) => {
			set((s) => {
				if (!s.tabs.some((t) => t.id === tabId)) return s;
				return { activeTabId: tabId };
			});
		},

		setTabTitleOverride: (args) => {
			set((s) => ({
				tabs: s.tabs.map((t) =>
					t.id === args.tabId ? { ...t, titleOverride: args.titleOverride } : t,
				),
			}));
		},

		getTab: (tabId) => get().tabs.find((t) => t.id === tabId) ?? null,

		getActiveTab: () => {
			const s = get();
			return s.tabs.find((t) => t.id === s.activeTabId) ?? null;
		},

		setActivePane: (args) => {
			set((s) => {
				const tab = s.tabs.find((t) => t.id === args.tabId);
				if (!tab || !tab.panes[args.paneId]) return s;

				return {
					activeTabId: args.tabId,
					tabs: s.tabs.map((t) =>
						t.id === args.tabId ? { ...t, activePaneId: args.paneId } : t,
					),
				};
			});
		},

		getPane: (paneId) => {
			for (const tab of get().tabs) {
				const pane = tab.panes[paneId];
				if (pane) return { tabId: tab.id, pane };
			}
			return null;
		},

		getActivePane: (tabId) => {
			const s = get();
			const tab = tabId
				? s.tabs.find((t) => t.id === tabId)
				: s.tabs.find((t) => t.id === s.activeTabId);
			if (!tab || !tab.activePaneId) return null;

			const pane = tab.panes[tab.activePaneId];
			if (!pane) return null;

			return { tabId: tab.id, pane };
		},

		closePane: (args) => {
			set((s) => {
				const tab = s.tabs.find((t) => t.id === args.tabId);
				if (!tab || !tab.panes[args.paneId] || !tab.layout) return s;

				const nextLayout = removePaneFromLayout(tab.layout, args.paneId);
				const { [args.paneId]: _, ...nextPanes } = tab.panes;

				if (!nextLayout) {
					const nextTabs = s.tabs.filter((t) => t.id !== args.tabId);
					return {
						tabs: nextTabs,
						activeTabId:
							s.activeTabId === args.tabId
								? (nextTabs[0]?.id ?? null)
								: s.activeTabId,
					};
				}

				return {
					tabs: s.tabs.map((t) =>
						t.id === args.tabId
							? {
									...tab,
									layout: nextLayout,
									panes: nextPanes,
									activePaneId:
										tab.activePaneId === args.paneId
											? findFirstPaneId(nextLayout)
											: tab.activePaneId,
								}
							: t,
					),
				};
			});
		},

		setPaneData: (args) => {
			set((s) => {
				const location = get().getPane(args.paneId);
				if (!location) return s;

				return {
					tabs: s.tabs.map((t) =>
						t.id === location.tabId
							? {
									...t,
									panes: {
										...t.panes,
										[args.paneId]: {
											...location.pane,
											data: args.data,
										},
									},
								}
							: t,
					),
				};
			});
		},

		setPaneTitleOverride: (args) => {
			set((s) => {
				const tab = s.tabs.find((t) => t.id === args.tabId);
				const pane = tab?.panes[args.paneId];
				if (!tab || !pane) return s;

				return {
					tabs: s.tabs.map((t) =>
						t.id === args.tabId
							? {
									...t,
									panes: {
										...t.panes,
										[args.paneId]: {
											...pane,
											titleOverride: args.titleOverride,
										},
									},
								}
							: t,
					),
				};
			});
		},

		setPanePinned: (args) => {
			set((s) => {
				const tab = s.tabs.find((t) => t.id === args.tabId);
				const pane = tab?.panes[args.paneId];
				if (!tab || !pane) return s;

				return {
					tabs: s.tabs.map((t) =>
						t.id === args.tabId
							? {
									...t,
									panes: {
										...t.panes,
										[args.paneId]: {
											...pane,
											pinned: args.pinned,
										},
									},
								}
							: t,
					),
				};
			});
		},

		replacePane: (args) => {
			set((s) => {
				const tab = s.tabs.find((t) => t.id === args.tabId);
				const pane = tab?.panes[args.paneId];
				if (!tab || !pane || !tab.layout) return s;
				if (pane.pinned) return s;

				const { layout } = tab;
				const newPane = buildPane(args.newPane);
				const { [args.paneId]: _, ...restPanes } = tab.panes;

				return {
					tabs: s.tabs.map((t) =>
						t.id === args.tabId
							? {
									...tab,
									layout: replacePaneIdInLayout(
										layout,
										args.paneId,
										newPane.id,
									),
									panes: { ...restPanes, [newPane.id]: newPane },
									activePaneId:
										tab.activePaneId === args.paneId
											? newPane.id
											: tab.activePaneId,
								}
							: t,
					),
				};
			});
		},

		openPane: (args) => {
			const s = get();
			const activeTabId = s.activeTabId;
			const tab = activeTabId ? s.tabs.find((t) => t.id === activeTabId) : null;

			// No tab → create one
			if (!tab || !activeTabId) {
				get().addTab({
					titleOverride: args.tabTitle,
					panes: [args.pane],
				});
				return;
			}

			// Find unpinned pane of same kind → replace
			const unpinned = Object.values(tab.panes).find(
				(p) => p.kind === args.pane.kind && !p.pinned,
			);
			if (unpinned) {
				get().replacePane({
					tabId: activeTabId,
					paneId: unpinned.id,
					newPane: args.pane,
				});
				return;
			}

			// Split the active pane right
			const activePane = tab.activePaneId;
			if (
				activePane &&
				tab.layout &&
				findPaneInLayout(tab.layout, activePane)
			) {
				get().splitPane({
					tabId: activeTabId,
					paneId: activePane,
					position: "right",
					newPane: args.pane,
				});
				return;
			}

			// Fallback: add to tab
			get().addPane({
				tabId: activeTabId,
				pane: args.pane,
			});
		},

		splitPane: (args) => {
			set((s) => {
				const tab = s.tabs.find((t) => t.id === args.tabId);
				if (!tab || !tab.layout) return s;
				if (
					!tab.panes[args.paneId] ||
					!findPaneInLayout(tab.layout, args.paneId)
				)
					return s;

				const { layout } = tab;
				const newPane = buildPane(args.newPane);

				return {
					tabs: s.tabs.map((t) =>
						t.id === args.tabId
							? {
									...tab,
									layout: splitPaneInLayout(
										layout,
										args.paneId,
										newPane.id,
										args.position,
										args.weights,
									),
									panes: {
										...tab.panes,
										[newPane.id]: newPane,
									},
									activePaneId:
										args.selectNewPane === false
											? tab.activePaneId
											: newPane.id,
								}
							: t,
					),
				};
			});
		},

		addPane: (args) => {
			set((s) => {
				const tab = s.tabs.find((t) => t.id === args.tabId);
				if (!tab) return s;

				const newPane = buildPane(args.pane);

				if (!tab.layout) {
					return {
						tabs: s.tabs.map((t) =>
							t.id === args.tabId
								? {
										...tab,
										layout: {
											type: "pane",
											paneId: newPane.id,
										} satisfies LayoutNode,
										panes: {
											...tab.panes,
											[newPane.id]: newPane,
										},
										activePaneId: newPane.id,
									}
								: t,
						),
					};
				}

				const position = args.position ?? "right";
				const targetPaneId = args.relativeToPaneId ?? tab.activePaneId;

				const { layout } = tab;

				if (targetPaneId && findPaneInLayout(layout, targetPaneId)) {
					return {
						tabs: s.tabs.map((t) =>
							t.id === args.tabId
								? {
										...tab,
										layout: splitPaneInLayout(
											layout,
											targetPaneId,
											newPane.id,
											position,
										),
										panes: {
											...tab.panes,
											[newPane.id]: newPane,
										},
										activePaneId: newPane.id,
									}
								: t,
						),
					};
				}

				const newPaneLeaf: LayoutNode = {
					type: "pane",
					paneId: newPane.id,
				};
				const edgeLayout: LayoutNode = {
					type: "split",
					id: generateId("split"),
					direction:
						position === "left" || position === "right"
							? "horizontal"
							: "vertical",
					children:
						position === "left" || position === "top"
							? [newPaneLeaf, layout]
							: [layout, newPaneLeaf],
					weights: [1, 1],
				};

				return {
					tabs: s.tabs.map((t) =>
						t.id === args.tabId
							? {
									...tab,
									layout: edgeLayout,
									panes: {
										...tab.panes,
										[newPane.id]: newPane,
									},
									activePaneId: newPane.id,
								}
							: t,
					),
				};
			});
		},

		resizeSplit: (args) => {
			set((s) => {
				const tab = s.tabs.find((t) => t.id === args.tabId);
				if (!tab || !tab.layout) return s;

				const { layout } = tab;

				return {
					tabs: s.tabs.map((t) =>
						t.id === args.tabId
							? {
									...t,
									layout: updateSplitInLayout(
										layout,
										args.splitId,
										(split) => ({
											...split,
											weights: args.weights,
										}),
									),
								}
							: t,
					),
				};
			});
		},

		equalizeSplit: (args) => {
			set((s) => {
				const tab = s.tabs.find((t) => t.id === args.tabId);
				if (!tab || !tab.layout) return s;

				const { layout } = tab;

				return {
					tabs: s.tabs.map((t) =>
						t.id === args.tabId
							? {
									...t,
									layout: updateSplitInLayout(
										layout,
										args.splitId,
										(split) => ({
											...split,
											weights: split.children.map(() => 1),
										}),
									),
								}
							: t,
					),
				};
			});
		},

		movePaneToSplit: (args) => {
			set((s) => {
				// Find source and target tabs by pane ID
				let sourceTab: Tab<TData> | undefined;
				let sourcePane: Pane<TData> | undefined;
				let targetTab: Tab<TData> | undefined;
				for (const t of s.tabs) {
					if (t.panes[args.sourcePaneId]) {
						sourceTab = t;
						sourcePane = t.panes[args.sourcePaneId];
					}
					if (t.panes[args.targetPaneId]) {
						targetTab = t;
					}
				}
				if (!sourceTab || !sourcePane) return s;
				if (!targetTab || !targetTab.layout) return s;
				if (!findPaneInLayout(targetTab.layout, args.targetPaneId)) return s;

				// Don't drop on self
				if (args.sourcePaneId === args.targetPaneId) return s;

				// Remove from source layout
				const nextSourceLayout = removePaneFromLayout(
					sourceTab.layout,
					args.sourcePaneId,
				);
				const { [args.sourcePaneId]: _, ...nextSourcePanes } = sourceTab.panes;

				// Insert into target layout
				const nextTargetLayout = splitPaneInLayout(
					// If same tab, use the already-modified layout
					sourceTab.id === targetTab.id && nextSourceLayout
						? nextSourceLayout
						: targetTab.layout,
					args.targetPaneId,
					sourcePane.id,
					args.position,
				);

				const nextTabs = s.tabs
					.map((t) => {
						if (sourceTab.id === targetTab.id && t.id === sourceTab.id) {
							// Same-tab move
							if (!nextSourceLayout) return null; // shouldn't happen since we check targetPaneId != sourcePaneId
							return {
								...t,
								layout: nextTargetLayout,
								panes: { ...nextSourcePanes, [sourcePane.id]: sourcePane },
								activePaneId: sourcePane.id,
							};
						}
						if (t.id === sourceTab.id) {
							// Source tab — pane removed
							if (!nextSourceLayout) return null; // last pane removed, tab will be filtered
							return {
								...t,
								layout: nextSourceLayout,
								panes: nextSourcePanes,
								activePaneId:
									t.activePaneId === args.sourcePaneId
										? findFirstPaneId(nextSourceLayout)
										: t.activePaneId,
							};
						}
						if (t.id === targetTab.id) {
							// Target tab — pane added
							return {
								...t,
								layout: nextTargetLayout,
								panes: { ...t.panes, [sourcePane.id]: sourcePane },
								activePaneId: sourcePane.id,
							};
						}
						return t;
					})
					.filter((t): t is Tab<TData> => t !== null);

				return {
					tabs: nextTabs,
					activeTabId: targetTab.id,
				};
			});
		},

		reorderTab: (args) => {
			set((s) => {
				const fromIndex = s.tabs.findIndex((t) => t.id === args.tabId);
				if (fromIndex === -1) return s;
				const toIndex = Math.max(0, Math.min(args.toIndex, s.tabs.length - 1));
				if (fromIndex === toIndex) return s;
				const nextTabs = [...s.tabs];
				const [tab] = nextTabs.splice(fromIndex, 1);
				if (!tab) return s;
				nextTabs.splice(toIndex, 0, tab);
				return { tabs: nextTabs };
			});
		},

		replaceState: (next) => {
			set((s) => {
				const resolved =
					typeof next === "function"
						? next({
								version: s.version,
								tabs: s.tabs,
								activeTabId: s.activeTabId,
							})
						: next;
				return {
					version: resolved.version,
					tabs: resolved.tabs,
					activeTabId: resolved.activeTabId,
				};
			});
		},
	}));
}
