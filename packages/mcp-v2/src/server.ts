import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import packageJson from "../package.json" with { type: "json" };
import { registerTools } from "./tools/register";

export interface McpServerOptions {
	onToolCall?: (toolName: string, args: Record<string, unknown>) => void;
}

export function createMcpServer(_options?: McpServerOptions): McpServer {
	const server = new McpServer(
		{ name: "superset-v2", version: packageJson.version },
		{ capabilities: { tools: {} } },
	);
	registerTools(server);
	return server;
}
