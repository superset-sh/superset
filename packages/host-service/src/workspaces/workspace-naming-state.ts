import type { HostDb } from "../db";

/** AI naming still owed to a workspace whose name is automatic. */
export interface WorkspaceNamingState {
	prompt: string;
	attempts: number;
	/** The generated branch naming may still replace; null keeps the branch. */
	branch: string | null;
	/** Agent whose headless CLI names it; null names from the prompt alone. */
	agent: string | null;
}

// In memory only: a host restart drops naming still owed, and the workspace
// keeps the name it has by then.
const statesByDatabase = new WeakMap<
	HostDb,
	Map<string, WorkspaceNamingState>
>();

function states(db: HostDb): Map<string, WorkspaceNamingState> {
	let map = statesByDatabase.get(db);
	if (!map) {
		map = new Map();
		statesByDatabase.set(db, map);
	}
	return map;
}

export function getWorkspaceNamingState(
	db: HostDb,
	workspaceId: string,
): WorkspaceNamingState | undefined {
	return statesByDatabase.get(db)?.get(workspaceId);
}

/** null forgets the workspace: it is named, renamed by the user, or gone. */
export function setWorkspaceNamingState(
	db: HostDb,
	workspaceId: string,
	state: WorkspaceNamingState | null,
): void {
	if (state) states(db).set(workspaceId, state);
	else statesByDatabase.get(db)?.delete(workspaceId);
}

/** The user chose a branch: naming may still retitle, never rename it. */
export function keepWorkspaceBranch(db: HostDb, workspaceId: string): void {
	const state = getWorkspaceNamingState(db, workspaceId);
	if (state) state.branch = null;
}
