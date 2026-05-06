import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export type V2WorkspaceCreateBaseBranchSource = "local" | "remote-tracking";

export interface V2WorkspaceCreateBaseBranchDefault {
	branchName: string;
	source: V2WorkspaceCreateBaseBranchSource;
}

interface V2WorkspaceCreateDefaultsState {
	lastProjectId: string | null;
	baseBranchesByProjectId: Record<string, V2WorkspaceCreateBaseBranchDefault>;
	lastHostId: string | null;

	setLastProjectId: (projectId: string | null) => void;
	setBaseBranchDefault: (
		projectId: string,
		branchName: string,
		source: V2WorkspaceCreateBaseBranchSource,
	) => void;
	clearBaseBranchDefault: (projectId: string) => void;
	setLastHostId: (hostId: string | null) => void;
}

export const useV2WorkspaceCreateDefaultsStore =
	create<V2WorkspaceCreateDefaultsState>()(
		devtools(
			persist(
				(set) => ({
					lastProjectId: null,
					baseBranchesByProjectId: {},
					lastHostId: null,

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

					setLastHostId: (hostId) => set({ lastHostId: hostId }),
				}),
				{
					name: "v2-workspace-create-defaults",
					version: 2,
					migrate: (state, fromVersion) => {
						if (fromVersion < 2 && state && typeof state === "object") {
							const prev = state as Record<string, unknown>;
							const oldTarget = prev.lastHostTarget as
								| { kind: "local" }
								| { kind: "host"; hostId: string }
								| null
								| undefined;
							const lastHostId =
								oldTarget && oldTarget.kind === "host"
									? oldTarget.hostId
									: null;
							const { lastHostTarget: _omit, ...rest } = prev;
							return { ...rest, lastHostId };
						}
						return state;
					},
				},
			),
			{ name: "V2WorkspaceCreateDefaultsStore" },
		),
	);
