import type { MutableRefObject } from "react";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import {
	getPaneWorkspaceRun,
	type PaneWorkspaceRun,
	setPaneWorkspaceRunState,
	type WorkspaceRunState,
} from "renderer/stores/tabs/workspace-run";

interface RecoverWorkspaceRunPaneOptions {
	paneId: string;
	workspaceRun: PaneWorkspaceRun;
	isNewWorkspaceRun: boolean;
	xterm: { writeln: (data: string) => void };
	shouldAbort: () => boolean;
	startAttach: () => void;
	done: () => void;
	isExitedRef: MutableRefObject<boolean>;
	wasKilledByUserRef: MutableRefObject<boolean>;
	isStreamReadyRef: MutableRefObject<boolean>;
	setExitStatus: (status: "killed" | "exited" | null) => void;
}

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
} {
	const workspaceRun = getPaneWorkspaceRun(paneId);
	return {
		workspaceRun,
		isNewWorkspaceRun:
			workspaceRun?.state === "running" && Boolean(defaultRestartCommand),
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
}: RecoverWorkspaceRunPaneOptions): Promise<boolean> {
	if (!workspaceRun || isNewWorkspaceRun) {
		return false;
	}

	const showExitedState = (state: WorkspaceRunState): boolean => {
		const wasStoppedByUser = state === "stopped-by-user";
		setPaneWorkspaceRunState(paneId, state);
		isExitedRef.current = true;
		wasKilledByUserRef.current = wasStoppedByUser;
		isStreamReadyRef.current = true;
		setExitStatus(wasStoppedByUser ? "killed" : "exited");
		xterm.writeln(
			wasStoppedByUser ? "\r\n[Session killed]" : "\r\n[Process exited]",
		);
		xterm.writeln("[Press any key to restart]");
		done();
		return true;
	};

	if (workspaceRun.state !== "running") {
		return showExitedState(workspaceRun.state);
	}

	try {
		const existingSession =
			await electronTrpcClient.terminal.getSession.query(paneId);
		if (shouldAbort()) return true;

		if (existingSession?.isAlive) {
			setPaneWorkspaceRunState(paneId, "running");
			startAttach();
			return true;
		}

		return showExitedState("stopped-by-exit");
	} catch (error) {
		if (shouldAbort()) return true;

		console.warn(
			`[workspace-run] Failed to inspect session for pane ${paneId}:`,
			error,
		);
		startAttach();
		return true;
	}
}
