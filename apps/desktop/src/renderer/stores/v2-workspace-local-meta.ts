import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface WorkspaceMeta {
	tabOrder: number;
	sectionId: string | null;
}

interface V2WorkspaceLocalMetaState {
	workspaces: Record<string, WorkspaceMeta>;
	sortVersion: number;

	getWorkspaceMeta: (id: string) => WorkspaceMeta;
	setWorkspaceTabOrder: (id: string, order: number) => void;
	bumpSortVersion: () => void;
}

const DEFAULT_WORKSPACE_META: WorkspaceMeta = {
	tabOrder: 0,
	sectionId: null,
};

export const useV2WorkspaceLocalMetaStore = create<V2WorkspaceLocalMetaState>()(
	devtools(
		persist(
			(set, get) => ({
				workspaces: {},
				sortVersion: 0,

				getWorkspaceMeta: (id) => {
					return get().workspaces[id] ?? DEFAULT_WORKSPACE_META;
				},

				setWorkspaceTabOrder: (id, order) => {
					set((state) => {
						const current = state.workspaces[id] ?? DEFAULT_WORKSPACE_META;
						return {
							workspaces: {
								...state.workspaces,
								[id]: { ...current, tabOrder: order },
							},
						};
					});
				},

				bumpSortVersion: () => {
					set((state) => ({ sortVersion: state.sortVersion + 1 }));
				},
			}),
			{
				name: "v2-workspace-local-meta",
				version: 1,
				partialize: (state) => ({ workspaces: state.workspaces }),
			},
		),
		{ name: "V2WorkspaceLocalMetaStore" },
	),
);
