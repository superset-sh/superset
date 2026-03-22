import { toast } from "@superset/ui/sonner";
import { useCallback, useEffect } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	buildTerminalCommand,
	launchCommandInPane,
	sendInterruptToPane,
	writeCommandInPane,
} from "renderer/lib/terminal/launch-command";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useTabsStore } from "renderer/stores/tabs/store";
import { useTerminalCallbacksStore } from "renderer/stores/tabs/terminal-callbacks";
import {
	createWorkspaceRun,
	setPaneWorkspaceRunState,
} from "renderer/stores/tabs/workspace-run";
import { create } from "zustand";
import {
	getWorkspaceRunUiState,
	type WorkspaceRunTransition,
} from "./workspaceRunStateMachine";

interface UseWorkspaceRunCommandOptions {
	workspaceId: string;
	worktreePath?: string | null;
}

const PROCESS_EXIT_GRACE_MS = 1500;

interface WorkspaceRunTransitionStore {
	transitions: Record<string, WorkspaceRunTransition | undefined>;
	recentStarts: Record<string, number | undefined>;
	stopRequests: Record<string, boolean | undefined>;
	setTransition: (
		workspaceId: string,
		transition: Exclude<WorkspaceRunTransition, null>,
	) => void;
	clearTransition: (workspaceId: string) => void;
	markStarted: (workspaceId: string) => void;
	clearRecentStart: (workspaceId: string) => void;
	requestStop: (workspaceId: string) => void;
	clearStopRequest: (workspaceId: string) => void;
}

const useWorkspaceRunTransitionStore = create<WorkspaceRunTransitionStore>(
	(set) => ({
		transitions: {},
		recentStarts: {},
		stopRequests: {},
		setTransition: (workspaceId, transition) =>
			set((state) => ({
				transitions: {
					...state.transitions,
					[workspaceId]: transition,
				},
			})),
		clearTransition: (workspaceId) =>
			set((state) => {
				const nextTransitions = { ...state.transitions };
				delete nextTransitions[workspaceId];
				return { transitions: nextTransitions };
			}),
		markStarted: (workspaceId) =>
			set((state) => ({
				recentStarts: {
					...state.recentStarts,
					[workspaceId]: Date.now(),
				},
			})),
		clearRecentStart: (workspaceId) =>
			set((state) => {
				const nextRecentStarts = { ...state.recentStarts };
				delete nextRecentStarts[workspaceId];
				return { recentStarts: nextRecentStarts };
			}),
		requestStop: (workspaceId) =>
			set((state) => ({
				stopRequests: {
					...state.stopRequests,
					[workspaceId]: true,
				},
			})),
		clearStopRequest: (workspaceId) =>
			set((state) => {
				const nextStopRequests = { ...state.stopRequests };
				delete nextStopRequests[workspaceId];
				return { stopRequests: nextStopRequests };
			}),
	}),
);

