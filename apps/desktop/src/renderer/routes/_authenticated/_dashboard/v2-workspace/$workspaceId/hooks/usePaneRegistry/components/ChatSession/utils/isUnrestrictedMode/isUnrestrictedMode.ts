const UNRESTRICTED_MODE_IDS = new Set([
	"bypassPermissions",
	"full-access",
	"agent-full-access",
]);

export function isUnrestrictedMode(modeId: string | undefined): boolean {
	return modeId !== undefined && UNRESTRICTED_MODE_IDS.has(modeId);
}
