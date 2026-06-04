import type { TerminalPreset } from "@superset/local-db";
import type { AgentLaunchRequest } from "@superset/shared/agent-launch";
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
	/** Canonical launch request used by the orchestrator */
	agentLaunchRequest?: AgentLaunchRequest;
}

interface WorkspaceInitState {
	initProgress: Record<string, WorkspaceInitProgress>;
	pendingTerminalSetups: Record<string, PendingTerminalSetup>;
	/**
	 * Workspace IDs we witnessed reach "ready" during this app session. Outlives
	 * `initProgress` entries (which get cleared after terminal setup runs) so
	 * consumers can reliably tell that a workspace is not "stuck mid-init" even
	 * after the progress record has been wiped.
	 */
	completedInits: Record<string, true>;
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
			completedInits: {},

			updateProgress: (progress) => {
				set((state) => ({
					initProgress: {
						...state.initProgress,
						[progress.workspaceId]: progress,
					},
					completedInits:
						progress.step === "ready"
							? {
									...state.completedInits,
									[progress.workspaceId]: true,
								}
							: state.completedInits,
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

/**
 * Whether a failed workspace's pending terminal setup can be safely discarded.
 *
 * When init fails, we must NOT throw away a setup that still carries a launch
 * prompt (`agentCommand`/`agentLaunchRequest`). Keeping it lets the user recover
 * the prompt after retrying init — once the workspace reaches "ready" again the
 * pending setup is replayed and the agent launches with the original prompt.
 * Setups with no prompt hold nothing recoverable, so they're cleaned up. (#5088)
 */
export function canDiscardPendingSetupOnFailure(
	setup: PendingTerminalSetup | undefined,
): boolean {
	if (!setup) return true;
	return !setup.agentCommand && !setup.agentLaunchRequest;
}

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

export const useHasCompletedInitThisSession = (workspaceId: string) =>
	useWorkspaceInitStore((state) => state.completedInits[workspaceId] === true);
