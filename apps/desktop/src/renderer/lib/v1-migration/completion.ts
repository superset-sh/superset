// Per-org migrate-then-flip marker. Written when a migration pass reports
// gateComplete (all v1 projects + workspaces success/linked); read
// synchronously by useIsV2CloudEnabled so the NEXT launch lands on v2 with
// data already in place. localStorage on purpose: same store as the optInV2
// override it supersedes, available before any provider mounts.

const KEY_PREFIX = "v1-migration-complete-";

/** One-shot handoff flag so the first v2 boot can restore continuity. */
const PENDING_CONTINUITY_PREFIX = "v1-migration-continuity-pending-";

export function isV1MigrationComplete(organizationId: string | null): boolean {
	if (!organizationId) return false;
	try {
		return localStorage.getItem(KEY_PREFIX + organizationId) !== null;
	} catch {
		return false;
	}
}

// First read per org is cached for the whole session: completion mid-session
// must not flip the live surface (next-launch only, by design).
const bootReads = new Map<string, boolean>();

export function isV1MigrationCompleteAtBoot(
	organizationId: string | null | undefined,
): boolean {
	if (!organizationId) return false;
	let value = bootReads.get(organizationId);
	if (value === undefined) {
		value = isV1MigrationComplete(organizationId);
		bootReads.set(organizationId, value);
	}
	return value;
}

export function markV1MigrationComplete(organizationId: string): void {
	const first = !isV1MigrationComplete(organizationId);
	localStorage.setItem(KEY_PREFIX + organizationId, new Date().toISOString());
	if (first) {
		localStorage.setItem(PENDING_CONTINUITY_PREFIX + organizationId, "1");
	}
}

export function consumeV1ContinuityPending(organizationId: string): boolean {
	const key = PENDING_CONTINUITY_PREFIX + organizationId;
	try {
		if (localStorage.getItem(key) === null) return false;
		localStorage.removeItem(key);
		return true;
	} catch {
		return false;
	}
}
