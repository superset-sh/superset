import { init } from "ghostty-web";

let ghosttyReady = false;
let ghosttyInitPromise: Promise<void> | null = null;

export function isGhosttyReady(): boolean {
	return ghosttyReady;
}

export function ensureGhosttyReady(): Promise<void> {
	if (ghosttyReady) {
		return Promise.resolve();
	}

	if (!ghosttyInitPromise) {
		ghosttyInitPromise = init()
			.then(() => {
				ghosttyReady = true;
			})
			.catch((error) => {
				ghosttyInitPromise = null;
				throw error;
			});
	}

	return ghosttyInitPromise;
}
