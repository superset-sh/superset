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
		{ capabilities: { tools: {} } },
	);
	registerTools(server, { onToolCall: options?.onToolCall });
	return server;
}
