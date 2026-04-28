import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export type V2WorkspaceCreateBaseBranchSource = "local" | "remote-tracking";

export interface V2WorkspaceCreateBaseBranchDefault {
	branchName: string;
	source: V2WorkspaceCreateBaseBranchSource;
}

export type V2WorkspaceCreateHostTarget =
	| { kind: "local" }
	| { kind: "host"; hostId: string };

interface V2WorkspaceCreateDefaultsState {
	lastProjectId: string | null;
	baseBranchesByProjectId: Record<string, V2WorkspaceCreateBaseBranchDefault>;
	lastHostTarget: V2WorkspaceCreateHostTarget | null;

	setLastProjectId: (projectId: string | null) => void;
	setBaseBranchDefault: (
		projectId: string,
		branchName: string,
		source: V2WorkspaceCreateBaseBranchSource,
	) => void;
	clearBaseBranchDefault: (projectId: string) => void;
	setLastHostTarget: (target: V2WorkspaceCreateHostTarget) => void;
}

export const useV2WorkspaceCreateDefaultsStore =
	create<V2WorkspaceCreateDefaultsState>()(
		devtools(
			persist(
				(set) => ({
					lastProjectId: null,
					baseBranchesByProjectId: {},
					lastHostTarget: null,

					setLastProjectId: (projectId) => set({ lastProjectId: projectId }),

					setBaseBranchDefault: (projectId, branchName, source) => {
						const trimmed = branchName.trim();
						if (!trimmed) return;
						set((state) => ({
							baseBranchesByProjectId: {
								...state.baseBranchesByProjectId,
								[projectId]: { branchName: trimmed, source },
							},
						}));
					},

					clearBaseBranchDefault: (projectId) =>
						set((state) => {
							if (!(projectId in state.baseBranchesByProjectId)) return state;
							const next = { ...state.baseBranchesByProjectId };
							delete next[projectId];
							return { baseBranchesByProjectId: next };
						}),

					setLastHostTarget: (target) => set({ lastHostTarget: target }),
				}),
				{
					name: "v2-workspace-create-defaults",
					version: 1,
				},
			),
			{ name: "V2WorkspaceCreateDefaultsStore" },
		),
	);
