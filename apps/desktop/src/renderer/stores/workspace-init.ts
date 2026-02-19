import type { TerminalPreset } from "@superset/local-db";
import type { WorkspaceInitProgress } from "shared/types/workspace-init";
import { create } from "zustand";
import { devtools } from "zustand/middleware";

export interface PendingTerminalSetup {
	workspaceId: string;
	projectId: string;
	initialCommands: string[] | null;
	/** When undefined, signals that presets haven't been fetched yet and should be loaded from the backend */
	defaultPresets?: TerminalPreset[];
	/** Agent command to run in a separate pane from the setup script */
	agentCommand?: string;
}

interface WorkspaceInitState {
	initProgress: Record<string, WorkspaceInitProgress>;
	pendingTerminalSetups: Record<string, PendingTerminalSetup>;
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
