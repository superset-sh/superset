import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
	CallToolResult,
	ServerNotification,
	ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";
import type { McpContext } from "../../auth";

type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification> & {
	authInfo?: AuthInfo & { extra?: { mcpContext?: McpContext } };
};

// biome-ignore lint/suspicious/noExplicitAny: Zod schemas vary
type ZodShape = Record<string, any>;

/**
 * Helper to create a successful tool result with structured content.
 * Per MCP spec, returns both text (backwards compat) and structuredContent (typed).
 */
export function toolResult<T extends Record<string, unknown>>(
	data: T,
): CallToolResult & { structuredContent: T } {
	return {
		content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
		structuredContent: data,
	};
}

/**
 * Helper to create an error tool result.
 */
export function toolError(message: string): CallToolResult {
	return {
		content: [{ type: "text", text: `Error: ${message}` }],
		isError: true,
	};
}

/**
 * Register a typesafe MCP tool.
 * Pass Zod schemas for inputSchema and outputSchema.
 * Use toolResult() helper to return typed structuredContent.
 */
export function registerTool(
	name: string,
	config: {
		description: string;
		inputSchema: ZodShape;
		outputSchema?: ZodShape;
	},
	handler: (
		params: Record<string, unknown>,
		ctx: McpContext,
	) => Promise<CallToolResult>,
) {
	return (server: McpServer) => {
		server.registerTool(
			name,
			{
				description: config.description,
				inputSchema: config.inputSchema,
				outputSchema: config.outputSchema,
			},
			async (params, extra) => {
				const ctx = (extra as ToolExtra).authInfo?.extra?.mcpContext;
				if (!ctx) {
					throw new Error("No MCP context available - authentication required");
				}
				return handler(params as Record<string, unknown>, ctx);
			},
		);
	};
}
