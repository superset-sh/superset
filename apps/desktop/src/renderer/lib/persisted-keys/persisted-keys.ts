interface DeadKey {
	key: string;
	match: "exact" | "prefix";
}

/**
 * Keys no current code reads or writes. Swept at boot; when removing a
 * feature that persisted state, move its keys here instead of just deleting
 * the writer.
 */
export const DEAD_KEYS: DeadKey[] = [
	// Pending-create records; superseded by canonical workspaces.create (#3893)
	{ key: "pending-workspaces-", match: "prefix" },
	// v1→v2 preset migration marker; superseded by pull-based importer (#4122)
	{ key: "v2-terminal-presets-migrated-", match: "prefix" },
	// Replaced by v2-notifications-v1
	{ key: "notification-center-store", match: "exact" },
	// Workspace details moved into the workspace item (#5392)
	{ key: "workspace-details-store", match: "exact" },
	// Replaced by the v2 onboarding setup flow (#4080)
	{ key: "superset-onboarding-v1", match: "exact" },
	// Analytics funnel marker removed in #502-era simplification
	{ key: "superset_auth_completed", match: "exact" },
	// One-shot hotkey migration marker; migration removed (#3391)
	{ key: "hotkey-overrides-migrated-v2", match: "exact" },
	// Unattributed analytics remnants; no writer remains in repo or dependencies
	{ key: "outlit_", match: "prefix" },
	// Superseded by v2-workspace-local-state.sidebarState; store deleted in
	// SUPER-1686 after the audit found no consumers
	{ key: "v2-workspace-local-meta", match: "exact" },
	// Section metadata store had no consumers; writer removed in SUPER-1686
	{ key: "v2-section-local-meta", match: "exact" },
	// v1→v2 migration ledger markers; superseded by the importer ledger
	{ key: "v1-migration-last-run-at-", match: "prefix" },
	{ key: "v1-migration-modal-shown-", match: "prefix" },
];

function matchesDeadKey(key: string): boolean {
	return DEAD_KEYS.some((dead) =>
		dead.match === "exact" ? key === dead.key : key.startsWith(dead.key),
	);
}

/**
 * Run once at renderer boot. Removes keys from features that no longer
 * exist; returns the number of keys removed.
 */
export function sweepDeadPersistedKeys(storage?: Storage): number {
	try {
		const resolvedStorage = storage ?? localStorage;
		const doomed: string[] = [];
		for (let i = 0; i < resolvedStorage.length; i++) {
			const key = resolvedStorage.key(i);
			if (key && matchesDeadKey(key)) doomed.push(key);
		}
		for (const key of doomed) resolvedStorage.removeItem(key);
		return doomed.length;
	} catch (error) {
		console.warn("[persisted-keys] Dead-key sweep failed", error);
		return 0;
	}
}
