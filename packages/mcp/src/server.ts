import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpContext } from "./auth";
import { registerTools } from "./tools";
import { getMcpContext } from "./tools/utils";

export interface McpServerOptions {
	onToolCall?: (toolName: string, ctx: McpContext) => void;
}

export function createMcpServer(options?: McpServerOptions): McpServer {
	const server = new McpServer(
		{ name: "superset", version: "1.0.0" },
		{ capabilities: { tools: {} } },
	);

	registerTools(server);

	if (options?.onToolCall) {
		// The MCP SDK has no middleware API, so we wrap registered tool handlers
		// directly. _registeredTools is private but stable across SDK versions.
		const tools = (
			server as unknown as {
				_registeredTools: Record<
					string,
					{ handler: { callback: (...args: unknown[]) => unknown } }
				>;
			}
		)._registeredTools;

		for (const [name, tool] of Object.entries(tools)) {
			const original = tool.handler.callback;
			const onToolCall = options.onToolCall;
			tool.handler.callback = (...args: unknown[]) => {
				try {
					const extra = args[1];
					const ctx = getMcpContext(
						extra as Parameters<typeof getMcpContext>[0],
					);
					onToolCall(name, ctx);
				} catch {
					// Don't fail the tool call if tracking fails
				}
				return original(...args);
			};
		}
	}

	return server;
}
