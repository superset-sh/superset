import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTaskLaunchTool } from "./start-agent-session";
import { registerPromptLaunchTool } from "./start-agent-session-with-prompt";

export function register(server: McpServer) {
	registerTaskLaunchTool(server);
	registerPromptLaunchTool(server);
}
