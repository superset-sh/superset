import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

type WorkspaceCreateBaseBranchSource = "local" | "remote-tracking";

interface WorkspaceCreateBaseBranchDefault {
	branchName: string;
	source: WorkspaceCreateBaseBranchSource;
}

interface WorkspaceCreateDefaultsState {
	lastProjectId: string | null;
	baseBranchesByProjectId: Record<string, WorkspaceCreateBaseBranchDefault>;
	lastHostId: string | null;
	/** User closed the sample-prompt suggestions on the create surface. */
	samplePromptsDismissed: boolean;

	setLastProjectId: (projectId: string | null) => void;
	setBaseBranchDefault: (
		projectId: string,
		branchName: string,
		source: WorkspaceCreateBaseBranchSource,
	) => void;
	clearBaseBranchDefault: (projectId: string) => void;
	setLastHostId: (hostId: string | null) => void;
	setSamplePromptsDismissed: (dismissed: boolean) => void;
}

export const useWorkspaceCreateDefaultsStore =
	create<WorkspaceCreateDefaultsState>()(
		devtools(
			persist(
				(set) => ({
					lastProjectId: null,
					baseBranchesByProjectId: {},
					lastHostId: null,
					samplePromptsDismissed: false,

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

					setSamplePromptsDismissed: (dismissed) =>
						set({ samplePromptsDismissed: dismissed }),
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
			{ name: "WorkspaceCreateDefaultsStore" },
		),
	);
