import os from "node:os";
import path from "node:path";

/**
 * The hook endpoint is unauthenticated, so a transcript path is only kept
 * when it looks like a harness transcript the host may read: absolute,
 * `.jsonl`, and under the user's home after normalization.
 */
export function isTrustedTranscriptPath(
	transcriptPath: string,
	home: string = os.homedir(),
): boolean {
	const normalized = path.normalize(transcriptPath);
	return (
		path.isAbsolute(normalized) &&
		normalized.endsWith(".jsonl") &&
		(normalized === home || normalized.startsWith(home + path.sep))
	);
}
