// Per-org migrate-then-flip marker. Written when a migration pass reports
// gateComplete (all v1 projects + workspaces success/linked); read
// synchronously by useIsV2CloudEnabled so the NEXT launch lands on v2 with
// data already in place. localStorage on purpose: same store as the optInV2
// override it supersedes, available before any provider mounts.

import { gte } from "semver";

const KEY_PREFIX = "v1-migration-complete-";

/** One-shot handoff flag so the first v2 boot can restore continuity. */
const PENDING_CONTINUITY_PREFIX = "v1-migration-continuity-pending-";

/**
 * Best-effort kinds (settings/presets/terminals) that were still failing or
 * deferred when the gate completed retry post-flip while this flag is set
 * (D4: they never gate the flip, but must not be silently abandoned either).
 */
const FOLLOWUP_PREFIX = "v1-migration-followup-pending-";

/**
 * Backstop (plan: "after app version X, flip regardless of ledger state").
 * null disables it; a release sets it to that release's version once the
 * telemetry shows who's stuck. Machines whose migration never completes
 * (persistently failing projects) flip here; the manual "Import from v1"
 * button stays as their recovery path.
 */
export const V1_FORCED_FLIP_VERSION: string | null = null;

export function isForcedFlipVersion(
	currentVersion: string | undefined,
	forcedVersion: string | null,
): boolean {
	if (!forcedVersion || !currentVersion) return false;
	try {
		return gte(currentVersion, forcedVersion);
	} catch {
		return false;
	}
}

/** App version is fixed for the process lifetime, so this is boot-stable. */
export function isV1ForcedFlipActive(): boolean {
	return isForcedFlipVersion(
		typeof window !== "undefined" ? window.App?.appVersion : undefined,
		V1_FORCED_FLIP_VERSION,
	);
}

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

/**
 * Non-destructive check — the restore consumes the flag only once it has
 * actually succeeded, so a failed first attempt retries next boot.
 */
export function peekV1ContinuityPending(organizationId: string): boolean {
	try {
		return (
			localStorage.getItem(PENDING_CONTINUITY_PREFIX + organizationId) !== null
		);
	} catch {
		return false;
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
