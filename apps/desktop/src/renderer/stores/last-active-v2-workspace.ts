import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface LastActiveV2WorkspaceState {
	workspaceId: string | null;
	setWorkspaceId: (workspaceId: string) => void;
	clearWorkspaceId: (workspaceId: string) => void;
}

export const useLastActiveV2Workspace = create<LastActiveV2WorkspaceState>()(
	devtools(
		persist(
			(set) => ({
				workspaceId: null,
				setWorkspaceId: (workspaceId) => set({ workspaceId }),
				clearWorkspaceId: (workspaceId) =>
					set((state) =>
						state.workspaceId === workspaceId ? { workspaceId: null } : state,
					),
			}),
			{ name: "last-active-v2-workspace", version: 1 },
		),
	),
);
