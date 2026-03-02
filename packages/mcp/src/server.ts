import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools";

export function createMcpServer(): McpServer {
	const server = new McpServer(
		{ name: "superset", version: "1.0.0" },
		{ capabilities: { tools: {} } },
	);
	registerTools(server);
	return server;
}
