import type { MutableRefObject } from "react";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { Pane } from "shared/tabs-types";

type PaneWorkspaceRun = NonNullable<Pane["workspaceRun"]>;

type WorkspaceRunState = PaneWorkspaceRun["state"];

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

export function getPaneWorkspaceRun(paneId: string): PaneWorkspaceRun | null {
	return useTabsStore.getState().panes[paneId]?.workspaceRun ?? null;
}

export function hasPaneWorkspaceRun(paneId: string): boolean {
	return Boolean(getPaneWorkspaceRun(paneId));
}

export function setPaneWorkspaceRunState(
	paneId: string,
	state: WorkspaceRunState,
): PaneWorkspaceRun | null {
	const workspaceRun = getPaneWorkspaceRun(paneId);
	if (!workspaceRun) return null;

	useTabsStore.getState().setPaneWorkspaceRun(paneId, {
		workspaceId: workspaceRun.workspaceId,
		state,
	});

	return {
		workspaceId: workspaceRun.workspaceId,
		state,
	};
}

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

	try {
		const existingSession =
			await electronTrpcClient.terminal.getSession.query(paneId);
		if (shouldAbort()) return true;

		if (existingSession?.isAlive) {
			setPaneWorkspaceRunState(paneId, "running");
			startAttach();
			return true;
		}

		const wasStoppedByUser = workspaceRun.state === "stopped-by-user";
		const resolvedState =
			workspaceRun.state === "running" ? "stopped-by-exit" : workspaceRun.state;

		setPaneWorkspaceRunState(paneId, resolvedState);
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
	} catch {
		if (shouldAbort()) return true;

		setPaneWorkspaceRunState(paneId, "stopped-by-exit");
		isExitedRef.current = true;
		wasKilledByUserRef.current = false;
		isStreamReadyRef.current = true;
		setExitStatus("exited");
		xterm.writeln("\r\n[Process exited]");
		xterm.writeln("[Press any key to restart]");
		done();
		return true;
	}
}
