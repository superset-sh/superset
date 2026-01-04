import type { WorkspaceInitProgress } from "shared/types/workspace-init";
import { create } from "zustand";
import { devtools } from "zustand/middleware";

/**
 * Data needed to create a terminal when workspace becomes ready.
 * Stored globally so it survives dialog/hook unmounts.
 */
export interface PendingTerminalSetup {
	workspaceId: string;
	projectId: string;
	initialCommands: string[] | null;
}

interface WorkspaceInitState {
	// Map of workspaceId -> progress
	initProgress: Record<string, WorkspaceInitProgress>;

	// Map of workspaceId -> pending terminal setup (survives dialog unmount)
	pendingTerminalSetups: Record<string, PendingTerminalSetup>;

	// Actions
	updateProgress: (progress: WorkspaceInitProgress) => void;
	clearProgress: (workspaceId: string) => void;
	addPendingTerminalSetup: (setup: PendingTerminalSetup) => void;
	removePendingTerminalSetup: (workspaceId: string) => void;
}

export const useWorkspaceInitStore = create<WorkspaceInitState>()(
	devtools(
		(set, get) => ({
			initProgress: {},
			pendingTerminalSetups: {},

			updateProgress: (progress) => {
				set((state) => ({
					initProgress: {
						...state.initProgress,
						[progress.workspaceId]: progress,
					},
				}));

				// For memory hygiene, clear "ready" progress after 5 minutes
				// (long enough that WorkspaceInitEffects will have processed it)
				if (progress.step === "ready") {
					setTimeout(
						() => {
							const current = get().initProgress[progress.workspaceId];
							if (current?.step === "ready") {
								get().clearProgress(progress.workspaceId);
							}
						},
						5 * 60 * 1000,
					); // 5 minutes
				}
			},

			clearProgress: (workspaceId) => {
				set((state) => {
					const { [workspaceId]: _, ...rest } = state.initProgress;
					return { initProgress: rest };
				});
			},

			addPendingTerminalSetup: (setup) => {
				set((state) => ({
					pendingTerminalSetups: {
						...state.pendingTerminalSetups,
						[setup.workspaceId]: setup,
					},
				}));
			},

			removePendingTerminalSetup: (workspaceId) => {
				set((state) => {
					const { [workspaceId]: _, ...rest } = state.pendingTerminalSetups;
					return { pendingTerminalSetups: rest };
				});
			},
		}),
		{ name: "WorkspaceInitStore" },
	),
);

export const useWorkspaceInitProgress = (workspaceId: string) =>
	useWorkspaceInitStore((state) => state.initProgress[workspaceId]);

export const useIsWorkspaceInitializing = (workspaceId: string) =>
	useWorkspaceInitStore((state) => {
		const progress = state.initProgress[workspaceId];
		return (
			progress !== undefined &&
			progress.step !== "ready" &&
			progress.step !== "failed"
		);
	});

export const useHasWorkspaceFailed = (workspaceId: string) =>
	useWorkspaceInitStore((state) => {
		const progress = state.initProgress[workspaceId];
		return progress?.step === "failed";
	});
