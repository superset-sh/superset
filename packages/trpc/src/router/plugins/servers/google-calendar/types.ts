import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";

export type ToolDefinition = Tool;
export type ToolResult = CallToolResult;

export type Handler = (
	args: Record<string, unknown>,
	accessToken: string,
) => Promise<ToolResult>;
