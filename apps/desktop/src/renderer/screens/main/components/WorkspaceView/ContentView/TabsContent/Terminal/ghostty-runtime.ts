import { init } from "ghostty-web";

let ghosttyRuntimePromise: Promise<void> | null = null;

export function ensureGhosttyRuntime(): Promise<void> {
	if (!ghosttyRuntimePromise) {
		ghosttyRuntimePromise = init();
	}

	return ghosttyRuntimePromise;
}
