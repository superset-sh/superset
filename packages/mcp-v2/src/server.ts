import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import packageJson from "../package.json" with { type: "json" };
import type { McpToolCallEmitter } from "./define-tool";
import { registerTools } from "./tools/register";

export interface McpServerOptions {
	onToolCall?: McpToolCallEmitter;
}

export function createMcpServer(options?: McpServerOptions): McpServer {
	const server = new McpServer(
		{ name: "superset-v2", version: packageJson.version },
		{
			capabilities: { tools: {} },
			instructions:
				"Superset orchestrates parallel AI coding agents in isolated Git worktrees on a user's registered machines. Use these tools to manage tasks, create workspaces (branch- or PR-scoped worktrees), launch coding-agent sessions, open terminals, and schedule recurring automations on behalf of the authenticated user. IDs are host-scoped: call hosts_list first, then projects_list/workspaces_list on that host. Tools annotated destructive (deletes) remove real user data — confirm with the user before calling them.",
		},
	);
	registerTools(server, { onToolCall: options?.onToolCall });
	return server;
}
