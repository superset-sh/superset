const DISABLED_VALUES = new Set(["0", "false", "no", "off"]);

/**
 * MCP is enabled by default for chat-mastra.
 * Set SUPERSET_CHAT_MASTRA_MCP_ENABLED=0 to disable without code changes.
 */
export function isMastraMcpEnabled(): boolean {
	const rawFlag = process.env.SUPERSET_CHAT_MASTRA_MCP_ENABLED;
	if (!rawFlag) {
		return true;
	}

	return !DISABLED_VALUES.has(rawFlag.trim().toLowerCase());
}
