// Installed by the migration lifecycle; kept separate from runtime ownership
// so the terminal client does not import the coordinator's dependencies.
// Eligibility blocks new connections even when an attached legacy session
// temporarily prevents shutdown. It does not mean cleanup has completed.
let isBlocked = () => false;

export function setV1RuntimeBlockedCheck(check: () => boolean): void {
	isBlocked = check;
}

export function isV1RuntimeBlocked(): boolean {
	return isBlocked();
}
