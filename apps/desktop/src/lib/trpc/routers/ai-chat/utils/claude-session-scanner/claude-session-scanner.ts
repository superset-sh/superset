import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface ClaudeSessionInfo {
	sessionId: string;
	project: string;
	cwd: string;
	gitBranch: string | null;
	display: string;
	timestamp: number;
}

function decodeProjectDir(encoded: string): string {
	return encoded.replace(/-/g, "/");
}

/**
 * Reads the second line of a session JSONL to extract metadata.
 * Line 0 = file-history-snapshot, Line 1 = first user message with sessionId, cwd, gitBranch, etc.
 */
async function readSessionMeta(
	filePath: string,
): Promise<{
	sessionId: string;
	cwd: string;
	gitBranch: string | null;
	display: string;
	timestamp: number;
} | null> {
	try {
		const handle = await readFile(filePath, "utf-8");
		// Only read until we find the first user message (usually line index 1)
		const lines = handle.split("\n", 5);
		for (const line of lines) {
			if (!line.trim()) continue;
			try {
				const parsed = JSON.parse(line);
				if (parsed.type === "user" && parsed.sessionId) {
					return {
						sessionId: parsed.sessionId,
						cwd: parsed.cwd ?? "",
						gitBranch: parsed.gitBranch ?? null,
						display:
							typeof parsed.message?.content === "string"
								? parsed.message.content.slice(0, 200)
								: "",
						timestamp: parsed.timestamp
							? new Date(parsed.timestamp).getTime()
							: 0,
					};
				}
			} catch {
				// skip non-JSON lines
			}
		}
		return null;
	} catch {
		return null;
	}
}

/**
 * Scans ~/.claude/projects/ for all resumable Claude Code sessions.
 * Returns session metadata sorted by most recent first.
 */
export async function scanClaudeSessions(): Promise<ClaudeSessionInfo[]> {
	const projectsDir = join(homedir(), ".claude", "projects");

	let projectDirs: string[];
	try {
		projectDirs = await readdir(projectsDir);
	} catch {
		return [];
	}

	const sessions: ClaudeSessionInfo[] = [];

	const scanPromises = projectDirs.map(async (projectDir) => {
		const fullProjectDir = join(projectsDir, projectDir);
		let files: string[];
		try {
			files = await readdir(fullProjectDir);
		} catch {
			return;
		}

		const sessionFiles = files.filter(
			(f) => f.endsWith(".jsonl") && UUID_RE.test(f.replace(".jsonl", "")),
		);

		const metaPromises = sessionFiles.map(async (file) => {
			const filePath = join(fullProjectDir, file);
			const meta = await readSessionMeta(filePath);
			if (meta) {
				sessions.push({
					...meta,
					project: decodeProjectDir(projectDir),
				});
			}
		});

		await Promise.all(metaPromises);
	});

	await Promise.all(scanPromises);

	sessions.sort((a, b) => b.timestamp - a.timestamp);
	return sessions;
}
