import { toast } from "@superset/ui/sonner";
import { useCallback, useRef, useState } from "react";
import {
	buildTerminalCommand,
	launchCommandInPane,
} from "renderer/lib/terminal/launch-command";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useTabsStore } from "renderer/stores/tabs/store";
import { useTerminalCallbacksStore } from "renderer/stores/tabs/terminal-callbacks";
import {
	clearPaneWorkspaceRunLaunchPending,
	createWorkspaceRun,
	markPaneWorkspaceRunLaunchPending,
	setPaneWorkspaceRunState,
} from "renderer/stores/tabs/workspace-run";

interface UseWorkspaceRunCommandOptions {
	workspaceId: string;
	worktreePath?: string | null;
}

const CTRL_C_INPUT = "\u0003";

export function useWorkspaceRunCommand({
	workspaceId,
	worktreePath,
}: UseWorkspaceRunCommandOptions) {
	const isStartingRef = useRef(false);
	const [isPending, setIsPending] = useState(false);

	const addTab = useTabsStore((s) => s.addTab);
	const setPaneName = useTabsStore((s) => s.setPaneName);
	const setActiveTab = useTabsStore((s) => s.setActiveTab);
	const setFocusedPane = useTabsStore((s) => s.setFocusedPane);
	const setPaneWorkspaceRun = useTabsStore((s) => s.setPaneWorkspaceRun);
	const getRestartCallback = useTerminalCallbacksStore(
		(s) => s.getRestartCallback,
	);

	// Derive run state from pane metadata (single source of truth)
	const runPane = useTabsStore((s) => {
		const pane = Object.values(s.panes).find(
			(p) =>
				p.type === "terminal" && p.workspaceRun?.workspaceId === workspaceId,
		);
		return pane ?? null;
	});

	const isRunning = runPane?.workspaceRun?.state === "running";
	const canForceStop = isRunning && Boolean(runPane);

	const launchWorkspaceRunInPane = useCallback(
		async ({
			paneId,
			tabId,
			command,
			cwd,
		}: {
			paneId: string;
			tabId: string;
			command: string;
			cwd?: string;
		}) => {
			markPaneWorkspaceRunLaunchPending(paneId);
			try {
				await launchCommandInPane({
					paneId,
					tabId,
					workspaceId,
					command,
					cwd,
					createOrAttach: (input) =>
						electronTrpcClient.terminal.createOrAttach.mutate({
							...input,
							allowKilled: true,
						}),
					write: (input) => electronTrpcClient.terminal.write.mutate(input),
				});
			} finally {
				clearPaneWorkspaceRunLaunchPending(paneId);
			}
		},
		[workspaceId],
	);

	const toggleWorkspaceRun = useCallback(async () => {
		if (isStartingRef.current) return;

		// STOP: send Ctrl+C through the PTY so the run command stops the same
		// way it would if the user interrupted it from the keyboard.
		if (isRunning && runPane) {
			setIsPending(true);
			try {
				await electronTrpcClient.terminal.write.mutate({
					paneId: runPane.id,
					data: CTRL_C_INPUT,
					throwOnError: true,
				});
				setPaneWorkspaceRunState(runPane.id, "stopped-by-user");
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Unknown error";
				if (message.includes("not found") || message.includes("not alive")) {
					setPaneWorkspaceRunState(runPane.id, "stopped-by-exit");
					return;
				}
				toast.error("Failed to stop workspace run command", {
					description: message,
				});
			} finally {
				setIsPending(false);
			}
			return;
		}

		isStartingRef.current = true;
		setIsPending(true);
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

				try {
					const restartCallback = getRestartCallback(runPane.id);
					if (restartCallback) {
						await restartCallback({ command });
					} else {
						await launchWorkspaceRunInPane({
							paneId: runPane.id,
							tabId: runPane.tabId,
							command,
							cwd: initialCwd,
						});
						setPaneWorkspaceRun(
							runPane.id,
							createWorkspaceRun({
								workspaceId,
								state: "running",
								command,
							}),
						);
					}
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
			try {
				await launchWorkspaceRunInPane({
					paneId,
					tabId,
					command,
					cwd: initialCwd,
				});
			} catch (error) {
				setPaneWorkspaceRunState(paneId, "stopped-by-exit");
				toast.error("Failed to run workspace command", {
					description: error instanceof Error ? error.message : "Unknown error",
				});
			}
		} catch (error) {
			toast.error("Failed to resolve workspace run command", {
				description: error instanceof Error ? error.message : "Unknown error",
			});
		} finally {
			isStartingRef.current = false;
			setIsPending(false);
		}
	}, [
		addTab,
		getRestartCallback,
		isRunning,
		launchWorkspaceRunInPane,
		runPane,
		setActiveTab,
		setFocusedPane,
		setPaneName,
		setPaneWorkspaceRun,
		workspaceId,
		worktreePath,
	]);

	const forceStopWorkspaceRun = useCallback(async () => {
		if (!runPane || !isRunning || isStartingRef.current) return;

		setIsPending(true);
		try {
			await electronTrpcClient.terminal.kill.mutate({
				paneId: runPane.id,
			});
			setPaneWorkspaceRunState(runPane.id, "stopped-by-user");
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			if (message.includes("not found") || message.includes("not alive")) {
				setPaneWorkspaceRunState(runPane.id, "stopped-by-exit");
				return;
			}
			toast.error("Failed to force stop workspace run command", {
				description: message,
			});
		} finally {
			setIsPending(false);
		}
	}, [isRunning, runPane]);

	return {
		canForceStop,
		forceStopWorkspaceRun,
		isRunning,
		isPending,
		toggleWorkspaceRun,
	};
}
