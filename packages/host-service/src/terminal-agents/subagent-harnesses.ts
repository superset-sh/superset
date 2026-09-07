import fs from "node:fs";
import path from "node:path";
import type { AgentIdentityId } from "@superset/shared/agent-catalog";
import {
	parseClaudeSubagentTranscript,
	parseCodexRolloutTranscript,
	readTranscriptTail,
	type SubagentTranscript,
	type SubagentTranscriptEntry,
} from "./subagent-transcript";

/**
 * What a hook event inside a subagent tells us about where its transcript
 * lives. `transcriptPath` is the file the hook ran against and
 * `agentTranscriptPath` names the child directly when the harness sends it
 * (SubagentStop, in the Claude schema and its forks).
 */
export interface SubagentTranscriptHint {
	subagentId: string;
	sessionId?: string;
	transcriptPath?: string;
	agentTranscriptPath?: string;
}

/**
 * The harness-specific half of subagent support: where a child's transcript
 * is and how to read it. Everything else — the hook wire format keyed on
 * `agent_id`, the roster, the sidebar, the pane — is agent-agnostic.
 *
 * To support a new harness, add an entry to {@link SUBAGENT_HARNESSES}. A
 * harness with no entry gets {@link genericHarness}: the hook's paths are
 * used as given and the file format is detected per line.
 */
export interface SubagentHarness {
	resolveTranscriptPath(hint: SubagentTranscriptHint): string | undefined;
	parseTranscript(text: string): {
		entries: SubagentTranscriptEntry[];
		description?: string;
	};
	/** A title for the child from beside its transcript, if the harness keeps one. */
	readDescription?(transcriptPath: string): string | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

const pathAsGiven = (hint: SubagentTranscriptHint): string | undefined =>
	hint.agentTranscriptPath || hint.transcriptPath || undefined;

/**
 * Claude Code: hooks inside a child run against the parent session file
 * (`<dir>/<sessionId>.jsonl`, same session id as the parent) while the child
 * writes `<dir>/<sessionId>/subagents/agent-<id>.jsonl` with an
 * `agent-<id>.meta.json` sidecar carrying the Task description.
 */
const claudeHarness: SubagentHarness = {
	resolveTranscriptPath(hint) {
		if (hint.agentTranscriptPath) return hint.agentTranscriptPath;
		const { transcriptPath, sessionId, subagentId } = hint;
		if (!transcriptPath) return undefined;
		if (sessionId && path.basename(transcriptPath) === `${sessionId}.jsonl`) {
			return path.join(
				path.dirname(transcriptPath),
				sessionId,
				"subagents",
				`agent-${subagentId}.jsonl`,
			);
		}
		return transcriptPath;
	},
	parseTranscript: (text) => ({ entries: parseClaudeSubagentTranscript(text) }),
	readDescription(transcriptPath) {
		const metaPath = transcriptPath.replace(/\.jsonl$/, ".meta.json");
		try {
			const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
			return isRecord(meta) && typeof meta.description === "string"
				? meta.description
				: undefined;
		} catch {
			return undefined;
		}
	},
};

/**
 * Codex: a spawned child is its own thread with its own rollout file, and
 * its hooks run against that file, so the hook's path is the child's.
 */
const codexHarness: SubagentHarness = {
	resolveTranscriptPath: pathAsGiven,
	parseTranscript: parseCodexRolloutTranscript,
};

/**
 * Fallback for harnesses without an entry: trust the hook's paths and pick
 * the parser from the first parseable line — Claude-style records carry a
 * `message`, Codex-style records carry a `payload`.
 */
const genericHarness: SubagentHarness = {
	resolveTranscriptPath: pathAsGiven,
	parseTranscript(text) {
		for (const line of text.split("\n")) {
			if (!line.trim()) continue;
			let record: unknown;
			try {
				record = JSON.parse(line);
			} catch {
				continue;
			}
			if (!isRecord(record)) continue;
			if (isRecord(record.message)) {
				return { entries: parseClaudeSubagentTranscript(text) };
			}
			if (isRecord(record.payload)) return parseCodexRolloutTranscript(text);
		}
		return { entries: [] };
	},
};

export const SUBAGENT_HARNESSES: Partial<
	Record<AgentIdentityId, SubagentHarness>
> = {
	claude: claudeHarness,
	codex: codexHarness,
};

export function getSubagentHarness(
	agentId: string | undefined,
): SubagentHarness {
	return (
		(agentId && SUBAGENT_HARNESSES[agentId as AgentIdentityId]) ||
		genericHarness
	);
}

/** The child's transcript path for the parent binding's harness. */
export function resolveSubagentTranscriptPath(
	agentId: string | undefined,
	hint: SubagentTranscriptHint,
): string | undefined {
	return getSubagentHarness(agentId).resolveTranscriptPath(hint);
}

/**
 * Read and parse a child transcript for the parent binding's harness.
 * Returns null when the file does not exist yet — a child that has not
 * flushed its first record — so the pane can keep polling.
 */
export function readSubagentTranscript(
	agentId: string | undefined,
	transcriptPath: string,
): SubagentTranscript | null {
	const tail = readTranscriptTail(transcriptPath);
	if (!tail) return null;
	const harness = getSubagentHarness(agentId);
	const parsed = harness.parseTranscript(tail.text);
	return {
		entries: parsed.entries,
		description:
			parsed.description ?? harness.readDescription?.(transcriptPath),
		size: tail.size,
		mtimeMs: tail.mtimeMs,
	};
}
