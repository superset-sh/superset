const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

/**
 * Temporary kill-switch: MCP is disabled by default for chat-mastra.
 * Set SUPERSET_CHAT_MASTRA_MCP_ENABLED=1 to re-enable without code changes.
 */
export function isMastraMcpEnabled(): boolean {
	const rawFlag = process.env.SUPERSET_CHAT_MASTRA_MCP_ENABLED;
	if (!rawFlag) {
		return false;
	}

	return ENABLED_VALUES.has(rawFlag.trim().toLowerCase());
}
