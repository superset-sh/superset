import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { WorkspaceRef, TabGroupTemplate, ConfigSchema } from "shared/electron-store";

interface ConfigState extends ConfigSchema {
	// ========================================
	// WORKSPACE ACTIONS
	// ========================================
	addWorkspace: (workspace: WorkspaceRef) => void;
	updateWorkspace: (id: string, updates: Partial<WorkspaceRef>) => void;
	deleteWorkspace: (id: string) => void;
	setLastWorkspace: (id: string | null) => void;

	// ========================================
	// TEMPLATE ACTIONS
	// ========================================
	addTemplate: (template: TabGroupTemplate) => void;
	updateTemplate: (id: string, updates: Partial<TabGroupTemplate>) => void;
	deleteTemplate: (id: string) => void;
}

// Custom storage adapter for electron-store via IPC
const electronStorage = {
	getItem: async (name: string): Promise<string | null> => {
		const config = await window.electronAPI.config.get();
		return JSON.stringify(config);
	},
	setItem: async (name: string, value: string): Promise<void> => {
		const data = JSON.parse(value);
		await window.electronAPI.config.set(data);
	},
	removeItem: async (name: string): Promise<void> => {
		// Not needed for our use case
	},
};

export const useConfigStore = create<ConfigState>()(
	persist(
		(set) => ({
			// ========================================
			// INITIAL STATE (will be loaded from main process via persist middleware)
			// ========================================
			workspaces: [],
			lastWorkspaceId: null,
			tabGroupTemplates: [],

			// ========================================
			// WORKSPACE ACTIONS (persist middleware auto-syncs to main process)
			// ========================================
			addWorkspace: (workspace) => {
				set((state) => ({
					workspaces: [...state.workspaces, workspace],
				}));
			},

			updateWorkspace: (id, updates) => {
				set((state) => ({
					workspaces: state.workspaces.map((w) =>
						w.id === id ? { ...w, ...updates } : w,
					),
				}));
			},

			deleteWorkspace: (id) => {
				set((state) => ({
					workspaces: state.workspaces.filter((w) => w.id !== id),
					lastWorkspaceId:
						state.lastWorkspaceId === id ? null : state.lastWorkspaceId,
				}));
			},

			setLastWorkspace: (id) => {
				set({ lastWorkspaceId: id });
			},

			// ========================================
			// TEMPLATE ACTIONS (persist middleware auto-syncs to main process)
			// ========================================
			addTemplate: (template) => {
				set((state) => ({
					tabGroupTemplates: [...state.tabGroupTemplates, template],
				}));
			},

			updateTemplate: (id, updates) => {
				set((state) => ({
					tabGroupTemplates: state.tabGroupTemplates.map((t) =>
						t.id === id ? { ...t, ...updates } : t,
					),
				}));
			},

			deleteTemplate: (id) => {
				set((state) => ({
					tabGroupTemplates: state.tabGroupTemplates.filter((t) => t.id !== id),
				}));
			},
		}),
		{
			name: "config",
			storage: createJSONStorage(() => electronStorage),
			// Only persist the data properties, not the action functions
			partialize: (state) => ({
				workspaces: state.workspaces,
				lastWorkspaceId: state.lastWorkspaceId,
				tabGroupTemplates: state.tabGroupTemplates,
			}),
		},
	),
);

/**
 * Promise that resolves when the store has been hydrated from electron-store
 * Use this to wait for initial load before accessing store state
 */
export const storeHydrated = new Promise<void>((resolve) => {
	// The persist middleware will automatically load state on first access
	// We can subscribe to check when hydration is complete
	const unsubscribe = useConfigStore.persist.onFinishHydration(() => {
		unsubscribe();
		resolve();
	});
});
