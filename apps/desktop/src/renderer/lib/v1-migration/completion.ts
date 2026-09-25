// Per-org completion marker, written when a migration pass reports
// gateComplete (all v1 projects + workspaces success/linked). localStorage on
// purpose: available before any provider mounts.

const KEY_PREFIX = "v1-migration-complete-";

/**
 * Best-effort kinds (settings/presets/terminals) that were still failing or
 * deferred when the gate completed retry on later boots while this flag is
 * set (they never gate completion, but must not be silently abandoned).
 */
const FOLLOWUP_PREFIX = "v1-migration-followup-pending-";

export function isV1MigrationComplete(organizationId: string | null): boolean {
	if (!organizationId) return false;
	try {
		return localStorage.getItem(KEY_PREFIX + organizationId) !== null;
	} catch {
		return false;
	}
}

export function markV1MigrationComplete(organizationId: string): void {
	localStorage.setItem(KEY_PREFIX + organizationId, new Date().toISOString());
}

export function isV1FollowUpPending(organizationId: string): boolean {
	try {
		return localStorage.getItem(FOLLOWUP_PREFIX + organizationId) !== null;
	} catch {
		return false;
	}
}

export function setV1FollowUpPending(
	organizationId: string,
	pending: boolean,
): void {
	try {
		const key = FOLLOWUP_PREFIX + organizationId;
		if (pending) localStorage.setItem(key, "1");
		else localStorage.removeItem(key);
	} catch {}
}
