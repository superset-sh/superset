import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { electronStorage } from "../lib/electron-storage";

export interface Workspace {
	id: string;
	title: string;
	isNew?: boolean;
}

interface WorkspacesState {
	workspaces: Workspace[];
	activeWorkspaceId: string | null;

	addWorkspace: () => void;
	removeWorkspace: (id: string) => void;
	setActiveWorkspace: (id: string) => void;
	reorderWorkspaces: (startIndex: number, endIndex: number) => void;
	markWorkspaceAsUsed: (id: string) => void;
}

const createNewWorkspace = (): Workspace => ({
	id: `workspace-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
	title: "New Workspace",
	isNew: true,
});

export const useWorkspacesStore = create<WorkspacesState>()(
	devtools(
		persist(
			(set) => ({
				workspaces: [],
				activeWorkspaceId: null,

				addWorkspace: () => {
					const newWorkspace = createNewWorkspace();
					set((state) => ({
						workspaces: [...state.workspaces, newWorkspace],
						activeWorkspaceId: newWorkspace.id,
					}));
				},

				removeWorkspace: (id) => {
					set((state) => {
						const workspaces = state.workspaces.filter(
							(workspace) => workspace.id !== id,
						);
						if (workspaces.length === 0) {
							const newWorkspace = createNewWorkspace();
							return {
								workspaces: [newWorkspace],
								activeWorkspaceId: newWorkspace.id,
							};
						}

						if (id === state.activeWorkspaceId) {
							const closedIndex = state.workspaces.findIndex(
								(workspace) => workspace.id === id,
							);
							const nextWorkspace =
								workspaces[closedIndex] || workspaces[closedIndex - 1];
							return { workspaces, activeWorkspaceId: nextWorkspace.id };
						}

						return { workspaces };
					});
				},

				setActiveWorkspace: (id) => {
					set({ activeWorkspaceId: id });
				},

				reorderWorkspaces: (startIndex, endIndex) => {
					set((state) => {
						const workspaces = [...state.workspaces];
						const [removed] = workspaces.splice(startIndex, 1);
						workspaces.splice(endIndex, 0, removed);
						return { workspaces };
					});
				},

				markWorkspaceAsUsed: (id) => {
					set((state) => ({
						workspaces: state.workspaces.map((workspace) =>
							workspace.id === id ? { ...workspace, isNew: false } : workspace,
						),
					}));
				},
			}),
			{
				name: "workspaces-storage",
				storage: electronStorage,
			},
		),
		{ name: "WorkspacesStore" },
	),
);
