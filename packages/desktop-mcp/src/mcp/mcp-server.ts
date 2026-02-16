import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ConnectionManager } from "./connection/index.js";
import { registerTools } from "./tools/index.js";

export function createMcpServer(): McpServer {
	const server = new McpServer(
		{ name: "desktop-automation", version: "0.1.0" },
		{ capabilities: { tools: {} } },
	);

	const connection = new ConnectionManager();

	registerTools({
		server,
		getPage: () => connection.getPage(),
		consoleCapture: connection.consoleCapture,
	});

	return server;
}
