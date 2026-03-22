import { describe, expect, it, mock } from "bun:test";

// Mock DB client to avoid needing a real database connection.
mock.module("@superset/db/client", () => ({
	db: {},
}));

/**
 * Validates that the tool names used by the MCP server (packages/mcp) match
 * the tool names registered in the desktop command watcher
 * (apps/desktop/.../tools/start-agent-session.ts).
 *
 * A mismatch between these names causes the desktop to return
 * "Unknown tool: <name>" when the MCP server dispatches a command via
 * executeOnDevice. See #2707.
 */
describe("MCP ↔ desktop tool name consistency", () => {
	it("MCP tool names match the desktop command watcher registry", async () => {
		const {
			START_AGENT_SESSION_TOOL_NAME,
			START_AGENT_SESSION_WITH_PROMPT_TOOL_NAME,
		} = await import("./shared");

		const { startAgentSession, startAgentSessionWithPrompt } = await import(
			"../../../../../../apps/desktop/src/renderer/routes/_authenticated/components/AgentHooks/hooks/useCommandWatcher/tools/start-agent-session"
		);

		expect(startAgentSession.name).toBe(START_AGENT_SESSION_TOOL_NAME);
		expect(startAgentSessionWithPrompt.name).toBe(
			START_AGENT_SESSION_WITH_PROMPT_TOOL_NAME,
		);
	});

	it("desktop tool registry includes both session launch tools", async () => {
		const { startAgentSession, startAgentSessionWithPrompt } = await import(
			"../../../../../../apps/desktop/src/renderer/routes/_authenticated/components/AgentHooks/hooks/useCommandWatcher/tools/start-agent-session"
		);

		// Rebuild the Map the same way tools/index.ts does
		const tools = [startAgentSession, startAgentSessionWithPrompt];
		const toolsByName = new Map(
			tools.map((t: { name: string }) => [t.name, t]),
		);

		// The exact lookup that executeTool() performs — if this fails,
		// the desktop returns "Unknown tool: start_agent_session_with_prompt"
		expect(toolsByName.has("start_agent_session")).toBe(true);
		expect(toolsByName.has("start_agent_session_with_prompt")).toBe(true);
		expect(toolsByName.size).toBe(2);
	});
});
