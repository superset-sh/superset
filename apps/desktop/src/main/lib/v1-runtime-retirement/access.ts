// Installed by the migration lifecycle; kept separate from runtime ownership
// so the terminal client does not import the coordinator's dependencies.
let isRetired = () => false;

export function setV1RuntimeRetirementCheck(check: () => boolean): void {
	isRetired = check;
}

export function isV1RuntimeRetired(): boolean {
	return isRetired();
}
