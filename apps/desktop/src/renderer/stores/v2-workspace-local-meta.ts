import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface WorkspaceMeta {
	tabOrder: number;
	sectionId: string | null;
}

interface V2WorkspaceLocalMetaState {
	workspaces: Record<string, WorkspaceMeta>;

	getWorkspaceMeta: (id: string) => WorkspaceMeta;
	setWorkspaceTabOrder: (id: string, order: number) => void;
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
			}),
			{
				name: "v2-workspace-local-meta",
				version: 1,
			},
		),
		{ name: "V2WorkspaceLocalMetaStore" },
	),
);
