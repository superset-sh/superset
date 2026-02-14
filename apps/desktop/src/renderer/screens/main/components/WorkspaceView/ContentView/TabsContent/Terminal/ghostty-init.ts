import { Ghostty } from "ghostty-web";
// Vite resolves this to a serveable URL in dev (/@fs/...) and a hashed asset in production
import wasmUrl from "ghostty-web/ghostty-vt.wasm?url";

let ghosttyInstance: Ghostty | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Ensures the ghostty-web WASM module is loaded and ready.
 * Safe to call multiple times - will only initialize once.
 * Call eagerly at app startup and as a guard before terminal creation.
 */
export async function ensureGhosttyReady(): Promise<void> {
	if (ghosttyInstance) return;
	if (!initPromise) {
		initPromise = Ghostty.load(wasmUrl).then((instance) => {
			ghosttyInstance = instance;
		});
	}
	return initPromise;
}

/**
 * Returns the loaded Ghostty WASM instance.
 * Must call ensureGhosttyReady() first.
 */
export function getGhosttyInstance(): Ghostty {
	if (!ghosttyInstance) {
		throw new Error(
			"ghostty-web not initialized. Call ensureGhosttyReady() first.",
		);
	}
	return ghosttyInstance;
}
