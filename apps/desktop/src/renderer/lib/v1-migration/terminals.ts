export interface V1TerminalPane {
	paneId: string;
	v1WorkspaceId: string;
	cwd: string | null;
}

export interface PendingMigratedTerminal {
	terminalId: string;
	cwd: string | null;
	/**
	 * Source pane, so pane-creation time can look up the pane's latest
	 * captured agent session and seed a resume candidate. Null on queue
	 * entries persisted before this field existed.
	 */
	v1PaneId: string | null;
}

/** Shape of the electron-main V1PaneAgentSession capture the resume check needs. */
export interface V1PaneAgentSessionSnapshot {
	agentId: string;
	agentSessionId: string;
	prompted: boolean;
	endedAt?: number;
}

export interface MigratedPaneResume {
	agentId: string;
	agentSessionId: string;
}

/**
 * Whether a migrated pane's captured agent session should be offered for
 * resume. Mirrors host-service findResumeCandidateBinding: a session id was
 * captured, the session progressed past its first prompt (never-prompted
 * sessions have no persisted conversation), and the agent never said its own
 * goodbye (a clean quit is not a resume candidate).
 */
export function resolveMigratedPaneResume(
	session: V1PaneAgentSessionSnapshot | undefined,
): MigratedPaneResume | null {
	if (!session) return null;
	if (!session.agentId || !session.agentSessionId) return null;
	if (!session.prompted) return null;
	if (session.endedAt !== undefined) return null;
	return { agentId: session.agentId, agentSessionId: session.agentSessionId };
}

export interface TerminalMigrationPlan {
	/** v2WorkspaceId → terminals to queue (fresh v2 terminal ids). */
	pendingByV2WorkspaceId: Map<string, PendingMigratedTerminal[]>;
	/** paneId → assigned v2 terminal id, for ledger recording. */
	terminalIdByPaneId: Map<string, string>;
	/** Panes whose v1 workspace isn't migrated yet — retried later. */
	deferredPaneIds: string[];
}

/**
 * Assign each v1 terminal pane a fresh v2 terminal id under its migrated
 * workspace. Fresh ids on purpose: v1 pane ids double as v1 daemon session
 * ids, and reusing them risks colliding with the live v1 daemon. Idempotence
 * comes from the ledger (kind "terminal", v1Id = paneId), not id reuse.
 */
export function planTerminalMigration({
	v1TerminalPanes,
	v2WorkspaceIdByV1WorkspaceId,
	newTerminalId,
}: {
	v1TerminalPanes: V1TerminalPane[];
	v2WorkspaceIdByV1WorkspaceId: Map<string, string>;
	newTerminalId: () => string;
}): TerminalMigrationPlan {
	const plan: TerminalMigrationPlan = {
		pendingByV2WorkspaceId: new Map(),
		terminalIdByPaneId: new Map(),
		deferredPaneIds: [],
	};

	for (const pane of v1TerminalPanes) {
		const v2WorkspaceId = v2WorkspaceIdByV1WorkspaceId.get(pane.v1WorkspaceId);
		if (!v2WorkspaceId) {
			plan.deferredPaneIds.push(pane.paneId);
			continue;
		}
		const terminalId = newTerminalId();
		plan.terminalIdByPaneId.set(pane.paneId, terminalId);
		const list = plan.pendingByV2WorkspaceId.get(v2WorkspaceId) ?? [];
		list.push({ terminalId, cwd: pane.cwd, v1PaneId: pane.paneId });
		plan.pendingByV2WorkspaceId.set(v2WorkspaceId, list);
	}

	return plan;
}
