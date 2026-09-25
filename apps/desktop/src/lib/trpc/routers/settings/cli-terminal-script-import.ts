import type { TerminalPreset } from "@superset/local-db";

/**
 * A row the CLI flagged for this organization: either a new/edited script to
 * copy into v2 (cliImportPending) or a tombstone whose v2 copy must go
 * (cliDeletePending).
 */
export function isPendingCliTerminalScript(
	script: TerminalPreset,
	organizationId: string,
): boolean {
	return (
		(script.cliImportPending === true || script.cliDeletePending === true) &&
		script.cliTargetOrganizationId === organizationId
	);
}

/**
 * Settle the one-shot CLI markers once v2 has applied them. Imported rows
 * stay in the legacy store (v1 keeps showing them, same as presets brought
 * over by the v1 import modal); only the marker goes, so a script deleted in
 * v2 is never re-imported. Tombstones are dropped entirely: the user deleted
 * the script, and `superset scripts list` reads this store.
 */
export function acknowledgeCliTerminalScripts({
	scripts,
	organizationId,
	ids,
}: {
	scripts: TerminalPreset[];
	organizationId: string;
	ids: readonly string[];
}): { scripts: TerminalPreset[]; changed: boolean } {
	const acknowledgedIds = new Set(ids);
	let changed = false;
	const nextScripts: TerminalPreset[] = [];
	for (const script of scripts) {
		if (
			!acknowledgedIds.has(script.id) ||
			!isPendingCliTerminalScript(script, organizationId)
		) {
			nextScripts.push(script);
			continue;
		}
		changed = true;
		if (script.cliDeletePending) continue;
		const {
			cliImportPending: _pending,
			cliTargetOrganizationId: _target,
			...rest
		} = script;
		nextScripts.push(rest);
	}
	return { scripts: nextScripts, changed };
}
