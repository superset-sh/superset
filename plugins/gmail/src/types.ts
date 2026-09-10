export const PluginEventType = {
	SYNC: "sync",
	GET_TOOLS: "get-tools",
	CALL_TOOL: "call-tool",
} as const;

export interface PluginConfig {
	access_token: string;
	[key: string]: unknown;
}

export interface ToolDefinition {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
	annotations?: {
		readOnlyHint?: boolean;
		destructiveHint?: boolean;
		idempotentHint?: boolean;
	};
}

export interface ToolResult {
	content: Array<{ type: "text"; text: string }>;
	isError?: boolean;
}

export type PluginEvent =
	| { event: "sync"; eventBody: Record<string, unknown>; config: PluginConfig }
	| {
			event: "get-tools";
			eventBody: Record<string, unknown>;
			config: PluginConfig;
	  }
	| {
			event: "call-tool";
			eventBody: { name: string; arguments?: Record<string, unknown> };
			config: PluginConfig;
	  };

export type PluginResult = ToolDefinition[] | ToolResult | { message: string };

export type Handler = (
	args: Record<string, unknown>,
	accessToken: string,
) => Promise<ToolResult>;
