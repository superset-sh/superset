import { closeSync, openSync, readSync, statSync } from "node:fs";

/**
 * How much of the transcript tail to scan. Context usage lives on the last
 * assistant entry; 256KB comfortably covers even tool-heavy final turns.
 */
const TAIL_BYTES = 256 * 1024;

interface TranscriptUsage {
	input_tokens?: number;
	cache_creation_input_tokens?: number;
	cache_read_input_tokens?: number;
	output_tokens?: number;
}

/**
 * Context tokens currently occupied in a Claude Code session, computed from
 * the session transcript (each assistant entry records the API usage for its
 * request: fresh input + cache reads/writes ≈ the context window in use).
 *
 * Hooks are the trigger but carry no usage data themselves — they do carry
 * `transcript_path`, and the host service can read the file directly. Reads
 * only the tail and parses backwards to the most recent usage entry; returns
 * undefined when the file is missing, unreadable, or has no usage yet (new
 * session, or right after /compact until the next response).
 */
export function readTranscriptContextTokens(
	transcriptPath: string,
): number | undefined {
	let tail: string;
	try {
		const size = statSync(transcriptPath).size;
		const start = Math.max(0, size - TAIL_BYTES);
		const buffer = Buffer.alloc(size - start);
		const fd = openSync(transcriptPath, "r");
		try {
			readSync(fd, buffer, 0, buffer.length, start);
		} finally {
			closeSync(fd);
		}
		tail = buffer.toString("utf-8");
	} catch {
		return undefined;
	}

	const lines = tail.split("\n");
	for (let i = lines.length - 1; i >= 0; i--) {
		const line = lines[i];
		if (!line?.includes('"usage"')) continue;
		try {
			const entry = JSON.parse(line) as {
				message?: { usage?: TranscriptUsage };
			};
			const usage = entry.message?.usage;
			if (!usage || typeof usage.input_tokens !== "number") continue;
			return (
				usage.input_tokens +
				(usage.cache_creation_input_tokens ?? 0) +
				(usage.cache_read_input_tokens ?? 0)
			);
		} catch {
			// Truncated first line of the tail window or a non-JSON line —
			// keep walking backwards.
		}
	}
	return undefined;
}
