import type { TerminalPreset } from "@superset/local-db";

export function isPendingCliTerminalScript(
	script: TerminalPreset,
	organizationId: string,
): boolean {
	return (
		script.cliImportPending === true &&
		script.cliTargetOrganizationId === organizationId
	);
}

/**
 * Clear the one-shot CLI import markers once v2 has copied the scripts. The
 * rows stay in the legacy store (v1 keeps showing them, same as presets
 * brought over by the v1 import modal); only the marker goes, so a script
 * deleted in v2 is never re-imported.
 */
export function clearImportedCliTerminalScripts({
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
	const nextScripts = scripts.map((script) => {
		if (
			!acknowledgedIds.has(script.id) ||
			!isPendingCliTerminalScript(script, organizationId)
		)
			return script;
		changed = true;
		const {
			cliImportPending: _pending,
			cliTargetOrganizationId: _target,
			...rest
		} = script;
		return rest;
	});
	return { scripts: nextScripts, changed };
}
