import { query } from "@anthropic-ai/claude-agent-sdk";
import type { HarnessAdapter } from "../../types";
import { ClaudeAdapter } from "../claudeAdapter";

/**
 * The one place the real SDK is wired in: everything else takes `query`
 * injected so tests never spawn a Claude Code process.
 */
export function createClaudeAdapter(): HarnessAdapter {
	return new ClaudeAdapter({ query });
}
