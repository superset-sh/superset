let quitRequested = false;

export function markAppQuitRequested(): void {
	quitRequested = true;
}

export function resetAppQuitRequested(): void {
	quitRequested = false;
}

export function isAppQuitRequested(): boolean {
	return quitRequested;
}
