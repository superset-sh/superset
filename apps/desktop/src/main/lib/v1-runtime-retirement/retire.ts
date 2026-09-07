import type { ListSessionsResponse } from "../terminal-host/types";

export interface RetirementDependencies {
	listSessions(): Promise<ListSessionsResponse | null>;
	isWorkspaceMigrated(workspaceId: string): boolean;
	beforeShutdown?(sessions: ListSessionsResponse["sessions"]): void;
	shutdown(): Promise<unknown>;
	cleanup(sessions: ListSessionsResponse["sessions"]): Promise<void>;
}

/**
 * Probe only: cleanup must never spawn the daemon it is trying to remove.
 * Existing sessions need a successful workspace ledger entry. An attached
 * session may belong to another app instance still on v1; leave it alone.
 */
export async function retireV1Runtime(
	dependencies: RetirementDependencies,
	stillEligible: () => boolean,
): Promise<boolean> {
	if (!stillEligible()) return false;
	const inventory = await dependencies.listSessions();
	if (!stillEligible()) return false;
	if (
		inventory?.sessions.some(
			(session) =>
				session.attachedClients > 0 ||
				(session.isAlive &&
					!dependencies.isWorkspaceMigrated(session.workspaceId)),
		)
	)
		return false;
	if (inventory) {
		dependencies.beforeShutdown?.(inventory.sessions);
		await dependencies.shutdown();
	}
	await dependencies.cleanup(inventory?.sessions ?? []);
	return true;
}
