import { electronTrpcClient } from "renderer/lib/trpc-client";
import {
	getPaneWorkspaceRun,
	isPaneWorkspaceRunLaunchPending,
	type PaneWorkspaceRun,
	setPaneWorkspaceRunState,
} from "renderer/stores/tabs/workspace-run";
import {
	type RecoverWorkspaceRunPaneOptions,
	recoverWorkspaceRunPaneWithDeps,
} from "./workspaceRunRecovery";

export {
	getPaneWorkspaceRun,
	hasPaneWorkspaceRun,
	setPaneWorkspaceRunState,
} from "renderer/stores/tabs/workspace-run";

export function resolveWorkspaceRunAttachMode(
	paneId: string,
	defaultRestartCommand?: string,
): {
	workspaceRun: PaneWorkspaceRun | null;
	isNewWorkspaceRun: boolean;
	restartCommand?: string;
} {
	const workspaceRun = getPaneWorkspaceRun(paneId);
	const hasRestartCommand =
		workspaceRun?.state === "running" && Boolean(defaultRestartCommand);
	const isNewWorkspaceRun =
		hasRestartCommand && isPaneWorkspaceRunLaunchPending(paneId);

	return {
		workspaceRun,
		isNewWorkspaceRun,
		restartCommand:
			hasRestartCommand && !isNewWorkspaceRun
				? defaultRestartCommand
				: undefined,
	};
}

export async function recoverWorkspaceRunPane({
	paneId,
	workspaceRun,
	isNewWorkspaceRun,
	xterm,
	shouldAbort,
	startAttach,
	done,
	isExitedRef,
	wasKilledByUserRef,
	isStreamReadyRef,
	setExitStatus,
	restartCommand,
}: RecoverWorkspaceRunPaneOptions): Promise<boolean> {
	return recoverWorkspaceRunPaneWithDeps(
		{
			paneId,
			workspaceRun,
			isNewWorkspaceRun,
			xterm,
			shouldAbort,
			startAttach,
			done,
			isExitedRef,
			wasKilledByUserRef,
			isStreamReadyRef,
			setExitStatus,
			restartCommand,
		},
		{
			getSession: (nextPaneId) =>
				electronTrpcClient.terminal.getSession.query(nextPaneId),
			setPaneWorkspaceRunState: (nextPaneId, state) => {
				setPaneWorkspaceRunState(nextPaneId, state);
			},
		},
	);
}
