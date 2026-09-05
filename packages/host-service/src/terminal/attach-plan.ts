/**
 * What a WebSocket attach should do with a terminal's persisted row. Pure so
 * the policy is unit-testable without a pty-daemon; `resolveSessionForAttach`
 * in terminal.ts performs the chosen action.
 *
 * The no-row case (create-on-attach) stays with the caller; this decides the
 * fate of an existing row only.
 *
 *   - disposed / exited → `session-gone`: a deliberate kill or a pty death
 *                         the row already recorded; never revive.
 *   - suspended         → `respawn`: the reaper killed the pty because the
 *                         workspace was archived; there is nothing to adopt,
 *                         so open a fresh shell under the same id with the
 *                         "Session Contents Restored" notice. The row upsert
 *                         in createTerminalSessionInternal flips it back to
 *                         active.
 *   - active            → `adopt`: the daemon may still own the pty (host
 *                         restart); the caller adopts, then falls back to a
 *                         respawn if the daemon has lost it.
 */
export type TerminalAttachPlan =
	| { kind: "session-gone"; error: string }
	| { kind: "error"; error: string }
	| { kind: "adopt"; workspaceId: string }
	| { kind: "respawn"; workspaceId: string };

export interface TerminalAttachRecord {
	status: string;
	originWorkspaceId: string | null;
}

export function getTerminalWorkspaceMismatchError({
	terminalId,
	ownerWorkspaceId,
	requestedWorkspaceId,
}: {
	terminalId: string;
	ownerWorkspaceId: string | null | undefined;
	requestedWorkspaceId: string;
}): string | null {
	if (!ownerWorkspaceId || ownerWorkspaceId === requestedWorkspaceId) {
		return null;
	}

	return `Terminal session "${terminalId}" belongs to workspace "${ownerWorkspaceId}", not "${requestedWorkspaceId}".`;
}

export function planTerminalAttach({
	terminalId,
	record,
	requestedWorkspaceId,
}: {
	terminalId: string;
	record: TerminalAttachRecord;
	requestedWorkspaceId: string | null;
}): TerminalAttachPlan {
	if (record.status === "disposed") {
		return {
			kind: "session-gone",
			error: `Terminal session "${terminalId}" is disposed.`,
		};
	}
	if (record.status === "exited") {
		return {
			kind: "session-gone",
			error: `Terminal session "${terminalId}" has exited.`,
		};
	}
	if (!record.originWorkspaceId) {
		return {
			kind: "error",
			error: `Terminal session "${terminalId}" is missing a workspace.`,
		};
	}
	if (requestedWorkspaceId) {
		const mismatchError = getTerminalWorkspaceMismatchError({
			terminalId,
			ownerWorkspaceId: record.originWorkspaceId,
			requestedWorkspaceId,
		});
		if (mismatchError) return { kind: "error", error: mismatchError };
	}
	if (record.status === "suspended") {
		return { kind: "respawn", workspaceId: record.originWorkspaceId };
	}
	return { kind: "adopt", workspaceId: record.originWorkspaceId };
}
