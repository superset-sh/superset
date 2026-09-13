import os from "node:os";
import path from "node:path";
import type { AgentIdentityId } from "@superset/shared/agent-catalog";
import {
	readTranscriptTail,
	type SubagentTranscript,
} from "../subagent-transcript";
import { claudeSubagentHarness } from "./claude";
import { codexSubagentHarness } from "./codex";
import { genericSubagentHarness } from "./generic";
import type { SubagentHarness } from "./types";

export type {
	ParsedSubagentTranscript,
	SubagentHarness,
	SubagentParentContext,
	SubagentParentResolution,
	SubagentTranscriptHint,
} from "./types";
export { defineSubagentHarness } from "./types";

/**
 * Subagent support per harness, keyed by the parent binding's agent id. A
 * harness without an entry gets the generic one: hook paths as given and
 * the transcript format detected per line.
 */
export const SUBAGENT_HARNESSES: Partial<
	Record<AgentIdentityId, SubagentHarness>
> = {
	claude: claudeSubagentHarness,
	codex: codexSubagentHarness,
};

export function getSubagentHarness(
	agentId: string | undefined,
): SubagentHarness {
	return (
		(agentId && SUBAGENT_HARNESSES[agentId as AgentIdentityId]) ||
		genericSubagentHarness
	);
}

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

/**
 * Read and parse a child transcript with its harness. Null when the file
 * does not exist yet — a child that has not flushed its first record — so
 * the pane can keep polling.
 */
export function readSubagentTranscript(
	harness: SubagentHarness,
	transcriptPath: string,
): SubagentTranscript | null {
	const tail = readTranscriptTail(transcriptPath);
	if (!tail) return null;
	const parsed = harness.parseTranscript(tail.text);
	return {
		entries: parsed.entries,
		description: parsed.description ?? harness.readDescription(transcriptPath),
		size: tail.size,
		mtimeMs: tail.mtimeMs,
	};
}
