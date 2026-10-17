import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import * as zlib from "node:zlib";
import { sessionIdForFile } from "./parse";

export interface LogFile {
	path: string;
	mtimeMs: number;
}

/** The CLI's bundled Node 22.13 predates zstd in node:zlib (added in 22.15). */
export const canReadCompressedLogs =
	typeof zlib.createZstdDecompress === "function";

/**
 * Recursively collects `.jsonl` files under `root` modified within
 * `maxAgeDays`, plus `.jsonl.zst` files when `compressed` is set and the
 * runtime can read them. The mtime cutoff keeps the scan bounded on heavy
 * users — transcript dirs grow to multiple GB, but old files never change.
 *
 * Directory symlinks are NOT followed: a cycle would re-collect the same
 * files many times over (verified: one file became 16 before ELOOP kicked
 * in), and a benign `~/.config/claude → ~/.claude` symlink would silently
 * double-count Codex usage.
 */
export async function collectLogFiles(
	root: string,
	maxAgeDays: number,
	{ compressed = false }: { compressed?: boolean } = {},
): Promise<LogFile[]> {
	const cutoffMs = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
	const includeCompressed = compressed && canReadCompressedLogs;
	const results: LogFile[] = [];

	async function walk(dir: string): Promise<void> {
		let entries: Dirent[];
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}
		const isLogFile = (name: string) =>
			name.endsWith(".jsonl") ||
			(includeCompressed && name.endsWith(".jsonl.zst"));
		for (const entry of entries) {
			const path = join(dir, entry.name);
			// Dirent types never follow symlinks, so symlinked dirs are skipped.
			if (entry.isDirectory()) {
				await walk(path);
			} else if (entry.isFile() && isLogFile(entry.name)) {
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

/**
 * Keeps one file per rollout name, preferring the plain one. Codex
 * publishes the `.jsonl.zst` before it deletes the `.jsonl`, and it moves
 * rollouts between sessions/ and archived_sessions/, so one scan can see a
 * rollout twice.
 */
export function dedupeRolloutFiles(files: LogFile[]): LogFile[] {
	const byRollout = new Map<string, LogFile>();
	for (const file of files) {
		const rollout = sessionIdForFile(file.path);
		if (byRollout.get(rollout)?.path.endsWith(".jsonl") !== true) {
			byRollout.set(rollout, file);
		}
	}
	return [...byRollout.values()];
}
