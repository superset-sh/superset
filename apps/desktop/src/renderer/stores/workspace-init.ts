import type { WorkspaceInitProgress } from "shared/types/workspace-init";
import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface WorkspaceInitState {
	// Map of workspaceId -> progress
	initProgress: Record<string, WorkspaceInitProgress>;

	// Actions
	updateProgress: (progress: WorkspaceInitProgress) => void;
	clearProgress: (workspaceId: string) => void;
}

export const useWorkspaceInitStore = create<WorkspaceInitState>()(
	devtools(
		(set, get) => ({
			initProgress: {},

			updateProgress: (progress) => {
				set((state) => ({
					initProgress: {
						...state.initProgress,
						[progress.workspaceId]: progress,
					},
				}));

				// Note: We no longer auto-clear "ready" state on a timer.
				// Consumers (e.g., useCreateWorkspace) must explicitly call clearProgress()
				// after they've handled the ready event. This prevents race conditions where
				// the progress is cleared before the consumer can observe it.
				//
				// For memory hygiene, we do clear "ready" progress after 5 minutes
				// (long enough that any React effect will have run).
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
		}),
		{ name: "WorkspaceInitStore" },
	),
);

// Convenience hooks
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