export function useWorkspaceRunCommand({
	workspaceId,
	worktreePath,
}: UseWorkspaceRunCommandOptions) {
	const addTab = useTabsStore((s) => s.addTab);
	const setPaneName = useTabsStore((s) => s.setPaneName);
	const setActiveTab = useTabsStore((s) => s.setActiveTab);
	const setFocusedPane = useTabsStore((s) => s.setFocusedPane);
	const setPaneWorkspaceRun = useTabsStore((s) => s.setPaneWorkspaceRun);
	const getRestartCallback = useTerminalCallbacksStore(
		(s) => s.getRestartCallback,
	);
	const transition = useWorkspaceRunTransitionStore(
		(s) => s.transitions[workspaceId] ?? null,
	);
	const recentStartAt = useWorkspaceRunTransitionStore(
		(s) => s.recentStarts[workspaceId] ?? 0,
	);
	const isStopRequested = useWorkspaceRunTransitionStore(
		(s) => s.stopRequests[workspaceId] ?? false,
	);

	// Derive run state from pane metadata (single source of truth)
	const runPane = useTabsStore((s) => {
		const pane = Object.values(s.panes).find(
			(p) =>
				p.type === "terminal" && p.workspaceRun?.workspaceId === workspaceId,
		);
		return pane ?? null;
	});

	const { data: runConfig } =
		electronTrpc.workspaces.getResolvedRunCommands.useQuery(
			{ workspaceId },
			{ enabled: !!workspaceId },
		);
	const hasRunCommand = Boolean(
		buildTerminalCommand(runConfig?.commands)?.trim().length,
	);
	const isRunning = runPane?.workspaceRun?.state === "running";
	const uiState = getWorkspaceRunUiState({
		hasRunCommand,
		isRunning,
		isStopRequested,
		transition,
	});
	const isPending = transition !== null;
	const processStateQuery = electronTrpc.terminal.getPaneProcessState.useQuery(
		{
			paneId: runPane?.id ?? "",
		},
		{
			enabled: Boolean(runPane && runPane.workspaceRun?.state === "running"),
			refetchInterval: 1000,
			refetchIntervalInBackground: true,
			retry: false,
		},
	);

	useEffect(() => {
		if (!runPane || runPane.workspaceRun?.state !== "running") return;
		if (processStateQuery.status !== "success") return;
		if (processStateQuery.data.hasSubprocesses) return;
		if (
			!isStopRequested &&
			Date.now() - recentStartAt < PROCESS_EXIT_GRACE_MS
		) {
			return;
		}

		setPaneWorkspaceRunState(
			runPane.id,
			isStopRequested ? "stopped-by-user" : "stopped-by-exit",
		);
		useWorkspaceRunTransitionStore.getState().clearStopRequest(workspaceId);
		useWorkspaceRunTransitionStore.getState().clearRecentStart(workspaceId);
	}, [
		isStopRequested,
		processStateQuery.data,
		processStateQuery.status,
		recentStartAt,
		runPane,
		workspaceId,
	]);

	useEffect(() => {
		if (isRunning) return;
		useWorkspaceRunTransitionStore.getState().clearStopRequest(workspaceId);
	}, [isRunning, workspaceId]);

	const toggleWorkspaceRun = useCallback(async () => {
		const transitionState =
			useWorkspaceRunTransitionStore.getState().transitions[workspaceId] ??
			null;
		if (transitionState !== null) return;
		let targetPaneId = runPane?.id ?? null;

		// STOP: send Ctrl+C into the PTY so the foreground job stops exactly
		// like a normal terminal interrupt.
		if (isRunning && runPane) {
			useWorkspaceRunTransitionStore
				.getState()
				.setTransition(workspaceId, "stopping");
			try {
				await sendInterruptToPane({
					paneId: runPane.id,
					write: electronTrpcClient.terminal.write.mutate,
				});
				useWorkspaceRunTransitionStore.getState().requestStop(workspaceId);
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Unknown error";
				if (message.includes("not found or not alive")) {
					setPaneWorkspaceRunState(runPane.id, "stopped-by-user");
					useWorkspaceRunTransitionStore
						.getState()
						.clearRecentStart(workspaceId);
					useWorkspaceRunTransitionStore
						.getState()
						.clearStopRequest(workspaceId);
					return;
				}
				toast.error("Failed to stop workspace run command", {
					description: message,
				});
			} finally {
				useWorkspaceRunTransitionStore.getState().clearTransition(workspaceId);
			}
			return;
		}

		try {
			// START: always fetch the latest config so run-script detection never
			// depends on stale cache state or on a query still loading in the view.
			const runConfig =
				await electronTrpcClient.workspaces.getResolvedRunCommands.query({
					workspaceId,
				});
			const command = buildTerminalCommand(runConfig.commands);
			if (!command) {
				toast.error("No workspace run command configured", {
					description:
						"Add a run script in Project Settings to use the workspace run shortcut.",
				});
				return;
			}

			useWorkspaceRunTransitionStore
				.getState()
				.setTransition(workspaceId, "starting");
			useWorkspaceRunTransitionStore.getState().clearStopRequest(workspaceId);

			const initialCwd = worktreePath?.trim() ? worktreePath : undefined;

			// Reuse existing run pane if available
			if (runPane) {
				const tabsState = useTabsStore.getState();
				const tab = tabsState.tabs.find((t) => t.id === runPane.tabId);
				if (tab) {
					setActiveTab(workspaceId, tab.id);
					setFocusedPane(tab.id, runPane.id);
				}

				setPaneWorkspaceRun(
					runPane.id,
					createWorkspaceRun({
						workspaceId,
						state: "running",
						command,
					}),
				);
				targetPaneId = runPane.id;

				try {
					const existingSession = await electronTrpcClient.terminal.getSession
						.query(runPane.id)
						.catch(() => null);
					const restartCallback = getRestartCallback(runPane.id);

					if (existingSession?.isAlive) {
						await writeCommandInPane({
							paneId: runPane.id,
							command,
							write: electronTrpcClient.terminal.write.mutate,
						});
					} else if (restartCallback) {
						await restartCallback({ command });
					} else {
						await launchCommandInPane({
							paneId: runPane.id,
							tabId: runPane.tabId,
							workspaceId,
							allowKilled: true,
							skipColdRestore: true,
							command,
							createOrAttach: electronTrpcClient.terminal.createOrAttach.mutate,
							write: electronTrpcClient.terminal.write.mutate,
						});
					}
					useWorkspaceRunTransitionStore.getState().markStarted(workspaceId);
				} catch (error) {
					setPaneWorkspaceRunState(runPane.id, "stopped-by-exit");
					toast.error("Failed to run workspace command", {
						description:
							error instanceof Error ? error.message : "Unknown error",
					});
				}
				return;
			}

			// Create new pane and persist the resolved command on the pane metadata
			// before mount. Terminal lifecycle then sees the same click-time command
			// snapshot that presets use, instead of waiting on a follow-up query.
			const result = addTab(workspaceId, { initialCwd });
			const { tabId, paneId } = result;
			targetPaneId = paneId;

			setPaneName(paneId, "Workspace Run");
			setPaneWorkspaceRun(
				paneId,
				createWorkspaceRun({
					workspaceId,
					state: "running",
					command,
				}),
			);
			setActiveTab(workspaceId, tabId);
			setFocusedPane(tabId, paneId);
			await launchCommandInPane({
				paneId,
				tabId,
				workspaceId,
				command,
				cwd: initialCwd,
				createOrAttach: electronTrpcClient.terminal.createOrAttach.mutate,
				write: electronTrpcClient.terminal.write.mutate,
			});
			useWorkspaceRunTransitionStore.getState().markStarted(workspaceId);
		} catch (error) {
			useWorkspaceRunTransitionStore.getState().clearRecentStart(workspaceId);
			useWorkspaceRunTransitionStore.getState().clearStopRequest(workspaceId);
			const currentWorkspaceRun = targetPaneId
				? useTabsStore.getState().panes[targetPaneId]?.workspaceRun
				: null;
			if (targetPaneId && currentWorkspaceRun) {
				setPaneWorkspaceRunState(targetPaneId, "stopped-by-exit");
			}
			toast.error("Failed to run workspace command", {
				description: error instanceof Error ? error.message : "Unknown error",
			});
		} finally {
			useWorkspaceRunTransitionStore.getState().clearTransition(workspaceId);
		}
	}, [
		addTab,
		getRestartCallback,
		isRunning,
		runPane,
		workspaceId,
		worktreePath,
		setActiveTab,
		setFocusedPane,
		setPaneName,
		setPaneWorkspaceRun,
	]);

	return {
		hasRunCommand,
		isRunning,
		isPending,
		uiState,
		toggleWorkspaceRun,
	};
}
