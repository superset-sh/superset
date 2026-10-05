import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { HarnessSessionStore } from "./types";

const MAX_DIRS_VISITED = 2000;

/**
 * pi files sessions per working directory, one JSONL each, named
 * `<timestamp>_<session id>.jsonl`. Matching on the id suffix avoids
 * reproducing its directory-name encoding of the cwd.
 */
export const piSessionStore: HarnessSessionStore = {
	hasSession({ sessionId }) {
		const root = join(homedir(), ".pi", "agent", "sessions");
		if (!existsSync(root)) return null;
		const suffix = `_${sessionId}.jsonl`;
		let visited = 0;
		for (const dir of readdirSync(root, { withFileTypes: true })) {
			if (!dir.isDirectory()) continue;
			if (visited++ > MAX_DIRS_VISITED) return null;
			for (const entry of readdirSync(join(root, dir.name))) {
				if (entry.endsWith(suffix)) return true;
			}
		}
		return false;
	},
};
