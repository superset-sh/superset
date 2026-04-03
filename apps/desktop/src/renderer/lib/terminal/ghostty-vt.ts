import { Ghostty } from "ghostty-web";
import ghosttyWasmUrl from "ghostty-web/ghostty-vt.wasm?url";

let ghosttyPromise: Promise<Ghostty> | null = null;

export function getGhosttyInstance(): Promise<Ghostty> {
	if (!ghosttyPromise) {
		ghosttyPromise = Ghostty.load(ghosttyWasmUrl).catch((error) => {
			ghosttyPromise = null;
			throw error;
		});
	}

	return ghosttyPromise;
}
