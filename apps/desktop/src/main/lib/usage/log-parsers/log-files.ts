import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface LogFile {
	path: string;
	/** Filename without extension; used as a session identifier. */
	sessionId: string;
	mtimeMs: number;
}

/**
 * Recursively collect files under `root` whose name ends with `ext` and were
 * modified within `maxAgeDays`. Returns [] when the root is missing or unreadable.
 */
export async function collectLogFiles(
	root: string,
	ext: string,
	maxAgeDays: number,
): Promise<LogFile[]> {
	const cutoff = Date.now() - maxAgeDays * DAY_MS;
	const results: LogFile[] = [];

	async function walk(dir: string): Promise<void> {
		let entries: Dirent[];
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				await walk(full);
				continue;
			}
			if (!entry.name.endsWith(ext)) continue;
			try {
				const info = await stat(full);
				if (info.mtimeMs < cutoff) continue;
				results.push({
					path: full,
					sessionId: entry.name.slice(0, -ext.length),
					mtimeMs: info.mtimeMs,
				});
			} catch {
				// File vanished between readdir and stat; skip.
			}
		}
	}

	await walk(root);
	return results;
}
