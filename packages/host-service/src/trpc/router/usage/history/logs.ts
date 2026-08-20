import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

export interface LogFile {
	path: string;
	mtimeMs: number;
}

/**
 * Recursively collects `.jsonl` files under `root` modified within
 * `maxAgeDays`. The mtime cutoff keeps the scan bounded on heavy users —
 * transcript dirs grow to multiple GB, but old files never change.
 *
 * Directory symlinks are NOT followed: a cycle would re-collect the same
 * files many times over (verified: one file became 16 before ELOOP kicked
 * in), and a benign `~/.config/claude → ~/.claude` symlink would silently
 * double-count Codex usage.
 */
export async function collectLogFiles(
	root: string,
	maxAgeDays: number,
): Promise<LogFile[]> {
	const cutoffMs = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
	const results: LogFile[] = [];

	async function walk(dir: string): Promise<void> {
		let entries: Dirent[];
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const path = join(dir, entry.name);
			// Dirent types never follow symlinks, so symlinked dirs are skipped.
			if (entry.isDirectory()) {
				await walk(path);
			} else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
				try {
					const info = await stat(path);
					if (info.mtimeMs >= cutoffMs) {
						results.push({ path, mtimeMs: info.mtimeMs });
					}
				} catch {
					// Vanished mid-scan.
				}
			}
		}
	}

	await walk(root);
	return results;
}

/** Dedupes collected files by path — overlapping roots must not double-count. */
export function dedupeLogFiles(files: LogFile[]): LogFile[] {
	const byPath = new Map<string, LogFile>();
	for (const file of files) {
		byPath.set(file.path, file);
	}
	return [...byPath.values()];
}
