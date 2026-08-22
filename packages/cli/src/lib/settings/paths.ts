import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Resolved at call time (not module load) so tests can point
 * SUPERSET_HOME_DIR at a sandbox before touching the stores.
 */
export function getSupersetHomeDir(): string {
	return process.env.SUPERSET_HOME_DIR ?? join(homedir(), ".superset");
}

export function getLocalDbPath(): string {
	return join(getSupersetHomeDir(), "local.db");
}

export function getAppStatePath(): string {
	return join(getSupersetHomeDir(), "app-state.json");
}
