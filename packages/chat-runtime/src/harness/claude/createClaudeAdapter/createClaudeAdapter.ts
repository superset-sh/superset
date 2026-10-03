import { query } from "@anthropic-ai/claude-agent-sdk";
import type { HarnessAdapter } from "../../types";
import type { ClaudeAdapterOptions } from "../claudeAdapter";
import { ClaudeAdapter } from "../claudeAdapter";

/**
 * The one place the real SDK is wired in: everything else takes `query`
 * injected so tests never spawn a Claude Code process.
 */
export function createClaudeAdapter(options?: {
	pathToClaudeCodeExecutable?: string;
	launch?: ClaudeAdapterOptions["launch"];
}): HarnessAdapter {
	return new ClaudeAdapter({
		query,
		pathToClaudeCodeExecutable: options?.pathToClaudeCodeExecutable,
		launch: options?.launch,
	});
}
