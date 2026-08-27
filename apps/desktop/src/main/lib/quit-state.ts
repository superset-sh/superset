// Single "app is quitting" flag, set once from before-quit. Lives in its own
// module (like menu-events) so index.ts and windows/main.ts share one flag
// instead of each keeping a parallel boolean set at the same moment.
let appQuitting = false;

export function markAppQuitting(): void {
	appQuitting = true;
}

export function isAppQuitting(): boolean {
	return appQuitting;
}
