/**
 * The one writer of a Claude `.claude.json` state file. Claude Code keeps the
 * account identity, onboarding flag and per-project trust entries in the same
 * object, and a running CLI rewrites it whenever it likes, so every Superset
 * write has to be read-modify-write and atomic: a truncated state file signs
 * the user out and re-prompts every folder trust dialog.
 */

import { randomUUID } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";

export type ClaudeState = Record<string, unknown>;

/**
 * Applies `mutate` to the parsed state file and writes the result back
 * tmp-then-rename, owner-only. A missing or unparsable file is treated as
 * empty state — the mutation is what the caller cares about, and refusing
 * would strand the swap on a file Claude Code itself would overwrite.
 */
export async function updateClaudeStateFile(
	statePath: string,
	mutate: (state: ClaudeState) => ClaudeState,
): Promise<void> {
	let state: ClaudeState = {};
	try {
		const parsed: unknown = JSON.parse(await readFile(statePath, "utf-8"));
		if (
			parsed !== null &&
			typeof parsed === "object" &&
			!Array.isArray(parsed)
		) {
			state = parsed as ClaudeState;
		}
	} catch {
		// Missing or corrupt — start from empty state.
	}
	const next = mutate(state);
	const temporaryPath = `${statePath}.${process.pid}.${randomUUID()}.tmp`;
	try {
		await writeFile(temporaryPath, JSON.stringify(next, null, 2), {
			mode: 0o600,
			flag: "wx",
		});
		await rename(temporaryPath, statePath);
	} catch (error) {
		await unlink(temporaryPath).catch(() => {});
		throw error;
	}
}
