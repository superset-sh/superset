/**
 * OpenCode usage. Every assistant message is one small JSON file under
 * `<data>/opencode/storage/message/<sessionID>/msg_*.json` carrying
 * normalized tokens (input is already non-cached — opencode subtracts cache
 * reads/writes itself), the model, the cwd, and a real cost in USD. Session
 * titles live in `<data>/opencode/storage/session/<projectID>/<ses>.json`.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { UsageLogEntry } from "./parse";
import { num } from "./parse";

export function opencodeStorageDir(): string {
	const dataHome =
		process.env.XDG_DATA_HOME?.trim() || join(homedir(), ".local", "share");
	return join(dataHome, "opencode", "storage");
}

interface OpencodeMessage {
	sessionID?: string;
	role?: string;
	time?: { created?: number; completed?: number };
	modelID?: string;
	providerID?: string;
	path?: { cwd?: string };
	cost?: number;
	tokens?: {
		input?: number;
		output?: number;
		reasoning?: number;
		cache?: { read?: number; write?: number };
	};
}

async function readSessionTitles(
	storageDir: string,
	wantedSessions: ReadonlySet<string>,
	sessionLabels: Map<string, string>,
): Promise<void> {
	const sessionRoot = join(storageDir, "session");
	let projectDirs: string[];
	try {
		const entries = await readdir(sessionRoot, { withFileTypes: true });
		projectDirs = entries
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name);
	} catch {
		return;
	}
	for (const projectDir of projectDirs) {
		let files: string[];
		try {
			files = await readdir(join(sessionRoot, projectDir));
		} catch {
			continue;
		}
		for (const file of files) {
			if (!file.endsWith(".json")) continue;
			const sessionId = file.slice(0, -".json".length);
			if (!wantedSessions.has(sessionId) || sessionLabels.has(sessionId)) {
				continue;
			}
			try {
				const raw = await readFile(
					join(sessionRoot, projectDir, file),
					"utf-8",
				);
				const session = JSON.parse(raw) as { title?: string };
				if (typeof session.title === "string" && session.title) {
					sessionLabels.set(sessionId, session.title);
				}
			} catch {
				// Unreadable session metadata — the entries stay unlabeled.
			}
		}
	}
}

/** Returns the number of message files scanned. */
export async function collectOpencodeEntries(
	cutoffMs: number,
	out: UsageLogEntry[],
	sessionLabels?: Map<string, string>,
	storageDir: string = opencodeStorageDir(),
): Promise<number> {
	const messageRoot = join(storageDir, "message");
	let sessionDirs: string[];
	try {
		const entries = await readdir(messageRoot, { withFileTypes: true });
		sessionDirs = entries
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name);
	} catch {
		return 0;
	}

	let scanned = 0;
	const seenSessions = new Set<string>();
	for (const sessionDir of sessionDirs) {
		const dirPath = join(messageRoot, sessionDir);
		// The mtime of the session's message dir bounds every message inside it
		// — skipping old sessions wholesale keeps the scan cheap on heavy users.
		try {
			if ((await stat(dirPath)).mtimeMs < cutoffMs) continue;
		} catch {
			continue;
		}
		let files: string[];
		try {
			files = await readdir(dirPath);
		} catch {
			continue;
		}
		for (const file of files) {
			if (!file.endsWith(".json")) continue;
			scanned++;
			let message: OpencodeMessage;
			try {
				message = JSON.parse(await readFile(join(dirPath, file), "utf-8"));
			} catch {
				continue;
			}
			if (message.role !== "assistant") continue;
			const timestampMs = num(message.time?.completed ?? message.time?.created);
			if (!timestampMs || timestampMs < cutoffMs) continue;
			const tokens = message.tokens;
			if (!tokens) continue;
			const uncachedInput = num(tokens.input);
			const cachedInput = num(tokens.cache?.read);
			const cacheWrite = num(tokens.cache?.write);
			const output = num(tokens.output);
			if (uncachedInput + cachedInput + cacheWrite + output === 0) continue;

			const sessionId = message.sessionID ?? sessionDir;
			seenSessions.add(sessionId);
			const cost = num(message.cost);
			out.push({
				agent: "opencode",
				model: message.modelID || "unknown",
				timestampMs,
				cwd: typeof message.path?.cwd === "string" ? message.path.cwd : null,
				sessionId,
				uncachedInput,
				cachedInput,
				cacheWrite5m: cacheWrite,
				cacheWrite1h: 0,
				output,
				reasoningOutput: num(tokens.reasoning),
				...(cost > 0 ? { costUsd: cost } : {}),
			});
		}
	}

	if (sessionLabels && seenSessions.size > 0) {
		await readSessionTitles(storageDir, seenSessions, sessionLabels);
	}
	return scanned;
}
