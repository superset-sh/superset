import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { HarnessSessionStore } from "./types";

/** Directories walked before giving up; bounds a dialog's filesystem cost. */
const MAX_DIRS_VISITED = 2000;

/** Codex names rollouts `rollout-<timestamp>-<session id>.jsonl`, in date dirs. */
export const codexSessionStore: HarnessSessionStore = {
	hasSession({ sessionId, env }) {
		const home = env?.CODEX_HOME?.trim() || join(homedir(), ".codex");
		const root = join(home, "sessions");
		if (!existsSync(root)) return null;
		const suffix = `-${sessionId}.jsonl`;
		const stack = [root];
		let visited = 0;
		while (stack.length > 0 && visited < MAX_DIRS_VISITED) {
			const dir = stack.pop();
			if (!dir) break;
			visited++;
			for (const entry of readdirSync(dir, { withFileTypes: true })) {
				if (entry.isDirectory()) {
					stack.push(join(dir, entry.name));
				} else if (entry.name.endsWith(suffix)) {
					return true;
				}
			}
		}
		return visited >= MAX_DIRS_VISITED ? null : false;
	},
};
