import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Claude Code has no documented API, hook payload field, or IPC channel for
 * a session's `/color` or auto-generated title — both are only ever appended
 * as discrete lines into the session's own transcript file:
 *
 *   {"type":"agent-color","agentColor":"yellow","sessionId":"..."}
 *   {"type":"ai-title","aiTitle":"...","sessionId":"..."}
 *
 * A user-set title (via `/rename`) instead appends as:
 *
 *   {"type":"custom-title","customTitle":"...","sessionId":"..."}
 *
 * (also duplicated as a `agent-name`/`agentName` line, which we ignore in
 * favor of `custom-title` since both carry the same value.)
 *
 * This is confirmed by direct empirical testing, not documentation — Claude
 * Code's own docs warn the transcript format is internal and can change
 * between versions. All parsing here is defensive: any failure yields
 * `undefined` fields rather than throwing, so a format change degrades to
 * "no title/color shown", never a crash.
 */

/**
 * Replicates Claude Code's `~/.claude/projects/<encoded-cwd>` directory
 * naming: every non-alphanumeric character in the absolute cwd (including
 * `/` and `.`) is replaced 1:1 with `-` (no collapsing of runs).
 */
export function encodeProjectDirName(cwd: string): string {
	return cwd.replace(/[^a-zA-Z0-9]/g, "-");
}

export function resolveTranscriptPath(cwd: string, sessionId: string): string {
	return join(
		homedir(),
		".claude",
		"projects",
		encodeProjectDirName(cwd),
		`${sessionId}.jsonl`,
	);
}

export interface TranscriptColorAndTitle {
	color?: string;
	title?: string;
}

/**
 * Scans the transcript for the most recent `agent-color`/`ai-title` lines.
 * The file is append-only and can grow to the low megabytes over a long
 * session, so this reads the whole file rather than tracking a byte offset —
 * simplicity over micro-optimizing a rarely-large, rarely-changing file.
 */
export function readLatestColorAndTitle(
	transcriptPath: string,
): TranscriptColorAndTitle {
	let contents: string;
	try {
		contents = readFileSync(transcriptPath, "utf8");
	} catch {
		return {};
	}

	let color: string | undefined;
	let aiTitle: string | undefined;
	let customTitle: string | undefined;

	for (const line of contents.split("\n")) {
		if (!line) continue;
		let parsed: unknown;
		try {
			parsed = JSON.parse(line);
		} catch {
			continue;
		}
		if (typeof parsed !== "object" || parsed === null) continue;
		const record = parsed as Record<string, unknown>;
		if (
			record.type === "agent-color" &&
			typeof record.agentColor === "string"
		) {
			color = record.agentColor;
		} else if (
			record.type === "ai-title" &&
			typeof record.aiTitle === "string"
		) {
			aiTitle = record.aiTitle;
		} else if (
			record.type === "custom-title" &&
			typeof record.customTitle === "string"
		) {
			customTitle = record.customTitle;
		}
	}

	// A user's `/rename` (custom-title) must always win over Claude's
	// auto-generated title, regardless of which line appears later in the
	// file — Claude's auto-titling isn't gated by "user already renamed",
	// so an ai-title line can land after a custom-title line and would
	// otherwise clobber the user's explicit rename on the next scan.
	return { color, title: customTitle ?? aiTitle };
}
