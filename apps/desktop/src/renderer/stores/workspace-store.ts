import { create } from "zustand";
import type { Tab, TabGroup, Worktree, Workspace } from "shared/runtime-types";

// Re-export runtime types for convenience
export type { Tab, TabGroup, Worktree, Workspace } from "shared/runtime-types";

// ========================================
// STORE
// ========================================

interface WorkspaceState {
	// ========================================
	// RUNTIME STATE (NOT persisted - resets on app restart)
	// ========================================
	currentWorkspace: Workspace | null;
	activeWorktreeId: string | null;
	activeTabGroupId: string | null;
	activeTabId: string | null;
	loading: boolean;
	error: string | null;

	// ========================================
	// DERIVED GETTERS
	// ========================================
	getActiveWorktree: () => Worktree | null;
	getActiveTabGroup: () => TabGroup | null;

	// ========================================
	// ACTIONS
	// ========================================
	setCurrentWorkspace: (workspace: Workspace | null) => void;
	setActiveSelection: (
		worktreeId: string | null,
		tabGroupId: string | null,
		tabId: string | null,
	) => void;
	updateWorktree: (worktreeId: string, updates: Partial<Worktree>) => void;
	updateTabGroup: (
		worktreeId: string,
		tabGroupId: string,
		updates: Partial<TabGroup>,
	) => void;
	updateTab: (
		worktreeId: string,
		tabGroupId: string,
		tabId: string,
		updates: Partial<Tab>,
	) => void;
	setLoading: (loading: boolean) => void;
	setError: (error: string | null) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
	// ========================================
	// INITIAL STATE
	// ========================================
	currentWorkspace: null,
	activeWorktreeId: null,
	activeTabGroupId: null,
	activeTabId: null,
	loading: false,
	error: null,

	// ========================================
	// DERIVED GETTERS
	// ========================================
	getActiveWorktree: () => {
		const { currentWorkspace, activeWorktreeId } = get();
		if (!currentWorkspace || !activeWorktreeId) return null;
		return (
			currentWorkspace.worktrees.find((wt) => wt.id === activeWorktreeId) ||
			null
		);
	},

	getActiveTabGroup: () => {
		const activeWorktree = get().getActiveWorktree();
		const { activeTabGroupId } = get();
		if (!activeWorktree || !activeTabGroupId) return null;
		return (
			activeWorktree.tabGroups.find((tg) => tg.id === activeTabGroupId) || null
		);
	},

	// ========================================
	// ACTIONS
	// ========================================
	setCurrentWorkspace: (workspace) =>
		set({
			currentWorkspace: workspace,
		}),

	setActiveSelection: (worktreeId, tabGroupId, tabId) =>
		set({
			activeWorktreeId: worktreeId,
			activeTabGroupId: tabGroupId,
			activeTabId: tabId,
		}),

	updateWorktree: (worktreeId, updates) =>
		set((state) => {
			if (!state.currentWorkspace) return state;

			return {
				currentWorkspace: {
					...state.currentWorkspace,
					worktrees: state.currentWorkspace.worktrees.map((wt) =>
						wt.id === worktreeId ? { ...wt, ...updates } : wt,
					),
					updatedAt: new Date().toISOString(),
				},
			};
		}),

	updateTabGroup: (worktreeId, tabGroupId, updates) =>
		set((state) => {
			if (!state.currentWorkspace) return state;

			return {
				currentWorkspace: {
					...state.currentWorkspace,
					worktrees: state.currentWorkspace.worktrees.map((wt) =>
						wt.id === worktreeId
							? {
									...wt,
									tabGroups: wt.tabGroups.map((tg) =>
										tg.id === tabGroupId ? { ...tg, ...updates } : tg,
									),
								}
							: wt,
					),
					updatedAt: new Date().toISOString(),
				},
			};
		}),

	updateTab: (worktreeId, tabGroupId, tabId, updates) =>
		set((state) => {
			if (!state.currentWorkspace) return state;

			return {
				currentWorkspace: {
					...state.currentWorkspace,
					worktrees: state.currentWorkspace.worktrees.map((wt) =>
						wt.id === worktreeId
							? {
									...wt,
									tabGroups: wt.tabGroups.map((tg) =>
										tg.id === tabGroupId
											? {
													...tg,
													tabs: tg.tabs.map((t) =>
														t.id === tabId ? { ...t, ...updates } : t,
													),
												}
											: tg,
									),
								}
							: wt,
					),
					updatedAt: new Date().toISOString(),
				},
			};
		}),

	setLoading: (loading) => set({ loading }),
	setError: (error) => set({ error }),
}));
