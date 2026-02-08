import { Ghostty } from "ghostty-web";
// Vite resolves this to a hashed asset URL served from same-origin,
// avoiding the CSP violation that ghostty-web's default inline data: URI triggers.
import wasmUrl from "ghostty-web/ghostty-vt.wasm?url";

let ghosttyInstance: Ghostty | undefined;
let initPromise: Promise<void> | undefined;
let initialized = false;

export function ensureGhosttyInit(): Promise<void> {
	if (initialized) return Promise.resolve();
	if (!initPromise) {
		initPromise = Ghostty.load(wasmUrl).then((ghostty) => {
			ghosttyInstance = ghostty;
			initialized = true;
		});
	}
	return initPromise;
}

export function getGhosttyInstance(): Ghostty {
	if (!ghosttyInstance) {
		throw new Error(
			"Ghostty WASM not initialized. Call ensureGhosttyInit() first.",
		);
	}
	return ghosttyInstance;
}
