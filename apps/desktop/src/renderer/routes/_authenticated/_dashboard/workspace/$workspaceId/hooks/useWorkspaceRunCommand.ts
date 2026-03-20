import { toast } from "@superset/ui/sonner";
import { useCallback, useRef, useState } from "react";
import { buildTerminalCommand } from "renderer/lib/terminal/launch-command";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useTabsStore } from "renderer/stores/tabs/store";
import { useTerminalCallbacksStore } from "renderer/stores/tabs/terminal-callbacks";

interface UseWorkspaceRunCommandOptions {
	workspaceId: string;
	worktreePath?: string | null;
}

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

	const toggleWorkspaceRun = useCallback(async () => {
		if (isStartingRef.current) return;

		// STOP: if currently running, kill it
		if (isRunning && runPane) {
			setIsPending(true);
			try {
				await electronTrpcClient.terminal.kill.mutate({ paneId: runPane.id });
				setPaneWorkspaceRun(runPane.id, {
					workspaceId,
					state: "stopped-by-user",
				});
			} catch (error) {
				toast.error("Failed to stop workspace run command", {
					description: error instanceof Error ? error.message : "Unknown error",
				});
			} finally {
				setIsPending(false);
			}
			return;
		}

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

		isStartingRef.current = true;
		setIsPending(true);
		try {
			const initialCwd = worktreePath?.trim() ? worktreePath : undefined;

			// Reuse existing run pane if available
			if (runPane) {
				const tabsState = useTabsStore.getState();
				const tab = tabsState.tabs.find((t) => t.id === runPane.tabId);
				if (tab) {
					setActiveTab(workspaceId, tab.id);
					setFocusedPane(tab.id, runPane.id);
				}

				setPaneWorkspaceRun(runPane.id, {
					workspaceId,
					state: "running",
				});

				try {
					const restartCallback = getRestartCallback(runPane.id);
					if (restartCallback) {
						await restartCallback({ command });
					} else {
						const existingSession = await electronTrpcClient.terminal.getSession
							.query(runPane.id)
							.catch(() => null);
						if (existingSession?.isAlive) {
							await electronTrpcClient.terminal.kill.mutate({
								paneId: runPane.id,
							});
						}
						await electronTrpcClient.terminal.createOrAttach.mutate({
							paneId: runPane.id,
							tabId: runPane.tabId,
							workspaceId,
							allowKilled: true,
							command,
						});
						// Re-assert running state — the kill above may have triggered
						// the exit listener which flipped state to stopped-by-user.
						setPaneWorkspaceRun(runPane.id, {
							workspaceId,
							state: "running",
						});
					}
				} catch (error) {
					setPaneWorkspaceRun(runPane.id, {
						workspaceId,
						state: "stopped-by-exit",
					});
					toast.error("Failed to run workspace command", {
						description:
							error instanceof Error ? error.message : "Unknown error",
					});
				}
				return;
			}

			// Create new pane — command is not passed here; instead the terminal
			// lifecycle detects pane.workspaceRun.state === "running" on mount and
			// reads the command from defaultRestartCommandRef (resolved via tRPC query).
			const result = addTab(workspaceId, { initialCwd });
			const { tabId, paneId } = result;

			setPaneName(paneId, "Workspace Run");
			setPaneWorkspaceRun(paneId, { workspaceId, state: "running" });
			setActiveTab(workspaceId, tabId);
			setFocusedPane(tabId, paneId);
		} finally {
			isStartingRef.current = false;
			setIsPending(false);
		}
	}, [
		addTab,
		getRestartCallback,
		isRunning,
		runPane,
		setActiveTab,
		setFocusedPane,
		setPaneName,
		setPaneWorkspaceRun,
		workspaceId,
		worktreePath,
	]);

	return {
		isRunning,
		isPending,
		toggleWorkspaceRun,
	};
}
