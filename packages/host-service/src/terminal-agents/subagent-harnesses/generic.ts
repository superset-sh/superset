import { isRecord } from "../subagent-transcript";
import { parseClaudeSubagentTranscript } from "./claude";
import { parseCodexRolloutTranscript } from "./codex";
import { defineSubagentHarness } from "./types";

/**
 * Fallback for harnesses without a registry entry: trust the hook's paths
 * and pick the parser from the first parseable line — Claude-style records
 * carry a `message`, Codex-style records carry a `payload`.
 */
export const genericSubagentHarness = defineSubagentHarness({
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
});
